import hashlib
import sqlite3
from pathlib import Path
from typing import Callable, List, Optional

from .chunker import chunk_text
from .exceptions import SourceNotFoundError, TableNotFoundError
from .logger import logger
from .models import IngestProgress, IngestResult
from .pipeline import _get_collection


def _row_to_text(row: dict, template: Optional[str]) -> str:
    """Serialize a database row to a plain text string."""
    if template:
        try:
            return template.format(**{k: (v if v is not None else "") for k, v in row.items()})
        except KeyError as e:
            raise ValueError(
                f"row_template references unknown column {e}. "
                f"Available columns: {list(row.keys())}"
            )
    return " | ".join(
        f"{k}: {v}" for k, v in row.items() if v is not None and str(v).strip()
    )


def _make_sqlite_id(db_path: str, table: str, row_id, chunk_index: int) -> str:
    """Stable unique ID: hash of db path + table + row pk + chunk index."""
    key = f"sqlite::{Path(db_path).resolve()}::{table}::{row_id}::{chunk_index}"
    return hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()


def ingest_sqlite(
    db_path: str,
    table: str,
    columns: Optional[List[str]] = None,
    id_column: str = "id",
    row_template: Optional[str] = None,
    chroma_path: str = "./synapse_db",
    collection_name: str = "synapse",
    chunk_size: int = 1000,
    overlap: int = 200,
    min_chunk_size: int = 50,
    embedding_model: str = "all-MiniLM-L6-v2",
    chunking: str = "word",
    verbose: bool = True,
    on_progress: Optional[Callable[[IngestProgress], None]] = None,
) -> IngestResult:
    """
    Ingest records from a SQLite table into a ChromaDB collection.

    Each row is serialized to text, chunked, embedded and upserted — the same
    pipeline as ingest(), so files and database records coexist in the same
    collection and are queried together by the agent.

    Args:
        db_path:          Path to the SQLite database file.
        table:            Table to ingest.
        columns:          Columns to include. None = all columns.
        id_column:        Primary key column for stable chunk IDs.
        row_template:     Optional format string e.g. "{title}: {body}".
                          Overrides the default "key: value | ..." serialization.
        chroma_path:      ChromaDB persistence directory (same as ingest()).
        collection_name:  ChromaDB collection name.
        chunk_size:       Target characters per chunk.
        overlap:          Character overlap between consecutive chunks.
        min_chunk_size:   Discard chunks shorter than this.
        embedding_model:  SentenceTransformer model name.
        chunking:         "word" (default) or "sentence" (requires nltk).
        verbose:          Emit progress via the synapse_core logger.
        on_progress:      Optional callback invoked after each row is processed.
                          Receives an :class:`IngestProgress` instance.
    """
    if not Path(db_path).exists():
        raise SourceNotFoundError(f"SQLite database not found: {db_path}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()

        # Validate table exists
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
        )
        if not cursor.fetchone():
            raise TableNotFoundError(f"Table '{table}' not found in {db_path}")

        # Validate and resolve columns against actual schema
        cursor.execute(f"PRAGMA table_info(\"{table}\")")
        available = [row["name"] for row in cursor.fetchall()]

        if columns:
            invalid = [c for c in columns if c not in available]
            if invalid:
                raise ValueError(f"Columns not found in '{table}': {invalid}")
            selected = columns
        else:
            selected = available

        # Fall back to SQLite rowid if id_column is absent
        use_rowid = id_column not in available
        col_list = ", ".join(f'"{c}"' for c in selected)

        if use_rowid:
            cursor.execute(f'SELECT rowid, {col_list} FROM "{table}"')
        else:
            cursor.execute(f'SELECT {col_list} FROM "{table}"')

        rows = cursor.fetchall()
    finally:
        conn.close()

    result = IngestResult(sources_found=len(rows))

    if not rows:
        if verbose:
            logger.info("No records found in %s::%s", db_path, table)
        return result

    collection = _get_collection(chroma_path, collection_name, embedding_model)

    if verbose:
        logger.info("Ingesting: %s (%d records)", table, len(rows))

    for rows_done, row in enumerate(rows, 1):
        row_dict = dict(row)
        row_id = None
        _status = "skipped"

        try:
            # Extract row identity
            if use_rowid:
                row_id = row_dict.pop("rowid")
            else:
                row_id = row_dict.get(id_column)

            # Only include selected columns in the text representation
            text_dict = {k: row_dict[k] for k in selected if k in row_dict}
            text = _row_to_text(text_dict, row_template)

            chunks = chunk_text(
                text,
                chunk_size=chunk_size,
                overlap=overlap,
                min_chunk_size=min_chunk_size,
                mode=chunking,
            )
            if not chunks:
                result.sources_skipped += 1
                continue

            ids = [_make_sqlite_id(db_path, table, row_id, i) for i in range(len(chunks))]
            metadatas = [
                {
                    "source_type": "sqlite",
                    "source": f"{Path(db_path).resolve()}::{table}",
                    "row_id": str(row_id),
                    "chunk": i,
                }
                for i in range(len(chunks))
            ]

            collection.upsert(documents=chunks, ids=ids, metadatas=metadatas)  # type: ignore[arg-type]
            result.sources_ingested += 1
            result.chunks_stored += len(chunks)
            _status = "ingested"

        finally:
            if on_progress:
                on_progress(IngestProgress(
                    filename=f"{table}[{row_id}]",
                    files_done=rows_done,
                    files_total=len(rows),
                    status=_status,  # type: ignore[arg-type]
                    chunks_stored=result.chunks_stored,
                ))

    if verbose:
        logger.info("  -> %d chunks stored", result.chunks_stored)

    return result
