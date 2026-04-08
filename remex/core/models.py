"""Public data models returned by remex API functions."""

from dataclasses import dataclass, field
from typing import Literal, TypedDict


class QueryResult(TypedDict):
    """A single result from a semantic search query.

    Returned as items in the list from :func:`~remex.core.query`.
    This is a :class:`~typing.TypedDict` — it is a plain :class:`dict` at
    runtime, so existing code that uses ``result["text"]`` continues to work
    while type checkers now understand the exact shape.
    """

    text: str
    """The chunk content."""
    source: str
    """Absolute path to the source file, or ``/path/to/db::table`` for SQLite."""
    source_type: str
    """``"file"`` or ``"sqlite"``."""
    score: float
    """Relevance score 0–1 (1 = perfect match)."""
    distance: float
    """Raw ChromaDB L2 distance (lower = closer)."""
    chunk: int
    """Chunk index within the source document."""
    doc_title: str
    """Document title extracted from metadata; empty string if unavailable."""
    doc_author: str
    """Document author extracted from metadata; empty string if unavailable."""
    doc_created: str
    """ISO-8601 creation date from metadata; empty string if unavailable."""


@dataclass
class IngestResult:
    """Summary of a completed ingestion run.

    Returned by :func:`~remex.core.ingest` and
    :func:`~remex.core.ingest_sqlite`.

    Example::

        result = ingest("./docs")
        print(f"{result.sources_ingested}/{result.sources_found} files ingested, "
              f"{result.chunks_stored} chunks stored.")
    """

    sources_found: int = 0
    """Number of files (or rows for SQLite) discovered."""
    sources_ingested: int = 0
    """Number of sources successfully chunked and stored."""
    sources_skipped: int = 0
    """Sources skipped: extract errors, empty content, or unchanged (incremental)."""
    chunks_stored: int = 0
    """Total number of chunks written to ChromaDB."""
    skipped_reasons: list[str] = field(default_factory=list)
    """Human-readable reason for each skipped source, e.g. ``"doc.txt: empty"``
    or ``"report.pdf: extract_error: …"``. One entry per skipped file, in
    the order they were encountered."""


@dataclass
class PurgeResult:
    """Summary of a completed purge run.

    Returned by :func:`~remex.core.purge`.

    Example::

        result = purge()
        print(f"Deleted {result.chunks_deleted} stale chunk(s) "
              f"out of {result.chunks_checked} scanned.")
    """

    chunks_deleted: int = 0
    """Number of chunks removed from ChromaDB."""
    chunks_checked: int = 0
    """Total number of chunks scanned (includes both kept and deleted)."""


@dataclass
class CollectionStats:
    """Statistics for a ChromaDB collection.

    Returned by :func:`~remex.core.collection_stats`.

    Example::

        stats = collection_stats()
        print(f"{stats.name}: {stats.total_sources} sources, {stats.total_chunks} chunks")
    """

    name: str
    """Collection name."""
    total_chunks: int
    """Total number of chunks stored in the collection."""
    total_sources: int
    """Number of unique source documents (files or SQLite tables) in the collection."""
    embedding_model: str
    """Embedding model used when the collection was created; empty string if unknown."""


@dataclass
class IngestProgress:
    """Per-file progress update emitted by :func:`~remex.core.ingest` via the
    ``on_progress`` callback after each file is processed.

    Example (tqdm integration)::

        from tqdm import tqdm
        from remex.core import ingest, IngestProgress

        with tqdm(total=None, unit="file") as bar:
            def _progress(p: IngestProgress) -> None:
                bar.total = p.files_total
                bar.update(1)
                bar.set_postfix(file=p.filename, status=p.status)

            ingest("./docs", on_progress=_progress)
    """

    filename: str
    """Base name of the file just processed."""
    files_done: int
    """Number of files processed so far (including this one)."""
    files_total: int
    """Total number of supported files found in ``source_dir``."""
    status: Literal["ingested", "skipped", "error"]
    """Outcome for this file."""
    chunks_stored: int
    """Cumulative chunks written to ChromaDB so far in this run."""
