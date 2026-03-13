"""Public data models returned by synapse-core API functions."""

from dataclasses import dataclass
from typing import TypedDict


class QueryResult(TypedDict):
    """A single result from a semantic search query.

    Returned as items in the list from :func:`~synapse_core.query`.
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

    Returned by :func:`~synapse_core.ingest` and
    :func:`~synapse_core.ingest_sqlite`.

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
