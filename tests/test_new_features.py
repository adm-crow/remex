"""Tests for v0.6 features: streaming ingest, progress callback, multi-collection query, where filter."""

from unittest.mock import MagicMock, call, patch

import pytest
from chromadb.errors import NotFoundError as ChromaNotFoundError

from synapse_core.exceptions import CollectionNotFoundError
from synapse_core.models import IngestProgress
from synapse_core.pipeline import ingest, query


def make_docs_dir(tmp_path, *filenames_and_contents):
    tmp_path.mkdir(parents=True, exist_ok=True)
    for filename, content in filenames_and_contents:
        (tmp_path / filename).write_text(content, encoding="utf-8")
    return str(tmp_path)


# =============================================================================
# Item 3 — Progress callback
# =============================================================================

def test_on_progress_called_for_each_file(tmp_path):
    """on_progress must be invoked once per file."""
    docs = make_docs_dir(
        tmp_path / "docs",
        ("a.txt", "hello world " * 50),
        ("b.txt", "another doc " * 50),
    )
    events = []

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(docs, db_path=str(tmp_path / "db"), on_progress=events.append)

    assert len(events) == 2
    assert {e.filename for e in events} == {"a.txt", "b.txt"}
    assert events[-1].files_total == 2
    assert events[-1].files_done == 2


def test_on_progress_status_ingested(tmp_path):
    """Successful files must carry status='ingested'."""
    docs = make_docs_dir(tmp_path / "docs", ("ok.txt", "word " * 100))
    events = []

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(docs, db_path=str(tmp_path / "db"), on_progress=events.append)

    assert events[0].status == "ingested"


def test_on_progress_status_skipped_on_empty_file(tmp_path):
    """Files that produce no chunks must carry status='skipped'."""
    docs = make_docs_dir(tmp_path / "docs", ("empty.txt", ""))
    events = []

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(docs, db_path=str(tmp_path / "db"), on_progress=events.append)

    assert events[0].status == "skipped"


def test_on_progress_cumulative_chunks_stored(tmp_path):
    """chunks_stored in progress events must be non-decreasing."""
    docs = make_docs_dir(
        tmp_path / "docs",
        ("a.txt", "word " * 300),
        ("b.txt", "other " * 300),
    )
    events = []

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(docs, db_path=str(tmp_path / "db"), on_progress=events.append)

    assert events[1].chunks_stored >= events[0].chunks_stored


def test_on_progress_is_ingest_progress_instance(tmp_path):
    """The callback argument must be an IngestProgress dataclass."""
    docs = make_docs_dir(tmp_path / "docs", ("f.txt", "text " * 50))
    events = []

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        ingest(docs, db_path=str(tmp_path / "db"), on_progress=events.append)

    assert isinstance(events[0], IngestProgress)


# =============================================================================
# Item 4 — Multi-collection query
# =============================================================================

def _fake_collection(docs, metas, dists):
    col = MagicMock()
    col.count.return_value = len(docs)
    col.query.return_value = {
        "documents": [docs],
        "metadatas": [metas],
        "distances": [dists],
    }
    return col


def test_query_multi_collection_merges_results(tmp_path):
    """Results from multiple collections must be merged and ranked by score."""
    col_a = _fake_collection(
        ["chunk A"],
        [{"source": "/a.txt", "source_type": "file", "chunk": 0}],
        [0.1],
    )
    col_b = _fake_collection(
        ["chunk B"],
        [{"source": "/b.txt", "source_type": "file", "chunk": 0}],
        [0.5],
    )

    client = MagicMock()
    client.get_collection.side_effect = lambda name, *_, **__: col_a if name == "col_a" else col_b

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        results = query(
            text="test",
            db_path=str(tmp_path / "db"),
            collection_names=["col_a", "col_b"],
        )

    assert len(results) == 2
    assert results[0]["source"] == "/a.txt"   # lower distance → higher score → first
    assert results[1]["source"] == "/b.txt"


def test_query_multi_collection_skips_missing(tmp_path):
    """Missing collections must be silently skipped (no CollectionNotFoundError raised)."""
    col_a = _fake_collection(
        ["chunk"],
        [{"source": "/a.txt", "source_type": "file", "chunk": 0}],
        [0.1],
    )

    def _get(name, *_, **__):
        if name == "missing":
            raise ChromaNotFoundError("missing does not exist")
        return col_a

    client = MagicMock()
    client.get_collection.side_effect = _get

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        results = query(
            text="test",
            db_path=str(tmp_path / "db"),
            collection_names=["col_a", "missing"],
        )

    assert len(results) == 1
    assert results[0]["source"] == "/a.txt"


def test_query_multi_collection_respects_n_results(tmp_path):
    """Merged result list must be capped at n_results."""
    col_a = _fake_collection(
        ["a1", "a2", "a3"],
        [{"source": "/a.txt", "source_type": "file", "chunk": i} for i in range(3)],
        [0.1, 0.2, 0.3],
    )
    col_b = _fake_collection(
        ["b1", "b2"],
        [{"source": "/b.txt", "source_type": "file", "chunk": i} for i in range(2)],
        [0.15, 0.25],
    )
    client = MagicMock()
    client.get_collection.side_effect = lambda name, *_, **__: col_a if name == "a" else col_b

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        results = query(
            text="test",
            db_path=str(tmp_path / "db"),
            collection_names=["a", "b"],
            n_results=3,
        )

    assert len(results) == 3


def test_query_multi_collection_empty_list_returns_empty(tmp_path):
    """collection_names=[] (falsy) must fall through to single-collection mode."""
    col = _fake_collection(
        ["chunk"],
        [{"source": "/f.txt", "source_type": "file", "chunk": 0}],
        [0.1],
    )
    client = MagicMock()
    client.get_collection.return_value = col

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        results = query(
            text="test",
            db_path=str(tmp_path / "db"),
            collection_name="synapse",
            collection_names=[],  # empty → single-collection fallback
        )

    assert len(results) == 1


# =============================================================================
# Item 5 — Metadata filtering (where)
# =============================================================================

def test_query_where_filter_passed_to_chromadb(tmp_path):
    """query(where=...) must forward the dict to collection.query()."""
    collection = MagicMock()
    collection.count.return_value = 2
    collection.query.return_value = {
        "documents": [["chunk"]],
        "metadatas": [[{"source": "/f.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.1]],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    where = {"source_type": {"$eq": "file"}}

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        query(text="test", db_path=str(tmp_path / "db"), where=where)

    call_kwargs = collection.query.call_args.kwargs
    assert call_kwargs.get("where") == where


def test_query_no_where_omits_where_kwarg(tmp_path):
    """When where=None the 'where' key must not appear in the ChromaDB call."""
    collection = MagicMock()
    collection.count.return_value = 1
    collection.query.return_value = {
        "documents": [["chunk"]],
        "metadatas": [[{"source": "/f.txt", "source_type": "file", "chunk": 0}]],
        "distances": [[0.1]],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        query(text="test", db_path=str(tmp_path / "db"), where=None)

    call_kwargs = collection.query.call_args.kwargs
    assert "where" not in call_kwargs


# =============================================================================
# Item 1 — Streaming ingest
# =============================================================================

def test_ingest_uses_streaming_path_for_large_text_files(tmp_path):
    """Files above streaming_threshold + supported format → _ingest_file_streaming called."""
    docs = make_docs_dir(tmp_path / "docs", ("big.txt", "word " * 10_000))

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline._ingest_file_streaming", return_value=5) as mock_stream:
        result = ingest(docs, db_path=str(tmp_path / "db"), streaming_threshold=1)

    mock_stream.assert_called_once()
    assert result.sources_ingested == 1
    assert result.chunks_stored == 5


def test_ingest_skips_streaming_for_small_files(tmp_path):
    """Files below threshold must not use the streaming path."""
    docs = make_docs_dir(tmp_path / "docs", ("small.txt", "hello world"))

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline._ingest_file_streaming") as mock_stream:
        ingest(docs, db_path=str(tmp_path / "db"), streaming_threshold=1_000_000)

    mock_stream.assert_not_called()


def test_ingest_streaming_disabled_when_threshold_zero(tmp_path):
    """streaming_threshold=0 must never use the streaming path."""
    docs = make_docs_dir(tmp_path / "docs", ("big.txt", "word " * 10_000))

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline._ingest_file_streaming") as mock_stream:
        ingest(docs, db_path=str(tmp_path / "db"), streaming_threshold=0)

    mock_stream.assert_not_called()


def test_ingest_streaming_zero_chunks_counts_as_skipped(tmp_path):
    """If streaming returns 0 chunks the file must be counted as skipped."""
    docs = make_docs_dir(tmp_path / "docs", ("big.txt", "word " * 1000))

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline._ingest_file_streaming", return_value=0):
        result = ingest(docs, db_path=str(tmp_path / "db"), streaming_threshold=1)

    assert result.sources_ingested == 0
    assert result.sources_skipped == 1
