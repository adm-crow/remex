import hashlib
import sqlite3
from pathlib import Path
from typing import Any, Callable, List, Optional

from .chunker import chunk_text
from .exceptions import SourceNotFoundError, TableNotFoundError
from .logger import logger
from .models import IngestProgress, IngestResult
from .pipeline import _get_collection, _stable_id


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


def _make_sqlite_id(db_path: str, namespace: str, row_id: Any, chunk_index: int) -> str:
    """Stable unique ID: hash of db path + namespace + row pk + chunk index.

    `namespace` is the table name (table mode) or ``sql:<hash>`` (custom-SQL mode)
    so the same query/table re-ingests to the same IDs across runs.
    """
    return _stable_id("sqlite", Path(db_path).resolve(), namespace, row_id, chunk_index)


def ingest_sqlite(
    db_path: str,
    table: Optional[str] = None,
    sql_query: Optional[str] = None,
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
        embedding_model:  Embedding model name.
        chunking:         "word" (default) or "sentence" (requires nltk).
        verbose:          Emit progress via the remex.core logger.
        on_progress:      Optional callback invoked after each row is processed.
                          Receives an :class:`IngestProgress` instance.
    """
    if not Path(db_path).exists():
        raise SourceNotFoundError(f"SQLite database not found: {db_path}")

    # Exactly one of table / sql_query.
    if (table is None) == (sql_query is None):
        raise ValueError("provide exactly one of `table` or `sql_query`")

    # `namespace_label` is used as the second component of the stable chunk ID
    # and as the suffix of the `source` metadata. In SQL mode we hash the query
    # so re-running the same query re-ingests to the same IDs (incremental works).
    if sql_query is not None:
        head = sql_query.lstrip().split(None, 1)[0].upper() if sql_query.strip() else ""
        if head not in ("SELECT", "WITH"):
            raise ValueError("sql_query must be a SELECT (or WITH ... SELECT) statement")
        sql_hash = hashlib.md5(sql_query.encode(), usedforsecurity=False).hexdigest()[:12]
        namespace_label = f"sql:{sql_hash}"
        display_name = namespace_label
    else:
        namespace_label = table  # type: ignore[assignment]
        display_name = table  # type: ignore[assignment]

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()

        if sql_query is not None:
            # SQL-query mode — execute the user's SELECT, derive columns from
            # cursor.description, and validate id_column against the result set.
            #
            # Both the COUNT and the streaming SELECT run on the same connection
            # inside an implicit read transaction, so they observe a consistent
            # snapshot (sqlite3 default behaviour). The CTE wrapper handles SQL
            # that ends with ORDER BY/LIMIT — using a subquery alias rather than
            # bare `FROM (...)` is also more portable.
            try:
                count_cur = conn.cursor()
                stripped = sql_query.strip().rstrip(";").strip()
                # Subquery-with-alias form works for any SELECT, including SQL
                # that ends with ORDER BY/LIMIT or starts with a WITH clause.
                count_cur.execute(
                    f"SELECT COUNT(*) FROM ({stripped}) AS _remex_src"
                )
                row_count = count_cur.fetchone()[0]
                cursor.execute(sql_query)
            except sqlite3.Error as e:
                conn.close()
                raise ValueError(f"sql_query failed: {e}")

            available = [d[0] for d in (cursor.description or [])]
            if not available:
                conn.close()
                raise ValueError("sql_query returned no columns")
            if id_column not in available:
                conn.close()
                raise ValueError(
                    f"id_column '{id_column}' not in result columns {available}. "
                    f"Add it to your SELECT or alias one of them AS {id_column}."
                )
            if columns:
                invalid = [c for c in columns if c not in available]
                if invalid:
                    conn.close()
                    raise ValueError(
                        f"Columns not in result set: {invalid}. Available: {available}"
                    )
                selected = columns
            else:
                selected = available
            use_rowid = False

        else:
            # Table mode — original code path.
            cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
            )
            if not cursor.fetchone():
                raise TableNotFoundError(f"Table '{table}' not found in {db_path}")

            # Validate and resolve columns against actual schema.
            # Double-quote escaping handles table/column names that contain `"`.
            safe_table = table.replace('"', '""')  # type: ignore[union-attr]
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
            row_count = count_cur.fetchone()[0]

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
            logger.info("No records found in %s::%s", db_path, display_name)
        return result

    # Validate row_template against the column schema before processing any rows.
    # A bad template key is a config error — fail fast rather than silently skipping every row.
    if row_template:
        _row_to_text({c: "" for c in selected}, row_template)

    try:
        collection = _get_collection(chroma_path, collection_name, embedding_model)
    except Exception:
        conn.close()
        raise

    if verbose:
        logger.info("Ingesting: %s (%d records)", display_name, row_count)

    source_str = f"{Path(db_path).resolve()}::{namespace_label}"

    # Prefetch chunk-0 metadata indexed by row_id so incremental mode is O(1)
    # per row instead of round-tripping ChromaDB for every existing row.
    # A single broad `get(where=…)` collects everything for this source.
    existing_by_row: dict[str, dict[str, Any]] = {}
    if incremental:
        try:
            prefetch = collection.get(
                where={"$and": [{"source": source_str}, {"chunk": 0}]},
                include=["metadatas"],
            )
            for meta in (prefetch.get("metadatas") or []):
                rid = meta.get("row_id") if isinstance(meta, dict) else None
                if rid is not None:
                    existing_by_row[str(rid)] = meta
        except Exception as e:
            # Prefetch is an optimisation; fall back to per-row checks on error.
            if verbose:
                logger.debug("incremental prefetch failed (%s); falling back per-row", e)
            existing_by_row = {}

    try:
        for rows_done, row in enumerate(cursor, 1):
            row_dict = dict(row)
            row_id = None
            _status = "skipped"
            _skip_reason = ""

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
                if not text_dict and not row_template:
                    _skip_reason = "empty_text"
                    result.sources_skipped += 1
                    if verbose:
                        logger.debug("[skip] %s[%s]: no content columns populated", display_name, row_id)
                    continue
                text = _row_to_text(text_dict, row_template)
                row_hash = hashlib.sha256(text.encode(), usedforsecurity=False).hexdigest()[:16]

                if incremental:
                    prior_meta = existing_by_row.get(str(row_id))
                    if prior_meta is not None:
                        if prior_meta.get("row_hash") == row_hash:
                            _skip_reason = "hash_match"
                            result.sources_skipped += 1
                            continue
                        # Hash changed — delete all old chunks. Use n_chunks
                        # for the fast path; coerce defensively because rows
                        # ingested before n_chunks existed may not have it.
                        try:
                            n_old = int(prior_meta.get("n_chunks", 1))
                        except (TypeError, ValueError):
                            n_old = 1
                        predicted_ids = [
                            _make_sqlite_id(db_path, namespace_label, row_id, i)
                            for i in range(n_old)
                        ]
                        collection.delete(ids=predicted_ids)
                        # Clean up any extras beyond n_chunks (partial-ingest orphans).
                        orphan_check = collection.get(
                            where={"$and": [{"source": source_str}, {"row_id": str(row_id)}]},
                            include=[],
                        )
                        extras = [id_ for id_ in orphan_check["ids"] if id_ not in set(predicted_ids)]
                        if extras:
                            collection.delete(ids=extras)

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
                        _skip_reason = "empty_text"
                        result.sources_skipped += 1
                        continue

                ids = [_make_sqlite_id(db_path, namespace_label, row_id, i) for i in range(len(chunks))]
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

            except (InterruptedError, KeyboardInterrupt):
                raise
            except Exception as e:
                if verbose:
                    logger.warning("[skip] %s[%s]: %s", display_name, row_id, e)
                result.sources_skipped += 1
                result.add_skip_reason(f"{display_name}[{row_id}]: extract_error: {e}")
                _status = "error"

            finally:
                if _skip_reason:
                    result.add_skip_reason(f"{display_name}[{row_id}]: {_skip_reason}")
                if on_progress:
                    on_progress(IngestProgress(
                        filename=f"{display_name}[{row_id}]",
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
