import hashlib
from unittest.mock import MagicMock, patch

import pytest
from chromadb.errors import NotFoundError as ChromaNotFoundError

from remex.core.exceptions import CollectionNotFoundError
from remex.core.pipeline import (
    collection_stats,
    delete_source,
    ingest,
    ingest_async,
    ingest_many,
    list_collections,
    purge,
    query,
    query_async,
    reset,
    sources,
)


def make_docs_dir(tmp_path, *filenames_and_contents):
    """Populate tmp_path with (filename, content) pairs and return its str path."""
    for filename, content in filenames_and_contents:
        p = tmp_path / filename
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")
    return str(tmp_path)


@pytest.fixture
def mock_chroma():
    """Patch chromadb so tests run without installing it or hitting disk."""
    collection = MagicMock()
    collection.count.return_value = 1000  # large enough for all query tests
    client = MagicMock()
    client.get_or_create_collection.return_value = collection
    client.get_collection.return_value = collection  # used by query()

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        yield collection


# --- ingest ---

def test_ingest_txt_file(mock_chroma, tmp_path):
    docs = make_docs_dir(tmp_path, ("hello.txt", "Hello world " * 10))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    assert mock_chroma.upsert.called


def test_ingest_multiple_files(mock_chroma, tmp_path):
    docs = make_docs_dir(
        tmp_path,
        ("a.txt", "Content of A " * 20),
        ("b.md", "Content of B " * 20),
    )
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    # Batch upsert may combine small files into a single call.
    assert mock_chroma.upsert.call_count >= 1
    # All chunks from both files must appear across all upsert calls.
    total_ids = sum(
        len(call.kwargs["ids"]) for call in mock_chroma.upsert.call_args_list
    )
    assert total_ids >= 2  # at least one chunk per file


def test_ingest_is_idempotent(mock_chroma, tmp_path):
    """Running ingest twice should call upsert both times (not insert)."""
    docs = make_docs_dir(tmp_path, ("doc.txt", "Some text " * 10))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    assert mock_chroma.upsert.call_count == 2


def test_ingest_skips_unsupported_files(mock_chroma, tmp_path):
    docs = make_docs_dir(tmp_path, ("image.png", "fake png data"))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    mock_chroma.upsert.assert_not_called()


def test_ingest_empty_file_is_skipped(mock_chroma, tmp_path):
    docs = make_docs_dir(tmp_path, ("empty.txt", ""))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    mock_chroma.upsert.assert_not_called()


def test_ingest_missing_directory_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        ingest(source_dir=str(tmp_path / "nonexistent"), db_path=str(tmp_path / "db"))


def test_upsert_payload_structure(mock_chroma, tmp_path):
    """Verify that ids, documents and metadatas are passed to upsert."""
    docs = make_docs_dir(tmp_path, ("test.txt", "word " * 100))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)

    # With batch upserts the call may be the first or only call
    assert mock_chroma.upsert.call_count >= 1
    call_kwargs = mock_chroma.upsert.call_args_list[0].kwargs
    assert "ids" in call_kwargs
    assert "documents" in call_kwargs
    assert "metadatas" in call_kwargs
    assert len(call_kwargs["ids"]) == len(call_kwargs["documents"])
    assert len(call_kwargs["metadatas"]) > 0
    assert call_kwargs["metadatas"][0]["source_type"] == "file"


def test_upsert_payload_contains_doc_metadata(mock_chroma, tmp_path):
    """Every chunk metadata must contain the three doc_* fields."""
    docs = make_docs_dir(tmp_path, ("test.txt", "word " * 100))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)

    for meta in mock_chroma.upsert.call_args.kwargs["metadatas"]:
        assert "doc_title" in meta
        assert "doc_author" in meta
        assert "doc_created" in meta


def test_query_result_contains_doc_metadata_fields(mock_chroma, tmp_path):
    """query() results must always include doc_title, doc_author, doc_created."""
    mock_chroma.query.return_value = {
        "documents": [["chunk one"]],
        "metadatas": [[{"source": "/a.txt", "source_type": "file", "chunk": 0,
                        "doc_title": "My Doc", "doc_author": "Alice", "doc_created": "2024-01-01"}]],
        "distances": [[0.1]],
    }
    results = query(text="test", db_path=str(tmp_path / "db"))
    assert results[0]["doc_title"] == "My Doc"
    assert results[0]["doc_author"] == "Alice"
    assert results[0]["doc_created"] == "2024-01-01"


def test_query_result_doc_metadata_defaults_to_empty_string(mock_chroma, tmp_path):
    """Older chunks without doc_* metadata must return empty strings, not KeyError."""
    mock_chroma.query.return_value = {
        "documents": [["chunk one"]],
        "metadatas": [[{"source": "/a.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.1]],
    }
    results = query(text="test", db_path=str(tmp_path / "db"))
    assert results[0]["doc_title"] == ""
    assert results[0]["doc_author"] == ""
    assert results[0]["doc_created"] == ""


# --- purge ---

def test_purge_removes_stale_chunks(tmp_path):
    existing_file = tmp_path / "existing.txt"
    existing_file.write_text("hello", encoding="utf-8")

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1", "id2"],
        "metadatas": [
            {"source": str(tmp_path / "deleted.txt"), "chunk": 0},  # stale
            {"source": str(existing_file), "chunk": 0},              # live
        ],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_deleted == 1
    collection.delete.assert_called_once_with(ids=["id1"])


def test_purge_keeps_sqlite_chunks_when_db_exists(tmp_path):
    db_file = tmp_path / "data.db"
    db_file.write_text("", encoding="utf-8")  # just needs to exist on disk

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1"],
        "metadatas": [{
            "source_type": "sqlite",
            "source": f"{db_file}::articles",
            "chunk": 0,
        }],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_deleted == 0  # db file still exists — chunks must NOT be purged


def test_purge_removes_sqlite_chunks_when_db_missing(tmp_path):
    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1"],
        "metadatas": [{
            "source_type": "sqlite",
            "source": str(tmp_path / "gone.db::articles"),
            "chunk": 0,
        }],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_deleted == 1  # db file is gone — chunks must be purged


def test_purge_nothing_when_all_exist(tmp_path):
    existing_file = tmp_path / "file.txt"
    existing_file.write_text("hello", encoding="utf-8")

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1"],
        "metadatas": [{"source": str(existing_file), "chunk": 0}],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_deleted == 0
    collection.delete.assert_not_called()


def test_purge_result_has_chunks_checked(tmp_path):
    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1", "id2"],
        "metadatas": [
            {"source": str(tmp_path / "gone1.txt"), "chunk": 0},
            {"source": str(tmp_path / "gone2.txt"), "chunk": 0},
        ],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_checked == 2
    assert result.chunks_deleted == 2


# --- reset ---

def test_reset_deletes_collection(tmp_path):
    client = MagicMock()
    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        reset(db_path=str(tmp_path / "db"), verbose=False, confirm=True)
    client.delete_collection.assert_called_once_with(name="remex")


def test_reset_without_confirm_raises(tmp_path):
    with pytest.raises(ValueError, match="confirm=True"):
        reset(db_path=str(tmp_path / "db"), confirm=False)


def test_reset_confirm_false_does_not_touch_chroma(tmp_path):
    client = MagicMock()
    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        with pytest.raises(ValueError):
            reset(db_path=str(tmp_path / "db"), confirm=False)
    client.delete_collection.assert_not_called()


# --- sources ---

def test_sources_returns_unique_sorted_files(tmp_path):
    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1", "id2", "id3"],
        "metadatas": [
            {"source": "/docs/b.txt", "chunk": 0},
            {"source": "/docs/a.txt", "chunk": 0},
            {"source": "/docs/b.txt", "chunk": 1},  # duplicate
        ],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = sources(db_path=str(tmp_path / "db"))

    assert result == ["/docs/a.txt", "/docs/b.txt"]


def test_sources_returns_empty_if_no_collection(tmp_path):
    client = MagicMock()
    client.get_collection.side_effect = ValueError("Collection not found")

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = sources(db_path=str(tmp_path / "db"))

    assert result == []


# --- query ---

def test_query_returns_list_of_dicts(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {
        "documents": [["chunk one", "chunk two"]],
        "metadatas": [[
            {"source": "/docs/a.txt", "source_type": "file", "chunk": 0},
            {"source": "/data.db::articles", "source_type": "sqlite", "chunk": 1},
        ]],
        "distances": [[0.1, 0.5]],
    }
    results = query(text="test query", db_path=str(tmp_path / "db"))
    assert len(results) == 2
    assert results[0]["text"] == "chunk one"
    assert results[0]["source"] == "/docs/a.txt"
    assert results[0]["source_type"] == "file"
    assert results[0]["chunk"] == 0
    assert results[0]["distance"] == 0.1
    assert results[0]["score"] == round(1 / 1.1, 4)
    assert results[1]["source_type"] == "sqlite"


def test_query_score_perfect_at_zero_distance(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {
        "documents": [["exact match"]],
        "metadatas": [[{"source": "/a.txt", "chunk": 0}]],
        "distances": [[0.0]],
    }
    results = query(text="test", db_path=str(tmp_path / "db"))
    assert results[0]["score"] == 1.0


def test_query_empty_collection_returns_empty(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {
        "documents": [[]],
        "metadatas": [[]],
        "distances": [[]],
    }
    results = query(text="test", db_path=str(tmp_path / "db"))
    assert results == []


def test_query_raises_if_collection_not_found(tmp_path):
    client = MagicMock()
    client.get_collection.side_effect = ValueError("Collection not found")

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        with pytest.raises(CollectionNotFoundError):
            query(text="test", db_path=str(tmp_path / "db"))


def test_query_raises_collection_not_found_on_chroma_not_found_error(tmp_path):
    """Real chromadb raises NotFoundError (not ValueError) — must still produce CollectionNotFoundError."""
    client = MagicMock()
    client.get_collection.side_effect = ChromaNotFoundError("Collection nonexistent does not exist")

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        with pytest.raises(CollectionNotFoundError):
            query(text="test", db_path=str(tmp_path / "db"))


# --- incremental ingestion ---

def test_incremental_skips_unchanged_file(tmp_path):
    """File with same hash as stored → upsert must NOT be called."""
    content = "Hello world " * 20
    docs = make_docs_dir(tmp_path, ("doc.txt", content))
    file_path = tmp_path / "doc.txt"

    current_hash = hashlib.sha256(file_path.read_bytes(), usedforsecurity=False).hexdigest()

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id0"],
        "metadatas": [{"source_type": "file", "source": str(file_path), "chunk": 0, "file_hash": current_hash}],
    }
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(source_dir=docs, db_path=str(tmp_path / "db"), incremental=True, verbose=False)

    collection.upsert.assert_not_called()


def test_incremental_reingests_changed_file(tmp_path):
    """File with different stored hash → delete old chunks + upsert new ones."""
    content = "Hello world " * 20
    docs = make_docs_dir(tmp_path, ("doc.txt", content))
    file_path = tmp_path / "doc.txt"

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["old_id0"],
        "metadatas": [{"source_type": "file", "source": str(file_path), "chunk": 0, "file_hash": "stale_hash"}],
    }
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(source_dir=docs, db_path=str(tmp_path / "db"), incremental=True, verbose=False)

    collection.delete.assert_called_once_with(ids=["old_id0"])
    assert collection.upsert.called


def test_incremental_ingests_new_file(tmp_path):
    """File with no existing chunks → ingest as normal."""
    docs = make_docs_dir(tmp_path, ("new.txt", "Brand new content " * 10))

    collection = MagicMock()
    collection.get.return_value = {"ids": [], "metadatas": []}
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(source_dir=docs, db_path=str(tmp_path / "db"), incremental=True, verbose=False)

    collection.delete.assert_not_called()
    assert collection.upsert.called


def test_incremental_stores_hash_in_metadata(tmp_path):
    """Metadata must contain file_hash when incremental=True."""
    docs = make_docs_dir(tmp_path, ("doc.txt", "word " * 50))

    collection = MagicMock()
    collection.get.return_value = {"ids": [], "metadatas": []}
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(source_dir=docs, db_path=str(tmp_path / "db"), incremental=True, verbose=False)

    metadatas = collection.upsert.call_args.kwargs["metadatas"]
    assert all("file_hash" in m for m in metadatas)


def test_non_incremental_does_not_store_hash(mock_chroma, tmp_path):
    """Default (incremental=False) must NOT add file_hash to metadata."""
    docs = make_docs_dir(tmp_path, ("doc.txt", "word " * 50))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)

    metadatas = mock_chroma.upsert.call_args.kwargs["metadatas"]
    assert all("file_hash" not in m for m in metadatas)


# --- sentence chunking ---

def test_ingest_sentence_chunking(mock_chroma, tmp_path):
    """chunking='sentence' must still produce chunks and call upsert."""
    pytest.importorskip("nltk")
    text = "The sky is blue. The grass is green. " * 30
    docs = make_docs_dir(tmp_path, ("doc.txt", text))
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), chunking="sentence", verbose=False)
    assert mock_chroma.upsert.called


# --- query: n_results clamping ---

def test_query_clamps_n_results_to_collection_size(tmp_path):
    """query() must not crash when n_results > number of documents in collection."""
    collection = MagicMock()
    collection.count.return_value = 2
    collection.query.return_value = {
        "documents": [["chunk one", "chunk two"]],
        "metadatas": [[
            {"source": "/a.txt", "source_type": "file", "chunk": 0},
            {"source": "/b.txt", "source_type": "file", "chunk": 0},
        ]],
        "distances": [[0.1, 0.2]],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        results = query(text="test", db_path=str(tmp_path / "db"), n_results=10)

    called_n = collection.query.call_args.kwargs["n_results"]
    assert called_n == 2
    assert len(results) == 2


def test_query_n_results_zero_raises(tmp_path):
    with pytest.raises(ValueError, match="n_results"):
        query(text="test", db_path=str(tmp_path / "db"), n_results=0)


def test_query_n_results_negative_raises(tmp_path):
    with pytest.raises(ValueError, match="n_results"):
        query(text="test", db_path=str(tmp_path / "db"), n_results=-1)


def test_query_returns_empty_on_empty_collection(tmp_path):
    """query() must return [] immediately when the collection is empty."""
    collection = MagicMock()
    collection.count.return_value = 0
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        results = query(text="test", db_path=str(tmp_path / "db"))

    collection.query.assert_not_called()
    assert results == []


# --- progress callback ---

def test_ingest_on_progress_called_for_each_file(mock_chroma, tmp_path):
    docs = make_docs_dir(
        tmp_path,
        ("a.txt", "word " * 30),
        ("b.txt", "word " * 30),
    )
    calls = []
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False, on_progress=calls.append)
    assert len(calls) == 2
    assert calls[0].files_total == 2
    assert calls[-1].files_done == 2


def test_ingest_on_progress_called_even_on_skip(mock_chroma, tmp_path):
    """Empty file is skipped — on_progress must still fire."""
    docs = make_docs_dir(tmp_path, ("empty.txt", ""))
    calls = []
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False, on_progress=calls.append)
    assert len(calls) == 1
    assert calls[0].status == "skipped"


def test_ingest_on_progress_status_ingested(mock_chroma, tmp_path):
    docs = make_docs_dir(tmp_path, ("doc.txt", "word " * 30))
    calls = []
    ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False, on_progress=calls.append)
    assert calls[0].status == "ingested"
    assert calls[0].chunks_stored > 0


# --- skipped_reasons ---

def test_ingest_skipped_reasons_empty_file(mock_chroma, tmp_path):
    docs = make_docs_dir(tmp_path, ("empty.txt", ""))
    result = ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    assert len(result.skipped_reasons) == 1
    assert "empty" in result.skipped_reasons[0]


def test_ingest_skipped_reasons_hash_match(tmp_path):
    content = "word " * 30
    docs = make_docs_dir(tmp_path, ("doc.txt", content))
    file_path = tmp_path / "doc.txt"
    current_hash = hashlib.sha256(file_path.read_bytes(), usedforsecurity=False).hexdigest()

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id0"],
        "metadatas": [{"source_type": "file", "source": str(file_path), "chunk": 0, "file_hash": current_hash}],
    }
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(source_dir=docs, db_path=str(tmp_path / "db"), incremental=True, verbose=False)

    assert len(result.skipped_reasons) == 1
    assert "hash_match" in result.skipped_reasons[0]


def test_ingest_skipped_reasons_unsupported_not_tracked(mock_chroma, tmp_path):
    """Unsupported files are excluded before the loop — no skipped_reason entry."""
    docs = make_docs_dir(tmp_path, ("image.png", "fake"))
    result = ingest(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    assert result.skipped_reasons == []


# --- multi-collection query ---

def test_query_multi_collection_merges_results(tmp_path):
    col_a = MagicMock()
    col_a.count.return_value = 1
    col_a.query.return_value = {
        "documents": [["chunk from A"]],
        "metadatas": [[{"source": "/a.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.1]],
    }
    col_b = MagicMock()
    col_b.count.return_value = 1
    col_b.query.return_value = {
        "documents": [["chunk from B"]],
        "metadatas": [[{"source": "/b.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.2]],
    }

    def fake_get(db_path, name, model, create=True):
        return col_a if name == "col_a" else col_b

    with patch("remex.core.pipeline._get_collection", side_effect=fake_get):
        results = query(
            text="test",
            db_path=str(tmp_path / "db"),
            collection_names=["col_a", "col_b"],
        )

    assert len(results) == 2
    sources_found = {r["source"] for r in results}
    assert "/a.txt" in sources_found
    assert "/b.txt" in sources_found


def test_query_multi_collection_skips_missing(tmp_path):
    """Missing collection must be silently skipped, not raise."""
    col = MagicMock()
    col.count.return_value = 1
    col.query.return_value = {
        "documents": [["found"]],
        "metadatas": [[{"source": "/a.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.1]],
    }

    def fake_get(db_path, name, model, create=True):
        if name == "missing":
            raise ChromaNotFoundError("not found")
        return col

    with patch("remex.core.pipeline._get_collection", side_effect=fake_get):
        results = query(
            text="test",
            db_path=str(tmp_path / "db"),
            collection_names=["existing", "missing"],
        )

    assert len(results) == 1


def test_query_multi_collection_sorted_by_score(tmp_path):
    """Results from multiple collections must be sorted by score (best first)."""
    col_low = MagicMock()
    col_low.count.return_value = 1
    col_low.query.return_value = {
        "documents": [["low relevance"]],
        "metadatas": [[{"source": "/low.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.9]],  # high distance = low score
    }
    col_high = MagicMock()
    col_high.count.return_value = 1
    col_high.query.return_value = {
        "documents": [["high relevance"]],
        "metadatas": [[{"source": "/high.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.05]],  # low distance = high score
    }

    def fake_get(db_path, name, model, create=True):
        return col_low if name == "col_low" else col_high

    with patch("remex.core.pipeline._get_collection", side_effect=fake_get):
        results = query(
            text="test",
            db_path=str(tmp_path / "db"),
            collection_names=["col_low", "col_high"],
        )

    assert results[0]["source"] == "/high.txt"


# --- where filter ---

def test_query_where_filter_passed_to_chroma(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {"documents": [[]], "metadatas": [[]], "distances": [[]]}
    where = {"source_type": {"$eq": "file"}}
    query(text="test", db_path=str(tmp_path / "db"), where=where)
    assert mock_chroma.query.call_args.kwargs.get("where") == where


def test_query_without_where_no_where_kwarg(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {"documents": [[]], "metadatas": [[]], "distances": [[]]}
    query(text="test", db_path=str(tmp_path / "db"))
    assert "where" not in mock_chroma.query.call_args.kwargs


# --- embedding model mismatch ---

def test_get_collection_warns_on_model_mismatch(tmp_path):
    from remex.core.pipeline import _get_collection
    from remex.core.pipeline import logger as pipeline_logger

    collection = MagicMock()
    collection.metadata = {"embedding_model": "different-model"}
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch.object(pipeline_logger, "warning") as mock_warn:
        _get_collection(str(tmp_path / "db"), "remex", "all-MiniLM-L6-v2")

    mock_warn.assert_called_once()
    assert "mismatch" in mock_warn.call_args[0][0].lower()


def test_get_collection_no_warn_on_model_match(tmp_path):
    from remex.core.pipeline import _get_collection
    from remex.core.pipeline import logger as pipeline_logger

    collection = MagicMock()
    collection.metadata = {"embedding_model": "all-MiniLM-L6-v2"}
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("remex.core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch.object(pipeline_logger, "warning") as mock_warn:
        _get_collection(str(tmp_path / "db"), "remex", "all-MiniLM-L6-v2")

    mock_warn.assert_not_called()


# --- ingest_many ---

def test_ingest_many_ingests_supported_files(mock_chroma, tmp_path):
    (tmp_path / "a.txt").write_text("word " * 30, encoding="utf-8")
    (tmp_path / "b.txt").write_text("word " * 30, encoding="utf-8")
    result = ingest_many(
        [tmp_path / "a.txt", tmp_path / "b.txt"],
        db_path=str(tmp_path / "db"), verbose=False,
    )
    assert result.sources_ingested == 2
    assert mock_chroma.upsert.call_count >= 1  # both files batched into ≥1 upsert call


def test_ingest_many_skips_missing_file(mock_chroma, tmp_path):
    (tmp_path / "real.txt").write_text("word " * 30, encoding="utf-8")
    result = ingest_many(
        [tmp_path / "real.txt", tmp_path / "missing.txt"],
        db_path=str(tmp_path / "db"), verbose=False,
    )
    assert result.sources_ingested == 1
    assert result.sources_skipped == 1
    assert any("missing.txt" in r for r in result.skipped_reasons)


def test_ingest_many_skips_unsupported_file(mock_chroma, tmp_path):
    (tmp_path / "image.png").write_bytes(b"fake png")
    result = ingest_many(
        [tmp_path / "image.png"],
        db_path=str(tmp_path / "db"), verbose=False,
    )
    assert result.sources_ingested == 0
    assert result.sources_skipped == 1



def test_ingest_many_on_progress_called_for_each(mock_chroma, tmp_path):
    (tmp_path / "a.txt").write_text("word " * 30, encoding="utf-8")
    (tmp_path / "b.txt").write_text("word " * 30, encoding="utf-8")
    calls = []
    ingest_many(
        [tmp_path / "a.txt", tmp_path / "b.txt"],
        db_path=str(tmp_path / "db"), verbose=False, on_progress=calls.append,
    )
    assert len(calls) == 2
    assert calls[-1].files_done == 2



# --- ingest_many: incremental ---

def test_ingest_many_incremental_skips_unchanged(mock_chroma, tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text("word " * 30, encoding="utf-8")
    # Simulate stored hash matching current hash
    import hashlib
    current_hash = hashlib.sha256(f.read_bytes(), usedforsecurity=False).hexdigest()
    mock_chroma.get.return_value = {
        "ids": ["abc123"],
        "metadatas": [{"file_hash": current_hash}],
    }
    result = ingest_many([f], db_path=str(tmp_path / "db"), verbose=False, incremental=True)
    assert result.sources_skipped == 1
    assert "hash_match" in result.skipped_reasons[0]
    mock_chroma.upsert.assert_not_called()


def test_ingest_many_incremental_reingest_changed(mock_chroma, tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text("word " * 30, encoding="utf-8")
    mock_chroma.get.return_value = {
        "ids": ["abc123"],
        "metadatas": [{"file_hash": "outdated_hash"}],
    }
    result = ingest_many([f], db_path=str(tmp_path / "db"), verbose=False, incremental=True)
    assert result.sources_ingested == 1
    mock_chroma.delete.assert_called_once_with(ids=["abc123"])
    mock_chroma.upsert.assert_called_once()


def test_ingest_many_incremental_stores_hash(mock_chroma, tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text("word " * 30, encoding="utf-8")
    mock_chroma.get.return_value = {"ids": [], "metadatas": []}
    ingest_many([f], db_path=str(tmp_path / "db"), verbose=False, incremental=True)
    metadatas = mock_chroma.upsert.call_args.kwargs["metadatas"]
    assert all("file_hash" in m for m in metadatas)


# --- ingest_many: streaming ---

def test_ingest_many_streaming_threshold_zero_disables(mock_chroma, tmp_path):
    f = tmp_path / "doc.txt"
    f.write_text("word " * 100, encoding="utf-8")
    with patch("remex.core.pipeline.supports_streaming", return_value=True):
        result = ingest_many(
            [f], db_path=str(tmp_path / "db"), verbose=False, streaming_threshold=0,
        )
    assert result.sources_ingested == 1
    mock_chroma.upsert.assert_called()


# --- integration test (real ChromaDB) ---

def test_integration_ingest_and_query(tmp_path):
    """End-to-end: ingest a real file, query it, get a result back."""
    from remex.core.pipeline import ingest, query
    doc = tmp_path / "docs" / "readme.txt"
    doc.parent.mkdir()
    doc.write_text(
        "The refund policy allows customers to return products within 30 days. "
        "A full refund is issued upon receipt of the returned item. "
        "Contact support@example.com for assistance. " * 5,
        encoding="utf-8",
    )
    db = str(tmp_path / "db")
    result = ingest(source_dir=str(tmp_path / "docs"), db_path=db, verbose=False)
    assert result.sources_ingested == 1
    assert result.chunks_stored >= 1

    hits = query("refund policy", db_path=db, n_results=2)
    assert len(hits) >= 1
    assert hits[0]["score"] > 0
    assert "refund" in hits[0]["text"].lower()


# --- async API ---

@pytest.mark.asyncio
async def test_ingest_async_returns_ingest_result(tmp_path, mock_chroma):
    docs = make_docs_dir(tmp_path / "docs", ("file.txt", "word " * 30))
    result = await ingest_async(source_dir=docs, db_path=str(tmp_path / "db"), verbose=False)
    from remex.core.models import IngestResult
    assert isinstance(result, IngestResult)
    assert result.sources_ingested == 1


@pytest.mark.asyncio
async def test_query_async_returns_list(tmp_path, mock_chroma):
    mock_chroma.query.return_value = {
        "ids": [["id1"]],
        "documents": [["some text"]],
        "metadatas": [[{"source": "f.txt"}]],
        "distances": [[0.1]],
    }
    results = await query_async("hello", db_path=str(tmp_path / "db"))
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_ingest_async_propagates_exception(tmp_path):
    from remex.core.exceptions import SourceNotFoundError
    with pytest.raises(SourceNotFoundError):
        await ingest_async(source_dir=str(tmp_path / "missing"), db_path=str(tmp_path / "db"), verbose=False)


@pytest.mark.asyncio
async def test_query_async_validates_n_results(tmp_path, mock_chroma):
    with pytest.raises(ValueError):
        await query_async("hello", db_path=str(tmp_path / "db"), n_results=0)


# --- list_collections ---

def test_list_collections_returns_sorted_names(tmp_path):
    col_a = MagicMock()
    col_a.name = "alpha"
    col_b = MagicMock()
    col_b.name = "beta"
    client = MagicMock()
    client.list_collections.return_value = [col_b, col_a]  # unsorted on purpose

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = list_collections(db_path=str(tmp_path / "db"))

    assert result == ["alpha", "beta"]


def test_list_collections_empty_when_no_collections(tmp_path):
    client = MagicMock()
    client.list_collections.return_value = []

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = list_collections(db_path=str(tmp_path / "db"))

    assert result == []


def test_list_collections_returns_empty_on_error(tmp_path):
    """If the ChromaDB path doesn't exist, return [] instead of raising."""
    client = MagicMock()
    client.list_collections.side_effect = Exception("path not found")

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        result = list_collections(db_path=str(tmp_path / "db"))

    assert result == []


# --- collection_stats ---

def test_collection_stats_returns_correct_values(tmp_path):
    from remex.core.models import CollectionStats

    collection = MagicMock()
    collection.count.return_value = 10
    collection.metadata = {"embedding_model": "all-MiniLM-L6-v2"}
    collection.get.return_value = {
        "ids": ["id1", "id2", "id3"],
        "metadatas": [
            {"source": "/docs/a.txt"},
            {"source": "/docs/b.txt"},
            {"source": "/docs/a.txt"},  # duplicate
        ],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        stats = collection_stats(db_path=str(tmp_path / "db"), collection_name="remex")

    assert isinstance(stats, CollectionStats)
    assert stats.name == "remex"
    assert stats.total_chunks == 10
    assert stats.total_sources == 2  # deduplicated
    assert stats.embedding_model == "all-MiniLM-L6-v2"


def test_collection_stats_unknown_model_when_no_metadata(tmp_path):
    collection = MagicMock()
    collection.count.return_value = 5
    collection.metadata = None  # old collection without metadata
    collection.get.return_value = {"ids": [], "metadatas": []}
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        stats = collection_stats(db_path=str(tmp_path / "db"))

    assert stats.embedding_model == ""


def test_collection_stats_raises_if_collection_not_found(tmp_path):
    client = MagicMock()
    client.get_collection.side_effect = ValueError("not found")

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        with pytest.raises(CollectionNotFoundError):
            collection_stats(db_path=str(tmp_path / "db"), collection_name="missing")


# --- delete_source ---

def test_delete_source_removes_chunks(tmp_path):
    existing_file = tmp_path / "report.txt"
    existing_file.write_text("hello", encoding="utf-8")
    source_str = str(existing_file.resolve())

    collection = MagicMock()
    collection.get.return_value = {"ids": ["id1", "id2"], "metadatas": [{}, {}]}
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        deleted = delete_source(
            source=str(existing_file),
            db_path=str(tmp_path / "db"),
            verbose=False,
        )

    assert deleted == 2
    collection.delete.assert_called_once_with(ids=["id1", "id2"])
    called_where = collection.get.call_args.kwargs["where"]
    assert called_where == {"source": {"$eq": source_str}}


def test_delete_source_returns_zero_when_not_found(tmp_path):
    collection = MagicMock()
    collection.get.return_value = {"ids": [], "metadatas": []}
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        deleted = delete_source(source="/nonexistent/file.txt", db_path=str(tmp_path / "db"), verbose=False)

    assert deleted == 0
    collection.delete.assert_not_called()


def test_delete_source_raises_if_collection_not_found(tmp_path):
    client = MagicMock()
    client.get_collection.side_effect = ValueError("not found")

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        with pytest.raises(CollectionNotFoundError):
            delete_source(source="/some/file.txt", db_path=str(tmp_path / "db"))


def test_delete_source_sqlite_source_not_normalized(tmp_path):
    """SQLite sources (containing '::') must be passed as-is, not path-resolved."""
    sqlite_source = "/abs/path/to/data.db::articles"

    collection = MagicMock()
    collection.get.return_value = {"ids": ["id1"], "metadatas": [{}]}
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("remex.core.pipeline.chromadb.PersistentClient", return_value=client):
        delete_source(source=sqlite_source, db_path=str(tmp_path / "db"), verbose=False)

    called_where = collection.get.call_args.kwargs["where"]
    assert called_where == {"source": {"$eq": sqlite_source}}


# --- query: min_score ---

def test_query_min_score_filters_low_results(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {
        "documents": [["strong match", "weak match"]],
        "metadatas": [[
            {"source": "/a.txt", "source_type": "file", "chunk": 0},
            {"source": "/b.txt", "source_type": "file", "chunk": 0},
        ]],
        "distances": [[0.05, 2.0]],  # scores: ~0.95, ~0.33
    }
    results = query(text="test", db_path=str(tmp_path / "db"), min_score=0.5)
    assert len(results) == 1
    assert results[0]["text"] == "strong match"


def test_query_min_score_zero_returns_all(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {
        "documents": [["a", "b"]],
        "metadatas": [[
            {"source": "/a.txt", "source_type": "file", "chunk": 0},
            {"source": "/b.txt", "source_type": "file", "chunk": 0},
        ]],
        "distances": [[0.1, 0.9]],
    }
    results = query(text="test", db_path=str(tmp_path / "db"), min_score=0.0)
    assert len(results) == 2


def test_query_min_score_one_returns_only_perfect(mock_chroma, tmp_path):
    mock_chroma.query.return_value = {
        "documents": [["exact", "close"]],
        "metadatas": [[
            {"source": "/a.txt", "source_type": "file", "chunk": 0},
            {"source": "/b.txt", "source_type": "file", "chunk": 0},
        ]],
        "distances": [[0.0, 0.1]],  # scores: 1.0, ~0.91
    }
    results = query(text="test", db_path=str(tmp_path / "db"), min_score=1.0)
    assert len(results) == 1
    assert results[0]["score"] == 1.0


def test_query_min_score_invalid_raises(tmp_path):
    with pytest.raises(ValueError, match="min_score"):
        query(text="test", db_path=str(tmp_path / "db"), min_score=1.5)


def test_query_min_score_negative_raises(tmp_path):
    with pytest.raises(ValueError, match="min_score"):
        query(text="test", db_path=str(tmp_path / "db"), min_score=-0.1)


# --- streaming overlap boundary ---

def test_streaming_no_duplicate_content_at_block_boundary(mock_chroma, tmp_path):
    """Verify that the streaming carry does not double-count content at block edges.

    With ``carry = text[safe_end:]`` the carry has ``tail_size = chunk_size + overlap``
    chars.  Each block feeds into the chunker which produces chunks with ``overlap``
    chars of overlap.  The total number of chars stored across all chunks should be
    roughly file_size + N_chunks * overlap — NOT file_size + N_boundary_blocks * 2*overlap.
    We verify this by asserting the stored content is not larger than the ceiling
    that would result from plain (non-streaming) chunking.
    """
    from unittest.mock import MagicMock, patch
    from remex.core.pipeline import _ingest_file_streaming
    from remex.core.chunker import chunk_text

    full_text = ("word " * 50) * 20   # 5000 chars, plain repetitive text

    file_path = tmp_path / "big.txt"
    file_path.write_text(full_text, encoding="utf-8")

    chunk_size, overlap = 300, 60

    # Reference: what plain (non-streaming) chunking produces
    reference_chunks = chunk_text(full_text, chunk_size=chunk_size, overlap=overlap, mode="word")
    reference_total_chars = sum(len(c) for c in reference_chunks)

    collected_docs: list[str] = []
    col = MagicMock()
    col.upsert.side_effect = lambda **kw: collected_docs.extend(kw.get("documents", []))

    # Feed the file as 4 pages to force multiple block-boundary carry events
    page_size = len(full_text) // 4
    pages = [full_text[i:i + page_size] for i in range(0, len(full_text), page_size)]

    with patch("remex.core.pipeline.extract_streaming", return_value=pages):
        n = _ingest_file_streaming(
            file_path, tmp_path, col, str(file_path),
            chunk_size=chunk_size, overlap=overlap, min_chunk_size=20, mode="word",
            doc_meta={}, incremental=False, current_hash="",
        )

    assert n == len(collected_docs)
    streaming_total_chars = sum(len(c) for c in collected_docs)
    # Streaming may store slightly more or fewer chars than non-streaming due to
    # word-boundary rounding at block edges, but should be within 15% of reference.
    assert abs(streaming_total_chars - reference_total_chars) / reference_total_chars < 0.15, (
        f"Streaming stored {streaming_total_chars} chars vs reference {reference_total_chars} — "
        "likely indicates doubled overlap at block boundaries"
    )


# --- API-level: query and chat schemas ---

def test_query_api_where_too_deep():
    """QueryRequest should reject where filters nested beyond depth 5."""
    from remex.api.schemas import QueryRequest
    import pytest

    deeply_nested = {"a": {"b": {"c": {"d": {"e": {"f": "too deep"}}}}}}
    with pytest.raises(Exception, match="too deeply nested"):
        QueryRequest(text="q", where=deeply_nested)


def test_query_api_where_valid():
    from remex.api.schemas import QueryRequest
    req = QueryRequest(text="q", where={"source_type": {"$eq": "file"}})
    assert req.where == {"source_type": {"$eq": "file"}}


def test_chat_api_where_too_deep():
    from remex.api.schemas import ChatRequest
    import pytest
    deeply_nested = {"a": {"b": {"c": {"d": {"e": {"f": "too deep"}}}}}}
    with pytest.raises(Exception, match="too deeply nested"):
        ChatRequest(text="q", where=deeply_nested)
