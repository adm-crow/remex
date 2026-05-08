import sqlite3
from unittest.mock import MagicMock, patch

import pytest

from remex.core.exceptions import SourceNotFoundError, TableNotFoundError
from remex.core.models import IngestResult
from remex.core.sqlite_ingester import ingest_sqlite


def create_test_db(tmp_path, table_name, columns_def, rows):
    """Create a temp SQLite database with one table and return its path."""
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute(f"CREATE TABLE {table_name} ({', '.join(columns_def)})")
    for row in rows:
        placeholders = ", ".join("?" * len(row))
        conn.execute(f"INSERT INTO {table_name} VALUES ({placeholders})", row)
    conn.commit()
    conn.close()
    return db_path


@pytest.fixture
def mock_chroma():
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.get_embedding_function"):
        yield collection


# --- basic ingestion ---

def test_ingest_sqlite_basic(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "title TEXT", "body TEXT"],
        [(1, "Hello", "word " * 30), (2, "World", "text " * 30)],
    )
    ingest_sqlite(db_path=db, table="articles", chroma_path=str(tmp_path / "db"), verbose=False)
    assert mock_chroma.upsert.call_count == 2


def test_ingest_sqlite_is_idempotent(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "docs",
        ["id INTEGER PRIMARY KEY", "content TEXT"],
        [(1, "word " * 30)],
    )
    ingest_sqlite(db_path=db, table="docs", chroma_path=str(tmp_path / "db"), verbose=False)
    ingest_sqlite(db_path=db, table="docs", chroma_path=str(tmp_path / "db"), verbose=False)
    assert mock_chroma.upsert.call_count == 2


# --- column selection ---

def test_ingest_sqlite_with_columns(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "products",
        ["id INTEGER PRIMARY KEY", "name TEXT", "price REAL", "description TEXT"],
        [(1, "Widget", 9.99, "A great widget " * 10)],
    )
    ingest_sqlite(
        db_path=db, table="products",
        columns=["name", "description"],
        chroma_path=str(tmp_path / "db"), verbose=False,
    )
    doc = mock_chroma.upsert.call_args.kwargs["documents"][0]
    assert "Widget" in doc
    assert "9.99" not in doc  # price excluded


# --- row template ---

def test_ingest_sqlite_with_template(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "news",
        ["id INTEGER PRIMARY KEY", "title TEXT", "content TEXT"],
        [(1, "Big News", "Something important " * 10)],
    )
    ingest_sqlite(
        db_path=db, table="news",
        row_template="{title}: {content}",
        chroma_path=str(tmp_path / "db"), verbose=False,
    )
    doc = mock_chroma.upsert.call_args.kwargs["documents"][0]
    assert doc.startswith("Big News:")


# --- metadata ---

def test_ingest_sqlite_metadata_structure(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "docs",
        ["id INTEGER PRIMARY KEY", "content TEXT"],
        [(1, "word " * 30)],
    )
    ingest_sqlite(db_path=db, table="docs", chroma_path=str(tmp_path / "db"), verbose=False)
    meta = mock_chroma.upsert.call_args.kwargs["metadatas"][0]
    assert meta["source_type"] == "sqlite"
    assert "docs" in meta["source"]
    assert "row_id" in meta
    assert "chunk" in meta


# --- rowid fallback ---

def test_ingest_sqlite_uses_rowid_when_no_id_column(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "notes",
        ["title TEXT", "body TEXT"],  # no explicit id column
        [("Note A", "content " * 20), ("Note B", "content " * 20)],
    )
    ingest_sqlite(
        db_path=db, table="notes",
        id_column="id",  # doesn't exist — should fall back to rowid
        chroma_path=str(tmp_path / "db"), verbose=False,
    )
    assert mock_chroma.upsert.call_count == 2


# --- error cases ---

def test_ingest_sqlite_missing_db(tmp_path):
    with pytest.raises(SourceNotFoundError):
        ingest_sqlite(db_path=str(tmp_path / "missing.db"), table="foo",
                      chroma_path=str(tmp_path / "db"))


def test_ingest_sqlite_missing_table(tmp_path):
    db = create_test_db(tmp_path, "articles",
                        ["id INTEGER PRIMARY KEY", "title TEXT"], [(1, "Hello")])
    with pytest.raises(TableNotFoundError):
        ingest_sqlite(db_path=db, table="nonexistent", chroma_path=str(tmp_path / "db"))


def test_ingest_sqlite_invalid_columns(tmp_path):
    db = create_test_db(tmp_path, "articles",
                        ["id INTEGER PRIMARY KEY", "title TEXT"], [(1, "Hello")])
    with pytest.raises(ValueError, match="Columns"):
        ingest_sqlite(db_path=db, table="articles", columns=["nonexistent"],
                      chroma_path=str(tmp_path / "db"))


def test_ingest_sqlite_empty_table(mock_chroma, tmp_path):
    db = create_test_db(tmp_path, "empty",
                        ["id INTEGER PRIMARY KEY", "title TEXT"], [])
    ingest_sqlite(db_path=db, table="empty", chroma_path=str(tmp_path / "db"), verbose=False)
    mock_chroma.upsert.assert_not_called()


def test_ingest_sqlite_template_missing_column(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "title TEXT"],
        [(1, "Hello")],
    )
    with pytest.raises(ValueError, match="row_template"):
        ingest_sqlite(
            db_path=db, table="articles",
            row_template="{title}: {nonexistent}",
            chroma_path=str(tmp_path / "db"), verbose=False,
        )


def test_ingest_sqlite_template_null_value_renders_empty(mock_chroma, tmp_path):
    """NULL column values must render as '' in row_template, not 'None'."""
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "title TEXT", "body TEXT"],
        [(1, None, "body word " * 20)],
    )
    ingest_sqlite(
        db_path=db, table="articles",
        row_template="{title}: {body}",
        chroma_path=str(tmp_path / "db"), verbose=False,
    )
    docs = mock_chroma.upsert.call_args.kwargs["documents"]
    assert all("None" not in d for d in docs)


# --- sentence chunking ---

def test_ingest_sqlite_sentence_chunking(mock_chroma, tmp_path):
    """chunking='sentence' must still produce chunks and call upsert."""
    pytest.importorskip("nltk")
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "The sky is blue. The grass is green. " * 20)],
    )
    ingest_sqlite(
        db_path=db, table="articles",
        chroma_path=str(tmp_path / "db"),
        chunking="sentence", verbose=False,
    )
    assert mock_chroma.upsert.called


# --- on_progress callback ---

def test_ingest_sqlite_on_progress_called_for_each_row(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30), (2, "word " * 30), (3, "word " * 30)],
    )
    calls = []
    ingest_sqlite(
        db_path=db, table="articles",
        chroma_path=str(tmp_path / "db"), verbose=False,
        on_progress=calls.append,
    )
    assert len(calls) == 3
    assert calls[-1].files_done == 3
    assert calls[-1].files_total == 3


def test_ingest_sqlite_on_progress_called_on_skip(mock_chroma, tmp_path):
    """Row with no text (all nulls) is skipped — on_progress still fires."""
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, None)],  # null body → empty text → skipped
    )
    calls = []
    ingest_sqlite(
        db_path=db, table="articles",
        chroma_path=str(tmp_path / "db"), verbose=False,
        on_progress=calls.append,
    )
    assert len(calls) == 1
    assert calls[0].status == "skipped"


def test_ingest_sqlite_on_progress_status_ingested(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30)],
    )
    calls = []
    ingest_sqlite(
        db_path=db, table="articles",
        chroma_path=str(tmp_path / "db"), verbose=False,
        on_progress=calls.append,
    )
    assert calls[0].status == "ingested"
    assert calls[0].chunks_stored > 0


def test_ingest_sqlite_on_progress_counts_accumulate(mock_chroma, tmp_path):
    """chunks_stored in progress must be cumulative across rows."""
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30), (2, "word " * 30)],
    )
    calls = []
    ingest_sqlite(
        db_path=db, table="articles",
        chroma_path=str(tmp_path / "db"), verbose=False,
        on_progress=calls.append,
    )
    assert calls[1].chunks_stored >= calls[0].chunks_stored


# --- model/exception integration ---

def test_ingest_sqlite_table_not_found_is_value_error(tmp_path):
    """TableNotFoundError must also be catchable as ValueError."""
    db = create_test_db(tmp_path, "articles",
                        ["id INTEGER PRIMARY KEY", "title TEXT"], [(1, "Hello")])
    with pytest.raises(ValueError):
        ingest_sqlite(db_path=db, table="nonexistent", chroma_path=str(tmp_path / "db"))


def test_ingest_sqlite_returns_ingest_result(mock_chroma, tmp_path):
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30)],
    )
    result = ingest_sqlite(
        db_path=db, table="articles",
        chroma_path=str(tmp_path / "db"), verbose=False,
    )
    assert isinstance(result, IngestResult)
    assert result.sources_found == 1
    assert result.sources_ingested == 1


def test_ingest_sqlite_row_error_is_skipped(mock_chroma, tmp_path):
    """A row that raises during processing is skipped, not propagated."""
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30)],
    )
    with patch("remex.core.sqlite_ingester.chunk_text", side_effect=RuntimeError("boom")):
        result = ingest_sqlite(
            db_path=db, table="articles",
            chroma_path=str(tmp_path / "db"), verbose=False,
        )
    assert result.sources_ingested == 0
    assert result.sources_skipped == 1
    assert any("extract_error" in r for r in result.skipped_reasons)


# --- incremental mode ---

def test_ingest_sqlite_incremental_skips_unchanged_row(tmp_path):
    """An unchanged row (same hash) must be skipped when incremental=True."""
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30)],
    )
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    # Simulate row already in collection with matching hash
    import hashlib
    from remex.core.sqlite_ingester import _make_sqlite_id
    text = "body: " + "word " * 30  # default serialization includes "body: " prefix
    # Just use the actual serialization that ingest_sqlite produces
    body_text = "word " * 30
    row_hash = hashlib.sha256(f"body: {body_text}".encode(), usedforsecurity=False).hexdigest()[:16]
    check_id = _make_sqlite_id(db, "articles", 1, 0)
    collection.get.return_value = {
        "ids": [check_id],
        "metadatas": [{"row_hash": row_hash, "n_chunks": 1}],
    }

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.get_embedding_function"):
        result = ingest_sqlite(
            db_path=db, table="articles",
            chroma_path=str(tmp_path / "db"), verbose=False,
            incremental=True,
        )

    assert result.sources_skipped == 1
    assert result.sources_ingested == 0
    collection.upsert.assert_not_called()
    assert any("hash_match" in r for r in result.skipped_reasons)


def test_ingest_sqlite_incremental_reingest_changed_row(tmp_path):
    """A row whose hash changed must be re-ingested when incremental=True."""
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30)],
    )
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    # Simulate row already in collection with a DIFFERENT hash
    from remex.core.sqlite_ingester import _make_sqlite_id
    check_id = _make_sqlite_id(db, "articles", 1, 0)
    collection.get.return_value = {
        "ids": [check_id],
        "metadatas": [{"row_hash": "stale_hash_abc123", "n_chunks": 1}],
    }

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.get_embedding_function"):
        result = ingest_sqlite(
            db_path=db, table="articles",
            chroma_path=str(tmp_path / "db"), verbose=False,
            incremental=True,
        )

    assert result.sources_ingested == 1
    collection.delete.assert_called_once()  # old chunks removed
    collection.upsert.assert_called_once()  # new chunks inserted


def test_ingest_sqlite_incremental_new_row_always_ingested(tmp_path):
    """A row not yet in the collection must be ingested when incremental=True."""
    db = create_test_db(
        tmp_path, "articles",
        ["id INTEGER PRIMARY KEY", "body TEXT"],
        [(1, "word " * 30)],
    )
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    # Simulate row not present in collection
    collection.get.return_value = {"ids": [], "metadatas": []}

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.get_embedding_function"):
        result = ingest_sqlite(
            db_path=db, table="articles",
            chroma_path=str(tmp_path / "db"), verbose=False,
            incremental=True,
        )

    assert result.sources_ingested == 1
    assert result.sources_skipped == 0
    collection.upsert.assert_called_once()
