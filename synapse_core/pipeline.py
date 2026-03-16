import hashlib
from pathlib import Path
from typing import Callable, List, Optional

import chromadb
from chromadb.errors import NotFoundError as ChromaNotFoundError
from chromadb.utils import embedding_functions

from .chunker import chunk_text
from .exceptions import CollectionNotFoundError, SourceNotFoundError
from .extractors import extract, extract_metadata, extract_streaming, is_supported, supports_streaming
from .logger import logger
from .models import IngestProgress, IngestResult, PurgeResult, QueryResult


def _make_id(file_path: Path, source_dir: Path, chunk_index: int) -> str:
    """Stable unique ID based on relative path — portable across machine moves."""
    try:
        rel = file_path.relative_to(source_dir)
    except ValueError:
        rel = file_path.resolve()
    key = f"{rel}::{chunk_index}"
    return hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()


def _file_hash(path: Path) -> str:
    """SHA-256 of the file's raw bytes."""
    return hashlib.sha256(path.read_bytes(), usedforsecurity=False).hexdigest()


def _get_source_chunks(collection, source_str: str) -> dict:
    """Return all ChromaDB entries for a given source path."""
    return collection.get(
        where={"source": {"$eq": source_str}},
        include=["metadatas"],
    )


def _get_collection(db_path: str, collection_name: str, embedding_model: str, create: bool = True):
    client = chromadb.PersistentClient(path=db_path)
    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=embedding_model
    )
    if create:
        collection = client.get_or_create_collection(
            name=collection_name,
            embedding_function=ef,  # type: ignore[arg-type]
            metadata={"embedding_model": embedding_model},
        )
        # Warn if this collection was created with a different model.
        # collection.metadata is only a dict when set explicitly; MagicMocks
        # and pre-v0.6.1 collections (no metadata) are skipped safely.
        stored_model = (
            collection.metadata.get("embedding_model")
            if isinstance(collection.metadata, dict)
            else None
        )
        if stored_model and stored_model != embedding_model:
            logger.warning(
                "Embedding model mismatch in collection '%s': "
                "stored='%s', requested='%s'. "
                "Vectors may be incompatible — consider running reset() and re-ingesting.",
                collection_name, stored_model, embedding_model,
            )
        return collection
    return client.get_collection(
        name=collection_name, embedding_function=ef  # type: ignore[arg-type]
    )


_STREAM_BATCH = 100  # max chunks per ChromaDB upsert call during streaming


def _ingest_file_streaming(
    file_path: Path,
    source_dir: Path,
    collection,
    source_str: str,
    chunk_size: int,
    overlap: int,
    min_chunk_size: int,
    mode: str,
    doc_meta: dict,
    incremental: bool,
    current_hash: str,
) -> int:
    """Stream a large text file through the chunker, upserting in small batches.

    Keeps at most ``(chunk_size + overlap)`` chars in memory between pages —
    O(chunk_size) instead of O(file_size).  Returns total chunks stored.
    """
    tail_size = chunk_size + overlap  # chars to carry between pages for overlap continuity
    carry = ""
    chunk_idx = 0
    buf_docs: list[str] = []
    buf_ids: list[str] = []
    buf_metas: list[dict] = []

    def _flush() -> None:
        if buf_docs:
            collection.upsert(documents=buf_docs[:], ids=buf_ids[:], metadatas=buf_metas[:])  # type: ignore[arg-type]
            buf_docs.clear()
            buf_ids.clear()
            buf_metas.clear()

    def _add(chunk: str) -> None:
        nonlocal chunk_idx
        meta: dict = {"source_type": "file", "source": source_str, "chunk": chunk_idx, **doc_meta}
        if incremental and current_hash:
            meta["file_hash"] = current_hash
        buf_docs.append(chunk)
        buf_ids.append(_make_id(file_path, source_dir, chunk_idx))
        buf_metas.append(meta)
        chunk_idx += 1
        if len(buf_docs) >= _STREAM_BATCH:
            _flush()

    for block in extract_streaming(file_path):
        text = carry + block
        if len(text) > tail_size * 2:
            safe_end = len(text) - tail_size
            for ch in chunk_text(text[:safe_end], chunk_size=chunk_size, overlap=overlap,
                                  min_chunk_size=min_chunk_size, mode=mode):
                _add(ch)
            carry = text[max(0, safe_end - overlap):]
        else:
            carry = text  # accumulate until we have a workable window

    if carry.strip():
        for ch in chunk_text(carry, chunk_size=chunk_size, overlap=overlap,
                              min_chunk_size=min_chunk_size, mode=mode):
            _add(ch)

    _flush()
    return chunk_idx


def ingest(
    source_dir: str = "./docs",
    db_path: str = "./synapse_db",
    collection_name: str = "synapse",
    chunk_size: int = 1000,
    overlap: int = 200,
    min_chunk_size: int = 50,
    embedding_model: str = "all-MiniLM-L6-v2",
    incremental: bool = False,
    chunking: str = "word",
    verbose: bool = True,
    streaming_threshold: int = 50 * 1024 * 1024,
    on_progress: Optional[Callable[[IngestProgress], None]] = None,
) -> IngestResult:
    """
    Scan source_dir for supported files, extract text, chunk it,
    embed it and store everything in a local ChromaDB collection.

    Args:
        source_dir:           Directory containing files to ingest.
        db_path:              Path where ChromaDB persists data.
        collection_name:      Name of the ChromaDB collection.
        chunk_size:           Target character count per chunk.
        overlap:              Character overlap between consecutive chunks.
        min_chunk_size:       Discard chunks shorter than this (chars).
        embedding_model:      SentenceTransformer model name.
        incremental:          Skip files whose content hash hasn't changed since
                              the last ingest. Changed files are re-ingested.
        chunking:             "word" (default) or "sentence" (requires nltk).
        verbose:              Emit progress via the synapse_core logger.
        streaming_threshold:  Files larger than this many bytes are paged
                              through the chunker instead of being fully loaded
                              into memory (text-based formats only).
                              Set to 0 to disable streaming. Default: 50 MB.
        on_progress:          Optional callback invoked after each file is
                              processed. Receives an :class:`IngestProgress`
                              instance. Useful for tqdm integration or custom UIs.
    """
    source = Path(source_dir)
    if not source.exists():
        raise SourceNotFoundError(f"Source directory not found: {source}")

    files = [f for f in source.rglob("*") if f.is_file() and is_supported(f)]
    result = IngestResult(sources_found=len(files))

    if not files:
        if verbose:
            logger.info("No supported files found in %s", source)
        return result

    collection = _get_collection(db_path, collection_name, embedding_model)

    files_done = 0
    for file_path in files:
        source_str = str(file_path.resolve())
        current_hash = ""
        _status: str = "skipped"
        _skip_reason: str = ""

        try:
            if incremental:
                current_hash = _file_hash(file_path)
                existing = _get_source_chunks(collection, source_str)
                if existing["ids"]:
                    stored_hash = existing["metadatas"][0].get("file_hash")
                    if stored_hash == current_hash:
                        if verbose:
                            logger.info("Skipping (unchanged): %s", file_path.name)
                        _skip_reason = "hash_match"
                        result.sources_skipped += 1
                        continue
                    # File changed — delete stale chunks before re-ingesting
                    collection.delete(ids=existing["ids"])

            if verbose:
                logger.info("Ingesting: %s", file_path.name)

            use_streaming = (
                streaming_threshold > 0
                and file_path.stat().st_size > streaming_threshold
                and supports_streaming(file_path)
            )

            if use_streaming:
                try:
                    doc_meta = extract_metadata(file_path)
                    n = _ingest_file_streaming(
                        file_path, source, collection, source_str,
                        chunk_size, overlap, min_chunk_size, chunking,
                        doc_meta, incremental, current_hash,
                    )
                except Exception as e:
                    if verbose:
                        logger.warning("[skip] %s: %s", file_path.name, e)
                    _status = "error"
                    _skip_reason = f"extract_error: {e}"
                    result.sources_skipped += 1
                    continue

                if n == 0:
                    if verbose:
                        logger.warning("[skip] %s: no text extracted", file_path.name)
                    _skip_reason = "empty"
                    result.sources_skipped += 1
                    continue

                result.sources_ingested += 1
                result.chunks_stored += n
                _status = "ingested"
                if verbose:
                    logger.info("  -> %d chunks stored (streamed)", n)

            else:
                try:
                    text = extract(file_path)
                except Exception as e:
                    if verbose:
                        logger.warning("[skip] %s: %s", file_path.name, e)
                    _status = "error"
                    _skip_reason = f"extract_error: {e}"
                    result.sources_skipped += 1
                    continue

                chunks = chunk_text(
                    text,
                    chunk_size=chunk_size,
                    overlap=overlap,
                    min_chunk_size=min_chunk_size,
                    mode=chunking,
                )
                if not chunks:
                    if verbose:
                        logger.warning("[skip] %s: no text extracted", file_path.name)
                    _skip_reason = "empty"
                    result.sources_skipped += 1
                    continue

                ids = [_make_id(file_path, source, i) for i in range(len(chunks))]
                doc_meta = extract_metadata(file_path)
                metadatas = [
                    {"source_type": "file", "source": source_str, "chunk": i, **doc_meta}
                    for i in range(len(chunks))
                ]
                if incremental:
                    for meta in metadatas:
                        meta["file_hash"] = current_hash

                # Upsert so re-running is idempotent
                collection.upsert(documents=chunks, ids=ids, metadatas=metadatas)  # type: ignore[arg-type]
                result.sources_ingested += 1
                result.chunks_stored += len(chunks)
                _status = "ingested"
                if verbose:
                    logger.info("  -> %d chunks stored", len(chunks))

        finally:
            files_done += 1
            if _skip_reason:
                result.skipped_reasons.append(f"{file_path.name}: {_skip_reason}")
            if on_progress:
                on_progress(IngestProgress(
                    filename=file_path.name,
                    files_done=files_done,
                    files_total=len(files),
                    status=_status,  # type: ignore[arg-type]
                    chunks_stored=result.chunks_stored,
                ))

    if verbose:
        logger.info("Done. Collection '%s' in '%s'", collection_name, db_path)

    return result


def query(
    text: str,
    db_path: str = "./synapse_db",
    collection_name: str = "synapse",
    n_results: int = 5,
    embedding_model: str = "all-MiniLM-L6-v2",
    where: Optional[dict] = None,
    collection_names: Optional[List[str]] = None,
) -> List[QueryResult]:
    """
    Semantic search over one or more ChromaDB collections.

    Args:
        text:              Query string.
        db_path:           Path to the ChromaDB directory.
        collection_name:   Name of the ChromaDB collection (single-collection mode).
        n_results:         Maximum number of results to return.
        embedding_model:   SentenceTransformer model name (must match ingest).
        where:             Optional ChromaDB metadata filter dict.
                           Example: ``{"source_type": {"$eq": "file"}}``
                           See the ChromaDB docs for the full filter syntax.
        collection_names:  Query multiple collections and merge results by score.
                           When provided, ``collection_name`` is ignored.
                           Missing collections are silently skipped.

    Returns:
        List of :class:`~synapse_core.QueryResult` dicts sorted by relevance
        (highest score first).
    """
    # ── multi-collection: query each, merge, return top-n ─────────────────
    if collection_names:
        all_results: List[QueryResult] = []
        for name in collection_names:
            try:
                partial = query(
                    text=text,
                    db_path=db_path,
                    collection_name=name,
                    n_results=n_results,
                    embedding_model=embedding_model,
                    where=where,
                )
                all_results.extend(partial)
            except CollectionNotFoundError:
                pass  # skip missing collections silently
        all_results.sort(key=lambda r: r["score"], reverse=True)
        return all_results[:n_results]

    # ── single collection ──────────────────────────────────────────────────
    try:
        collection = _get_collection(db_path, collection_name, embedding_model, create=False)
    except (ValueError, ChromaNotFoundError):
        raise CollectionNotFoundError(
            f"Collection '{collection_name}' not found in '{db_path}' — run ingest() first."
        ) from None

    count = collection.count()
    if count == 0:
        return []

    query_kwargs: dict = {
        "query_texts": [text],
        "n_results": min(n_results, count),
        "include": ["documents", "metadatas", "distances"],
    }
    if where:
        query_kwargs["where"] = where

    results = collection.query(**query_kwargs)
    documents = results["documents"][0]  # type: ignore[index]
    metadatas = results["metadatas"][0]  # type: ignore[index]
    distances = results["distances"][0]  # type: ignore[index]
    return [
        {
            "text": doc,
            "source": meta.get("source", ""),
            "source_type": meta.get("source_type", "file"),
            "score": round(1 / (1 + dist), 4),
            "distance": round(dist, 4),
            "chunk": meta.get("chunk", 0),
            "doc_title": meta.get("doc_title", ""),
            "doc_author": meta.get("doc_author", ""),
            "doc_created": meta.get("doc_created", ""),
        }
        for doc, meta, dist in zip(documents, metadatas, distances)
    ]


def _source_exists(meta: dict) -> bool:
    """Return True if the chunk's source still exists on disk.

    File sources: absolute path — check directly.
    SQLite sources: stored as "/abs/path/to/db::table" — check only the db file part.
    """
    source = meta.get("source", "")
    if meta.get("source_type") == "sqlite":
        db_file = source.split("::")[0]
        return Path(db_file).exists()
    return Path(source).exists()


def purge(
    db_path: str = "./synapse_db",
    collection_name: str = "synapse",
    verbose: bool = True,
) -> PurgeResult:
    """
    Remove chunks from ChromaDB whose source file no longer exists on disk.

    Returns a :class:`~synapse_core.PurgeResult` with ``chunks_deleted`` and
    ``chunks_checked``.
    """
    client = chromadb.PersistentClient(path=db_path)
    try:
        collection = client.get_collection(name=collection_name)
    except (ValueError, ChromaNotFoundError):
        if verbose:
            logger.warning("Collection '%s' not found.", collection_name)
        return PurgeResult()

    results = collection.get(include=["metadatas"])
    all_ids = results["ids"]
    stale_ids = [
        id_
        for id_, meta in zip(all_ids, results["metadatas"])  # type: ignore[arg-type]
        if not _source_exists(meta)
    ]

    if stale_ids:
        collection.delete(ids=stale_ids)
        if verbose:
            logger.info("Purged %d stale chunk(s).", len(stale_ids))
    elif verbose:
        logger.info("Nothing to purge — all sources still exist.")

    return PurgeResult(chunks_deleted=len(stale_ids), chunks_checked=len(all_ids))


def reset(
    db_path: str = "./synapse_db",
    collection_name: str = "synapse",
    verbose: bool = True,
    confirm: bool = False,
) -> None:
    """Delete the entire ChromaDB collection.

    Args:
        confirm: Must be ``True`` to proceed. This guard prevents accidental
                 programmatic resets. The CLI passes ``confirm=True`` after
                 prompting the user with ``--yes`` or an interactive confirm.

    Raises:
        ValueError: If ``confirm`` is ``False``.
    """
    if not confirm:
        raise ValueError(
            "reset() permanently deletes the collection. "
            "Pass confirm=True to proceed, or use the CLI (`synapse reset --yes`)."
        )
    client = chromadb.PersistentClient(path=db_path)
    try:
        client.delete_collection(name=collection_name)
        if verbose:
            logger.info("Collection '%s' deleted.", collection_name)
    except (ValueError, ChromaNotFoundError):
        if verbose:
            logger.warning("Collection '%s' not found.", collection_name)


def sources(
    db_path: str = "./synapse_db",
    collection_name: str = "synapse",
) -> List[str]:
    """Return a sorted list of unique source file paths stored in the collection."""
    client = chromadb.PersistentClient(path=db_path)
    try:
        collection = client.get_collection(name=collection_name)
    except (ValueError, ChromaNotFoundError):
        return []

    results = collection.get(include=["metadatas"])
    seen = set()
    unique = []
    for meta in results["metadatas"]:  # type: ignore[union-attr]
        src = meta.get("source", "")
        if src and src not in seen:
            seen.add(src)
            unique.append(src)
    return sorted(unique)
