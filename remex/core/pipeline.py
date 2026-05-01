import asyncio
import concurrent.futures
import hashlib
import threading
from pathlib import Path
from typing import Any, Callable, cast

import chromadb
from chromadb.errors import NotFoundError as ChromaNotFoundError
from chromadb.utils import embedding_functions

from .chunker import chunk_text
from .exceptions import CollectionNotFoundError, SourceNotFoundError
from .extractors import extract, extract_metadata, extract_streaming, is_supported, supports_streaming
from .logger import logger
from .models import CollectionStats, IngestProgress, IngestResult, PurgeResult, QueryResult


# Cache SentenceTransformerEmbeddingFunction instances by model name so the
# model is loaded from disk only once per process, not on every ingest() call.
_EF_CACHE: dict[str, Any] = {}
_EF_LOCK = threading.Lock()  # guards concurrent first-load across asyncio.to_thread workers

# ChromaDB PersistentClient is reused per db_path to avoid re-opening the SQLite WAL on every call.
_CLIENT_CACHE: dict[str, Any] = {}
_CLIENT_LOCK = threading.Lock()

_MAX_EXTRACT_WORKERS = 4  # threads for parallel file extraction (I/O-bound)


def _get_client(db_path: str) -> Any:
    if db_path in _CLIENT_CACHE:
        return _CLIENT_CACHE[db_path]
    with _CLIENT_LOCK:
        if db_path not in _CLIENT_CACHE:
            _CLIENT_CACHE[db_path] = chromadb.PersistentClient(path=db_path)
    return _CLIENT_CACHE[db_path]


class _RemexEmbeddingFunction(embedding_functions.SentenceTransformerEmbeddingFunction):
    """Subclass that overrides __call__ to use batch_size=128.

    ChromaDB's built-in SentenceTransformerEmbeddingFunction hard-codes
    batch_size=32.  Encoding in larger batches lets sentence_transformers sort
    sequences by length to minimise padding waste — ~15% fewer FLOPs for
    variable-length text on CPU, more on GPU.
    """

    def __call__(self, input: list[str]) -> list[Any]:  # type: ignore[override]
        import numpy as np

        # _model and normalize_embeddings are private attrs set by the parent __init__.
        embeddings = self._model.encode(
            list(input),
            batch_size=128,
            convert_to_numpy=True,
            normalize_embeddings=self.normalize_embeddings,
            show_progress_bar=False,
        )
        return [np.array(e, dtype=np.float32) for e in embeddings]


def _get_ef(model_name: str) -> Any:
    # Fast path — no lock needed once cached.
    if model_name in _EF_CACHE:
        return _EF_CACHE[model_name]
    with _EF_LOCK:
        # Re-check inside the lock to prevent duplicate loads from concurrent threads.
        if model_name not in _EF_CACHE:
            _EF_CACHE[model_name] = _RemexEmbeddingFunction(model_name)
    return _EF_CACHE[model_name]


def _extract_file_safe(file_path: Path) -> tuple[str | None, Exception | None]:
    """Extract text from a file without raising. Returns (text, None) or (None, error)."""
    try:
        return extract(file_path), None
    except Exception as exc:
        return None, exc


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


def _get_source_chunks(collection: Any, source_str: str) -> dict[str, Any]:
    """Return all ChromaDB entries for a given source path."""
    return collection.get(
        where={"source": {"$eq": source_str}},
        include=["metadatas"],
    )


def _get_collection(db_path: str, collection_name: str, embedding_model: str, create: bool = True) -> Any:
    """Get or create a ChromaDB collection with the given embedding model."""
    client = _get_client(db_path)
    ef = _get_ef(embedding_model)
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
    # Read metadata first to determine the stored embedding model, then re-fetch
    # the collection with the correct EF — avoids mutating a private attribute.
    _meta_col = client.get_collection(name=collection_name)
    stored_model = (
        _meta_col.metadata.get("embedding_model")
        if isinstance(_meta_col.metadata, dict) else None
    ) or embedding_model
    return client.get_collection(  # type: ignore[return-value]
        name=collection_name,
        embedding_function=_get_ef(stored_model),  # type: ignore[arg-type]
    )


def _make_id_abs(file_path: Path, chunk_index: int) -> str:
    """Stable unique ID based on absolute path — used by ingest_many()."""
    key = f"{file_path.resolve()}::{chunk_index}"
    return hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()


_STREAM_BATCH = 100  # max chunks per ChromaDB upsert call during streaming
_STREAMING_THRESHOLD = 50 * 1024 * 1024  # 50 MiB — files above this use streaming extraction


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
    id_fn: Callable[[int], str] | None = None,
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
        buf_ids.append(id_fn(chunk_idx) if id_fn else _make_id(file_path, source_dir, chunk_idx))
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
            carry = text[safe_end:]
        else:
            carry = text  # accumulate until we have a workable window

    if carry.strip():
        for ch in chunk_text(carry, chunk_size=chunk_size, overlap=overlap,
                              min_chunk_size=min_chunk_size, mode=mode):
            _add(ch)

    _flush()
    return chunk_idx


_BATCH_LIMIT = 2048  # max chunks per ChromaDB upsert call (cross-file batching)
# Larger batches let sentence_transformers sort sequences by length before encoding,
# which reduces wasted padding tokens — ~10-20% fewer FLOPs for variable-length text.


def _parallel_extract(
    file_paths: list[Path],
    streaming_threshold: int,
) -> dict[Path, tuple[str | None, Exception | None]]:
    """Pre-extract non-streaming files concurrently to overlap disk I/O."""
    def _stat_size_safe(fp: Path) -> int:
        try:
            return fp.stat().st_size
        except OSError:
            return 0

    bulk = [
        fp for fp in file_paths
        if not (streaming_threshold > 0 and _stat_size_safe(fp) > streaming_threshold
                and supports_streaming(fp))
    ]
    result: dict[Path, tuple[str | None, Exception | None]] = {}
    if bulk:
        with concurrent.futures.ThreadPoolExecutor(
            max_workers=min(_MAX_EXTRACT_WORKERS, len(bulk))
        ) as ex:
            futs = {ex.submit(_extract_file_safe, fp): fp for fp in bulk}
            for fut in concurrent.futures.as_completed(futs):
                result[futs[fut]] = fut.result()
    return result


def _process_file_list(
    file_paths: list[Path],
    collection: Any,
    result: IngestResult,
    *,
    make_source_str: Callable[[Path], str],
    make_chunk_id: Callable[[Path, int], str],
    streaming_source_dir: Callable[[Path], Path],
    chunk_size: int,
    overlap: int,
    min_chunk_size: int,
    chunking: str,
    incremental: bool,
    verbose: bool,
    streaming_threshold: int,
    on_progress: Callable[[IngestProgress], None] | None,
    pre_extracted: dict[Path, tuple[str | None, Exception | None]],
) -> None:
    """Core per-file loop shared by :func:`ingest` and :func:`ingest_many`.

    Iterates *file_paths*, handles incremental skipping, streaming vs. bulk
    extraction, cross-file batch accumulation, and progress callbacks.
    Mutates *result* in place.
    """
    batch_docs: list[str] = []
    batch_ids: list[str] = []
    batch_metas: list[dict[str, Any]] = []

    def _flush() -> None:
        if batch_docs:
            collection.upsert(  # type: ignore[arg-type]
                documents=list(batch_docs),
                ids=list(batch_ids),
                metadatas=list(batch_metas),
            )
            batch_docs.clear()
            batch_ids.clear()
            batch_metas.clear()

    files_total = len(file_paths)
    for files_done, file_path in enumerate(file_paths, 1):
        _status: str = "skipped"
        _skip_reason: str = ""
        current_hash = ""

        try:
            if not file_path.exists():
                if verbose:
                    logger.warning("[skip] %s: file not found", file_path.name)
                _skip_reason = "extract_error: file not found"
                result.sources_skipped += 1
                continue

            if not is_supported(file_path):
                if verbose:
                    logger.warning("[skip] %s: unsupported format", file_path.name)
                _skip_reason = "extract_error: unsupported format"
                result.sources_skipped += 1
                continue

            source_str = make_source_str(file_path)

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
                    # Flush batch before streaming — streaming does its own upserts.
                    _flush()
                    n = _ingest_file_streaming(
                        file_path,
                        streaming_source_dir(file_path),
                        collection, source_str,
                        chunk_size, overlap, min_chunk_size, chunking,
                        doc_meta, incremental, current_hash,
                        id_fn=lambda j, fp=file_path: make_chunk_id(fp, j),
                    )
                except (OSError, ValueError, RuntimeError) as e:
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

                _status = "ingested"
                result.sources_ingested += 1
                result.chunks_stored += n
                if verbose:
                    logger.info("  -> %d chunks stored (streamed)", n)

            else:
                _text_result = pre_extracted.get(file_path) or _extract_file_safe(file_path)
                text, _err = _text_result
                if _err is not None:
                    if verbose:
                        logger.warning("[skip] %s: %s", file_path.name, _err)
                    _status = "error"
                    _skip_reason = f"extract_error: {_err}"
                    result.sources_skipped += 1
                    continue

                chunks = chunk_text(
                    text or "",
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

                ids = [make_chunk_id(file_path, i) for i in range(len(chunks))]
                doc_meta = extract_metadata(file_path)
                metadatas: list[dict[str, Any]] = [
                    {"source_type": "file", "source": source_str, "chunk": i, **doc_meta}
                    for i in range(len(chunks))
                ]
                if incremental:
                    for meta in metadatas:
                        meta["file_hash"] = current_hash

                batch_docs.extend(chunks)
                batch_ids.extend(ids)
                batch_metas.extend(metadatas)
                if len(batch_docs) >= _BATCH_LIMIT:
                    _flush()

                result.sources_ingested += 1
                result.chunks_stored += len(chunks)
                _status = "ingested"
                if verbose:
                    logger.info("  -> %d chunks stored", len(chunks))

        except Exception as e:
            _status = "error"
            _skip_reason = f"unexpected_error: {e}"
            result.sources_skipped += 1
            if verbose:
                logger.exception("[skip] %s: unexpected error", file_path.name)
        finally:
            if _skip_reason:
                result.skipped_reasons.append(f"{file_path.name}: {_skip_reason}")
            if on_progress:
                on_progress(IngestProgress(
                    filename=file_path.name,
                    files_done=files_done,
                    files_total=files_total,
                    status=_status,  # type: ignore[arg-type]
                    chunks_stored=result.chunks_stored,
                ))

    _flush()


def ingest(
    source_dir: str = "./docs",
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    chunk_size: int = 1000,
    overlap: int = 200,
    min_chunk_size: int = 50,
    embedding_model: str = "all-MiniLM-L6-v2",
    incremental: bool = False,
    chunking: str = "word",
    verbose: bool = True,
    streaming_threshold: int = _STREAMING_THRESHOLD,
    on_progress: Callable[[IngestProgress], None] | None = None,
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
        verbose:              Emit progress via the remex.core logger.
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
    pre_extracted = _parallel_extract(files, streaming_threshold)

    _process_file_list(
        files, collection, result,
        make_source_str=lambda fp: str(fp.resolve()),
        make_chunk_id=lambda fp, i: _make_id(fp, source, i),
        streaming_source_dir=lambda _fp: source,
        chunk_size=chunk_size,
        overlap=overlap,
        min_chunk_size=min_chunk_size,
        chunking=chunking,
        incremental=incremental,
        verbose=verbose,
        streaming_threshold=streaming_threshold,
        on_progress=on_progress,
        pre_extracted=pre_extracted,
    )

    if verbose:
        logger.info("Done. Collection '%s' in '%s'", collection_name, db_path)

    return result


def query(
    text: str,
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    n_results: int = 5,
    embedding_model: str = "all-MiniLM-L6-v2",
    where: dict | None = None,
    collection_names: list[str] | None = None,
    min_score: float | None = None,
) -> list[QueryResult]:
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
        min_score:         Minimum relevance score (0–1) to include in results.
                           Results with a score below this threshold are dropped.
                           ``None`` (default) returns all results up to ``n_results``.

    Returns:
        List of :class:`~remex.core.QueryResult` dicts sorted by relevance
        (highest score first).
    """
    if n_results < 1:
        raise ValueError("n_results must be >= 1")
    if min_score is not None and not (0.0 <= min_score <= 1.0):
        raise ValueError("min_score must be between 0.0 and 1.0")

    # ── multi-collection: query each, merge, return top-n ─────────────────
    if collection_names:
        all_results: list[QueryResult] = []
        for name in collection_names:
            try:
                partial = query(
                    text=text,
                    db_path=db_path,
                    collection_name=name,
                    n_results=n_results,
                    embedding_model=embedding_model,
                    where=where,
                    min_score=min_score,
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
    rows = cast(list[QueryResult], [
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
    ])
    if min_score is not None:
        rows = [r for r in rows if r["score"] >= min_score]
    return rows


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
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    verbose: bool = True,
    raise_if_missing: bool = False,
) -> PurgeResult:
    """
    Remove chunks from ChromaDB whose source file no longer exists on disk.

    Returns a :class:`~remex.core.PurgeResult` with ``chunks_deleted`` and
    ``chunks_checked``.

    Args:
        raise_if_missing: When True, raise :class:`CollectionNotFoundError` if the
            collection does not exist instead of returning an empty result.
    """
    client = _get_client(db_path)
    try:
        collection = client.get_collection(name=collection_name)
    except (ValueError, ChromaNotFoundError):
        if raise_if_missing:
            raise CollectionNotFoundError(
                f"Collection '{collection_name}' not found in '{db_path}'."
            ) from None
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
    db_path: str = "./remex_db",
    collection_name: str = "remex",
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
            "Pass confirm=True to proceed, or use the CLI (`remex reset --yes`)."
        )
    client = _get_client(db_path)
    try:
        client.delete_collection(name=collection_name)
        if verbose:
            logger.info("Collection '%s' deleted.", collection_name)
    except (ValueError, ChromaNotFoundError):
        if verbose:
            logger.warning("Collection '%s' not found.", collection_name)


def sources(
    db_path: str = "./remex_db",
    collection_name: str = "remex",
) -> list[str]:
    """Return a sorted list of unique source file paths stored in the collection."""
    client = _get_client(db_path)
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


def source_chunk_counts(
    db_path: str = "./remex_db",
    collection_name: str = "remex",
) -> dict[str, int]:
    """Return a mapping of source path → chunk count for the collection."""
    client = _get_client(db_path)
    try:
        collection = client.get_collection(name=collection_name)
    except (ValueError, ChromaNotFoundError):
        return {}

    results = collection.get(include=["metadatas"])
    counts: dict[str, int] = {}
    for meta in results["metadatas"]:  # type: ignore[union-attr]
        src = meta.get("source", "")
        if src:
            counts[src] = counts.get(src, 0) + 1
    return counts


def warmup_collections(db_path: str = "./remex_db") -> list[str]:
    """Pre-load SentenceTransformer models for all collections into the EF cache.

    Called at Studio startup so the first query isn't blocked waiting for model
    load. Already-cached models are skipped instantly via the _EF_CACHE fast path.
    Returns the sorted list of unique model names found. Errors are swallowed —
    warmup is best-effort and must never crash the server.
    """
    try:
        client = _get_client(db_path)
        collections = client.list_collections()
    except Exception:
        return []

    seen: set[str] = set()
    for col in collections:
        try:
            meta = col.metadata if isinstance(col.metadata, dict) else {}
            model = meta.get("embedding_model", "")
            if model and model not in seen:
                seen.add(model)
                _get_ef(model)
        except Exception:
            pass

    return sorted(seen)


def list_collections(db_path: str = "./remex_db") -> list[str]:
    """Return a sorted list of all collection names in a ChromaDB directory.

    Returns an empty list if the path does not exist or contains no collections.

    Args:
        db_path: ChromaDB persistence path.
    """
    try:
        client = _get_client(db_path)
        return sorted(c.name for c in client.list_collections())
    except (PermissionError, OSError):
        raise
    except Exception:
        return []


def collection_stats(
    db_path: str = "./remex_db",
    collection_name: str = "remex",
) -> CollectionStats:
    """Return statistics for a ChromaDB collection.

    Args:
        db_path:          ChromaDB persistence path.
        collection_name:  Name of the collection.

    Returns:
        A :class:`~remex.core.CollectionStats` instance with ``name``,
        ``total_chunks``, ``total_sources``, and ``embedding_model``.

    Raises:
        CollectionNotFoundError: If the collection does not exist.
    """
    client = _get_client(db_path)
    try:
        collection = client.get_collection(name=collection_name)
    except (ValueError, ChromaNotFoundError):
        raise CollectionNotFoundError(
            f"Collection '{collection_name}' not found in '{db_path}'."
        ) from None

    total_chunks = collection.count()
    results = collection.get(include=["metadatas"])
    unique_sources = len({
        str(meta.get("source", ""))
        for meta in (results["metadatas"] or [])
        if meta.get("source")
    })
    meta = collection.metadata if isinstance(collection.metadata, dict) else {}
    embedding_model = meta.get("embedding_model", "")
    description = meta.get("description", "")
    return CollectionStats(
        name=collection_name,
        total_chunks=total_chunks,
        total_sources=unique_sources,
        embedding_model=embedding_model,
        description=description,
    )


def update_collection_description(
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    description: str = "",
) -> None:
    """Set the human-readable description for a collection.

    Args:
        db_path:          ChromaDB persistence path.
        collection_name:  Name of the collection to update.
        description:      New description string (empty = clear).

    Raises:
        CollectionNotFoundError: If the collection does not exist.
    """
    client = _get_client(db_path)
    try:
        collection = client.get_collection(name=collection_name)
    except (ValueError, ChromaNotFoundError):
        raise CollectionNotFoundError(
            f"Collection '{collection_name}' not found in '{db_path}'."
        ) from None
    meta = dict(collection.metadata or {})
    meta["description"] = description
    collection.modify(metadata=meta)


def delete_source(
    source: str,
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    verbose: bool = True,
) -> int:
    """Remove all chunks for a given source from the collection.

    For file sources, ``source`` is the file path (resolved to absolute
    internally). For SQLite sources, pass the stored string as returned by
    :func:`sources` (e.g. ``"/abs/path/to/db::table"``).

    Args:
        source:           File path or SQLite source string.
        db_path:          ChromaDB persistence path.
        collection_name:  Name of the collection.
        verbose:          Log a summary line when chunks are deleted.

    Returns:
        Number of chunks deleted (0 if the source was not found).

    Raises:
        CollectionNotFoundError: If the collection does not exist.
    """
    client = _get_client(db_path)
    try:
        collection = client.get_collection(name=collection_name)
    except (ValueError, ChromaNotFoundError):
        raise CollectionNotFoundError(
            f"Collection '{collection_name}' not found in '{db_path}'."
        ) from None

    # SQLite sources contain "::" — leave as-is.
    # File sources: resolve to absolute path to match stored values.
    source_str = source if "::" in source else str(Path(source).resolve())

    results = collection.get(
        where={"source": {"$eq": source_str}},
        include=["metadatas"],
    )
    ids = results["ids"]
    if ids:
        collection.delete(ids=ids)
        if verbose:
            logger.info("Deleted %d chunk(s) for source '%s'.", len(ids), source_str)
    elif verbose:
        logger.warning("No chunks found for source '%s'.", source_str)
    return len(ids)


def ingest_many(
    paths: list[str | Path],
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    chunk_size: int = 1000,
    overlap: int = 200,
    min_chunk_size: int = 50,
    embedding_model: str = "all-MiniLM-L6-v2",
    chunking: str = "word",
    verbose: bool = True,
    incremental: bool = False,
    streaming_threshold: int = _STREAMING_THRESHOLD,
    on_progress: Callable[[IngestProgress], None] | None = None,
) -> IngestResult:
    """
    Ingest a specific list of files into a ChromaDB collection.

    Unlike :func:`ingest`, which scans a directory recursively, this function
    accepts an explicit list of file paths — useful when you already know which
    files to embed (e.g. recently modified files, a filtered subset, etc.).

    Args:
        paths:               List of file paths (``str`` or :class:`pathlib.Path`).
                             Unsupported or missing files are skipped and recorded
                             in :attr:`IngestResult.skipped_reasons`.
        db_path:             Path where ChromaDB persists data.
        collection_name:     Name of the ChromaDB collection.
        chunk_size:          Target character count per chunk.
        overlap:             Character overlap between consecutive chunks.
        min_chunk_size:      Discard chunks shorter than this (chars).
        embedding_model:     SentenceTransformer model name.
        chunking:            ``"word"`` (default) or ``"sentence"`` (requires nltk).
        verbose:             Emit progress via the remex.core logger.
        incremental:         Skip files whose content hash hasn't changed since the
                             last ingest. Changed files are re-ingested.
        streaming_threshold: Files larger than this many bytes are paged through the
                             chunker instead of being fully loaded into memory
                             (text-based formats only). Set to 0 to disable.
                             Default: 50 MB.
        on_progress:         Optional callback invoked after each file is processed.
                             Receives an :class:`IngestProgress` instance.
    """
    file_paths = [Path(p).resolve() for p in paths]
    result = IngestResult(sources_found=len(file_paths))

    if not file_paths:
        return result

    collection = _get_collection(db_path, collection_name, embedding_model)
    pre_extracted = _parallel_extract(
        [fp for fp in file_paths if fp.exists() and is_supported(fp)],
        streaming_threshold,
    )

    _process_file_list(
        file_paths, collection, result,
        make_source_str=lambda fp: str(fp.resolve()),
        make_chunk_id=_make_id_abs,
        streaming_source_dir=lambda fp: fp.parent,
        chunk_size=chunk_size,
        overlap=overlap,
        min_chunk_size=min_chunk_size,
        chunking=chunking,
        incremental=incremental,
        verbose=verbose,
        streaming_threshold=streaming_threshold,
        on_progress=on_progress,
        pre_extracted=pre_extracted,
    )

    if verbose:
        logger.info(
            "Done. %d/%d files ingested, %d chunks stored.",
            result.sources_ingested, len(file_paths), result.chunks_stored,
        )
    return result


# ── Async API ─────────────────────────────────────────────────────────────────

async def ingest_async(
    source_dir: str = "./docs",
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    chunk_size: int = 1000,
    overlap: int = 200,
    min_chunk_size: int = 50,
    embedding_model: str = "all-MiniLM-L6-v2",
    incremental: bool = False,
    chunking: str = "word",
    verbose: bool = True,
    streaming_threshold: int = _STREAMING_THRESHOLD,
    on_progress: Callable[[IngestProgress], None] | None = None,
) -> IngestResult:
    """Async wrapper around :func:`ingest`. Runs in a thread pool so the event
    loop is never blocked. All parameters are identical to :func:`ingest`."""
    return await asyncio.to_thread(
        ingest,
        source_dir=source_dir,
        db_path=db_path,
        collection_name=collection_name,
        chunk_size=chunk_size,
        overlap=overlap,
        min_chunk_size=min_chunk_size,
        embedding_model=embedding_model,
        incremental=incremental,
        chunking=chunking,
        verbose=verbose,
        streaming_threshold=streaming_threshold,
        on_progress=on_progress,
    )


async def query_async(
    text: str,
    db_path: str = "./remex_db",
    collection_name: str = "remex",
    n_results: int = 5,
    embedding_model: str = "all-MiniLM-L6-v2",
    where: dict | None = None,
    collection_names: list[str] | None = None,
    min_score: float | None = None,
) -> list[QueryResult]:
    """Async wrapper around :func:`query`. Runs in a thread pool so the event
    loop is never blocked. All parameters are identical to :func:`query`."""
    return await asyncio.to_thread(
        query,
        text=text,
        db_path=db_path,
        collection_name=collection_name,
        n_results=n_results,
        embedding_model=embedding_model,
        where=where,
        collection_names=collection_names,
        min_score=min_score,
    )
