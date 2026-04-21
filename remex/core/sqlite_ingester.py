import hashlib
import sqlite3
from pathlib import Path
from typing import Any, Callable, List, Optional

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


def _make_sqlite_id(db_path: str, table: str, row_id: Any, chunk_index: int) -> str:
    """Stable unique ID: hash of db path + table + row pk + chunk index."""
    key = f"sqlite::{Path(db_path).resolve()}::{table}::{row_id}::{chunk_index}"
    return hashlib.md5(key.encode(), usedforsecurity=False).hexdigest()


def ingest_sqlite(
    db_path: str,
    table: str,
    columns: Optional[List[str]] = None,
    id_column: str = "id",
    row_template: Optional[str] = None,
    chroma_path: str = "./remex_db",
    collection_name: str = "remex",
    chunk_size: int = 1000,
    overlap: int = 200,
    min_chunk_size: int = 50,
    embedding_model: str = "all-MiniLM-L6-v2",
    chunking: str = "word",
    incremental: bool = False,
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
        verbose:          Emit progress via the remex.core logger.
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

        # Validate and resolve columns against actual schema.
        # Double-quote escaping handles table/column names that contain `"`.
        safe_table = table.replace('"', '""')
        cursor.execute(f'PRAGMA table_info("{safe_table}")')
        available = [row["name"] for row in cursor.fetchall()]

        if columns:
            invalid = [c for c in columns if c not in available]
            if invalid:
                raise ValueError(f"Columns not found in '{table}': {invalid}")
            selected = columns
        else:
            selected = available

        # Fall back to SQLite rowid if id_column is absent.
        # Alias as _remex_rowid so the name is stable even when the table has
        # an INTEGER PRIMARY KEY column (which SQLite silently aliases to rowid,
        # causing the cursor description to use the column's declared name instead).
        use_rowid = id_column not in available
        col_list = ", ".join(f'"{c.replace(chr(34), chr(34)*2)}"' for c in selected)

        # COUNT(*) first so we can report sources_found without loading all rows.
        count_cur = conn.cursor()
        count_cur.execute(f'SELECT COUNT(*) FROM "{safe_table}"')
        row_count: int = count_cur.fetchone()[0]

        if use_rowid:
            cursor.execute(f'SELECT rowid AS _remex_rowid, {col_list} FROM "{safe_table}"')
        else:
            cursor.execute(f'SELECT {col_list} FROM "{safe_table}"')

    except Exception:
        conn.close()
        raise

    result = IngestResult(sources_found=row_count)

    if row_count == 0:
        conn.close()
        if verbose:
            logger.info("No records found in %s::%s", db_path, table)
        return result

    # Validate row_template against the column schema before processing any rows.
    # A bad template key is a config error — fail fast rather than silently skipping every row.
    if row_template:
        _row_to_text({c: "" for c in selected}, row_template)

    collection = _get_collection(chroma_path, collection_name, embedding_model)

    if verbose:
        logger.info("Ingesting: %s (%d records)", table, row_count)

    try:
        for rows_done, row in enumerate(cursor, 1):
            row_dict = dict(row)
            row_id = None
            _status = "skipped"

            try:
                # Extract row identity
                if use_rowid:
                    row_id = row_dict.pop("_remex_rowid")
                else:
                    row_id = row_dict.get(id_column)

                # Only include selected columns in the text representation.
                # Exclude the id_column in the default serialization — it's an
                # identifier, not content, so a row whose only populated column is
                # the ID has no ingestable text. Users who want the ID in the text
                # can reference it explicitly via row_template.
                text_dict = {
                    k: row_dict[k]
                    for k in selected
                    if k in row_dict and (row_template or k != id_column)
                }
                text = _row_to_text(text_dict, row_template)
                source_str = f"{Path(db_path).resolve()}::{table}"
                row_hash = hashlib.sha256(text.encode(), usedforsecurity=False).hexdigest()[:16]

                if incremental:
                    check_id = _make_sqlite_id(db_path, table, row_id, 0)
                    existing = collection.get(ids=[check_id], include=["metadatas"])
                    if existing["ids"]:
                        if existing["metadatas"][0].get("row_hash") == row_hash:
                            _skip_reason = "hash_match"
                            result.sources_skipped += 1
                            continue
                        # Hash changed — delete all old chunks
                        n_old = int(existing["metadatas"][0].get("n_chunks", 1))
                        collection.delete(
                            ids=[_make_sqlite_id(db_path, table, row_id, i) for i in range(n_old)]
                        )

                chunks = chunk_text(
                    text,
                    chunk_size=chunk_size,
                    overlap=overlap,
                    min_chunk_size=min_chunk_size,
                    mode=chunking,
                )
                if not chunks:
                    # Row text is non-empty but shorter than min_chunk_size
                    # (common for compact DB rows). Store it as a single chunk
                    # rather than discarding — every row is a meaningful unit.
                    if text:
                        chunks = [text]
                    else:
                        result.sources_skipped += 1
                        continue

                ids = [_make_sqlite_id(db_path, table, row_id, i) for i in range(len(chunks))]
                metadatas = [
                    {
                        "source_type": "sqlite",
                        "source": source_str,
                        "row_id": str(row_id),
                        "chunk": i,
                        "row_hash": row_hash,
                        "n_chunks": len(chunks),
                    }
                    for i in range(len(chunks))
                ]

                collection.upsert(documents=chunks, ids=ids, metadatas=metadatas)  # type: ignore[arg-type]
                result.sources_ingested += 1
                result.chunks_stored += len(chunks)
                _status = "ingested"

            except Exception as e:
                if verbose:
                    logger.warning("[skip] %s[%s]: %s", table, row_id, e)
                result.sources_skipped += 1
                result.skipped_reasons.append(f"{table}[{row_id}]: extract_error: {e}")
                _status = "error"

            finally:
                if on_progress:
                    on_progress(IngestProgress(
                        filename=f"{table}[{row_id}]",
                        files_done=rows_done,
                        files_total=row_count,
                        status=_status,  # type: ignore[arg-type]
                        chunks_stored=result.chunks_stored,
                    ))
    finally:
        conn.close()

    if verbose:
        logger.info("  -> %d chunks stored", result.chunks_stored)

    return result
