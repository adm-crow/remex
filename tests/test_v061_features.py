"""Tests for v0.6.1 features:
- IngestResult.skipped_reasons
- PurgeResult typed return
- reset() confirm guard
- Embedding model mismatch detection
"""

from unittest.mock import MagicMock, patch

import pytest

from synapse_core.models import IngestResult, PurgeResult
from synapse_core.pipeline import _get_collection, ingest, purge, reset


def make_docs_dir(tmp_path, *filenames_and_contents):
    tmp_path.mkdir(parents=True, exist_ok=True)
    for filename, content in filenames_and_contents:
        (tmp_path / filename).write_text(content, encoding="utf-8")
    return str(tmp_path)


# =============================================================================
# IngestResult.skipped_reasons
# =============================================================================

def test_skipped_reasons_default_empty_list():
    result = IngestResult()
    assert result.skipped_reasons == []


def test_skipped_reasons_empty_file(tmp_path):
    docs = make_docs_dir(tmp_path / "docs", ("empty.txt", ""))

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(docs, db_path=str(tmp_path / "db"), verbose=False)

    assert result.sources_skipped == 1
    assert len(result.skipped_reasons) == 1
    assert "empty.txt" in result.skipped_reasons[0]
    assert "empty" in result.skipped_reasons[0]


def test_skipped_reasons_hash_match(tmp_path):
    """Unchanged file (incremental) must produce a 'hash_match' reason."""
    import hashlib

    content = "Hello world " * 20
    docs = make_docs_dir(tmp_path / "docs", ("doc.txt", content))
    file_path = tmp_path / "docs" / "doc.txt"
    current_hash = hashlib.sha256(file_path.read_bytes(), usedforsecurity=False).hexdigest()

    collection = MagicMock()
    collection.metadata = None
    collection.get.return_value = {
        "ids": ["id0"],
        "metadatas": [{"source_type": "file", "source": str(file_path.resolve()),
                       "chunk": 0, "file_hash": current_hash}],
    }
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(docs, db_path=str(tmp_path / "db"), incremental=True, verbose=False)

    assert result.sources_skipped == 1
    assert len(result.skipped_reasons) == 1
    assert "doc.txt" in result.skipped_reasons[0]
    assert "hash_match" in result.skipped_reasons[0]


def test_skipped_reasons_extract_error(tmp_path):
    """Extraction failure must produce an 'extract_error:' reason."""
    docs = make_docs_dir(tmp_path / "docs", ("broken.txt", "some text"))

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline.extract", side_effect=RuntimeError("read failed")):
        result = ingest(docs, db_path=str(tmp_path / "db"), verbose=False)

    assert result.sources_skipped == 1
    assert len(result.skipped_reasons) == 1
    assert "broken.txt" in result.skipped_reasons[0]
    assert "extract_error" in result.skipped_reasons[0]


def test_skipped_reasons_ingested_file_not_in_reasons(tmp_path):
    """Successfully ingested files must not appear in skipped_reasons."""
    docs = make_docs_dir(tmp_path / "docs", ("ok.txt", "word " * 100))

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(docs, db_path=str(tmp_path / "db"), verbose=False)

    assert result.sources_ingested == 1
    assert result.skipped_reasons == []


def test_skipped_reasons_multiple_files_mixed(tmp_path):
    """skipped_reasons contains one entry per skipped file, ingested files excluded."""
    docs = make_docs_dir(
        tmp_path / "docs",
        ("ok.txt", "word " * 100),
        ("empty.txt", ""),
    )

    with patch("synapse_core.pipeline.chromadb.PersistentClient"), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        result = ingest(docs, db_path=str(tmp_path / "db"), verbose=False)

    assert result.sources_ingested == 1
    assert result.sources_skipped == 1
    assert len(result.skipped_reasons) == 1
    assert "empty.txt" in result.skipped_reasons[0]


# =============================================================================
# PurgeResult
# =============================================================================

def test_purge_returns_purge_result(tmp_path):
    collection = MagicMock()
    collection.get.return_value = {"ids": [], "metadatas": []}
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert isinstance(result, PurgeResult)


def test_purge_result_chunks_deleted(tmp_path):
    existing_file = tmp_path / "existing.txt"
    existing_file.write_text("hello", encoding="utf-8")

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1", "id2"],
        "metadatas": [
            {"source": str(tmp_path / "gone.txt"), "chunk": 0},   # stale
            {"source": str(existing_file), "chunk": 0},            # live
        ],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_deleted == 1


def test_purge_result_chunks_checked(tmp_path):
    existing_file = tmp_path / "file.txt"
    existing_file.write_text("hello", encoding="utf-8")

    collection = MagicMock()
    collection.get.return_value = {
        "ids": ["id1", "id2", "id3"],
        "metadatas": [
            {"source": str(existing_file), "chunk": 0},
            {"source": str(existing_file), "chunk": 1},
            {"source": str(existing_file), "chunk": 2},
        ],
    }
    client = MagicMock()
    client.get_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_checked == 3
    assert result.chunks_deleted == 0


def test_purge_result_collection_not_found_returns_zero(tmp_path):
    client = MagicMock()
    client.get_collection.side_effect = ValueError("not found")

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client):
        result = purge(db_path=str(tmp_path / "db"), verbose=False)

    assert result.chunks_deleted == 0
    assert result.chunks_checked == 0


# =============================================================================
# reset() confirm guard
# =============================================================================

def test_reset_without_confirm_raises():
    with pytest.raises(ValueError, match="confirm=True"):
        reset()


def test_reset_with_confirm_false_raises():
    with pytest.raises(ValueError):
        reset(confirm=False)


def test_reset_with_confirm_true_deletes(tmp_path):
    client = MagicMock()
    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client):
        reset(db_path=str(tmp_path / "db"), verbose=False, confirm=True)
    client.delete_collection.assert_called_once_with(name="synapse")


def test_cli_reset_passes_confirm_true(tmp_path):
    """The CLI must pass confirm=True to reset() after user confirmation."""
    from click.testing import CliRunner
    from synapse_core.cli import cli

    with patch("synapse_core.cli.reset") as mock_reset:
        result = CliRunner().invoke(cli, ["reset", "--yes"])
    assert result.exit_code == 0
    assert mock_reset.call_args.kwargs.get("confirm") is True


# =============================================================================
# Embedding model mismatch detection
# =============================================================================

def test_embedding_model_mismatch_warns(tmp_path):
    """A warning must be logged when stored model differs from requested model."""
    collection = MagicMock()
    collection.metadata = {"embedding_model": "paraphrase-MiniLM-L6-v2"}
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline.logger") as mock_logger:
        _get_collection(str(tmp_path / "db"), "synapse", "all-MiniLM-L6-v2", create=True)

    warning_calls = [str(c) for c in mock_logger.warning.call_args_list]
    assert any("mismatch" in w.lower() for w in warning_calls)


def test_embedding_model_match_no_warning(tmp_path):
    """No warning when stored model matches requested model."""
    collection = MagicMock()
    collection.metadata = {"embedding_model": "all-MiniLM-L6-v2"}
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline.logger") as mock_logger:
        _get_collection(str(tmp_path / "db"), "synapse", "all-MiniLM-L6-v2", create=True)

    warning_calls = [str(c) for c in mock_logger.warning.call_args_list]
    assert not any("mismatch" in w.lower() for w in warning_calls)


def test_embedding_model_no_metadata_no_warning(tmp_path):
    """Pre-v0.6.1 collections with no metadata must not trigger a warning."""
    collection = MagicMock()
    collection.metadata = None  # simulates old collection with no metadata
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"), \
         patch("synapse_core.pipeline.logger") as mock_logger:
        _get_collection(str(tmp_path / "db"), "synapse", "all-MiniLM-L6-v2", create=True)

    warning_calls = [str(c) for c in mock_logger.warning.call_args_list]
    assert not any("mismatch" in w.lower() for w in warning_calls)


def test_embedding_model_stored_in_collection_metadata(tmp_path):
    """get_or_create_collection must be called with embedding_model in metadata."""
    collection = MagicMock()
    collection.metadata = {"embedding_model": "all-MiniLM-L6-v2"}
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("synapse_core.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse_core.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        _get_collection(str(tmp_path / "db"), "synapse", "all-MiniLM-L6-v2", create=True)

    call_kwargs = client.get_or_create_collection.call_args.kwargs
    assert call_kwargs.get("metadata", {}).get("embedding_model") == "all-MiniLM-L6-v2"
