"""Tests for the public exception hierarchy and data models."""

import sqlite3
from unittest.mock import MagicMock, patch

import pytest

from synapse_core.exceptions import (
    CollectionNotFoundError,
    SourceNotFoundError,
    SynapseError,
    TableNotFoundError,
)
from synapse_core.models import IngestResult, QueryResult
from synapse_core.pipeline import ingest, query
from synapse_core.sqlite_ingester import ingest_sqlite


# ── Exception hierarchy ───────────────────────────────────────────────────────

def test_synapse_error_is_base():
    assert issubclass(CollectionNotFoundError, SynapseError)
    assert issubclass(SourceNotFoundError, SynapseError)
    assert issubclass(TableNotFoundError, SynapseError)


def test_collection_not_found_is_also_value_error():
    """Backward compat: existing except ValueError blocks still catch it."""
    assert issubclass(CollectionNotFoundError, ValueError)
    with pytest.raises(ValueError):
        raise CollectionNotFoundError("test")


def test_source_not_found_is_also_file_not_found():
    """Backward compat: existing except FileNotFoundError blocks still catch it."""
    assert issubclass(SourceNotFoundError, FileNotFoundError)
    with pytest.raises(FileNotFoundError):
        raise SourceNotFoundError("test")


def test_table_not_found_is_also_value_error():
    assert issubclass(TableNotFoundError, ValueError)
    with pytest.raises(ValueError):
        raise TableNotFoundError("test")


# ── ingest() raises SourceNotFoundError ──────────────────────────────────────

def test_ingest_raises_source_not_found(tmp_path):
    with pytest.raises(SourceNotFoundError):
        ingest(source_dir=str(tmp_path / "nonexistent"), db_path=str(tmp_path / "db"))


def test_ingest_source_not_found_is_caught_as_file_not_found(tmp_path):
    """Backward compat."""
    with pytest.raises(FileNotFoundError):
        ingest(source_dir=str(tmp_path / "nonexistent"), db_path=str(tmp_path / "db"))


# ── query() raises CollectionNotFoundError ───────────────────────────────────

def test_query_raises_collection_not_found(tmp_path):
    client = MagicMock()
    client.get_collection.side_effect = ValueError("no collection")
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        with pytest.raises(CollectionNotFoundError):
            query(text="test", db_path=str(tmp_path / "db"))


def test_query_collection_not_found_is_caught_as_value_error(tmp_path):
    """Backward compat."""
    client = MagicMock()
    client.get_collection.side_effect = ValueError("no collection")
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        with pytest.raises(ValueError):
            query(text="test", db_path=str(tmp_path / "db"))


# ── ingest_sqlite() raises SourceNotFoundError / TableNotFoundError ──────────

def test_ingest_sqlite_raises_source_not_found(tmp_path):
    with pytest.raises(SourceNotFoundError):
        ingest_sqlite(db_path=str(tmp_path / "missing.db"), table="foo",
                      chroma_path=str(tmp_path / "db"))


def test_ingest_sqlite_raises_table_not_found(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE real (id INTEGER PRIMARY KEY, title TEXT)")
    conn.commit()
    conn.close()
    with pytest.raises(TableNotFoundError, match="Table"):
        ingest_sqlite(db_path=db_path, table="nonexistent",
                      chroma_path=str(tmp_path / "db"))


def test_ingest_sqlite_table_not_found_is_caught_as_value_error(tmp_path):
    """Backward compat."""
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE real (id INTEGER PRIMARY KEY, title TEXT)")
    conn.commit()
    conn.close()
    with pytest.raises(ValueError):
        ingest_sqlite(db_path=db_path, table="nonexistent",
                      chroma_path=str(tmp_path / "db"))


# ── IngestResult ─────────────────────────────────────────────────────────────

def test_ingest_returns_ingest_result(tmp_path):
    (tmp_path / "doc.txt").write_text("word " * 50, encoding="utf-8")
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(source_dir=str(tmp_path), db_path=str(tmp_path / "db"), verbose=False)
    assert isinstance(result, IngestResult)
    assert result.sources_found == 1
    assert result.sources_ingested == 1
    assert result.sources_skipped == 0
    assert result.chunks_stored > 0


def test_ingest_result_empty_dir(tmp_path):
    docs = tmp_path / "docs"
    docs.mkdir()
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(source_dir=str(docs), db_path=str(tmp_path / "db"), verbose=False)
    assert result.sources_found == 0
    assert result.sources_ingested == 0
    assert result.chunks_stored == 0


def test_ingest_result_skips_unsupported_files(tmp_path):
    (tmp_path / "image.png").write_text("fake", encoding="utf-8")
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(source_dir=str(tmp_path), db_path=str(tmp_path / "db"), verbose=False)
    # unsupported files are filtered before found count
    assert result.sources_found == 0
    assert result.sources_ingested == 0


def test_ingest_result_skipped_on_empty_file(tmp_path):
    (tmp_path / "empty.txt").write_text("", encoding="utf-8")
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(source_dir=str(tmp_path), db_path=str(tmp_path / "db"), verbose=False)
    assert result.sources_found == 1
    assert result.sources_skipped == 1
    assert result.sources_ingested == 0


def test_ingest_sqlite_returns_ingest_result(tmp_path):
    db_path = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path)
    conn.execute("CREATE TABLE docs (id INTEGER PRIMARY KEY, body TEXT)")
    conn.execute("INSERT INTO docs VALUES (1, ?)", ("word " * 30,))
    conn.commit()
    conn.close()
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest_sqlite(db_path=db_path, table="docs",
                               chroma_path=str(tmp_path / "db"), verbose=False)
    assert isinstance(result, IngestResult)
    assert result.sources_found == 1
    assert result.sources_ingested == 1
    assert result.chunks_stored > 0


# ── QueryResult TypedDict ────────────────────────────────────────────────────

def test_query_returns_query_result_shape(tmp_path):
    """query() results must be dicts with the full QueryResult shape."""
    collection = MagicMock()
    collection.count.return_value = 1
    collection.query.return_value = {
        "documents": [["some text"]],
        "metadatas": [[{"source": "/a.txt", "source_type": "file", "chunk": 0,
                        "doc_title": "T", "doc_author": "A", "doc_created": "2024-01-01"}]],
        "distances": [[0.2]],
    }
    client = MagicMock()
    client.get_collection.return_value = collection
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        results = query(text="test", db_path=str(tmp_path / "db"))

    r = results[0]
    # All QueryResult keys must be present
    for key in ("text", "source", "source_type", "score", "distance",
                "chunk", "doc_title", "doc_author", "doc_created"):
        assert key in r, f"missing key: {key}"
    # It is still a plain dict (TypedDict = no runtime change)
    assert isinstance(r, dict)
