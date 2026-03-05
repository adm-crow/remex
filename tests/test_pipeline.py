import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from synapse.pipeline import ingest


def make_docs_dir(*filenames_and_contents):
    """Create a temp directory with the given (filename, content) pairs."""
    tmpdir = tempfile.mkdtemp()
    for filename, content in filenames_and_contents:
        Path(tmpdir, filename).write_text(content, encoding="utf-8")
    return tmpdir


@pytest.fixture
def mock_chroma():
    """Patch chromadb so tests run without installing it or hitting disk."""
    collection = MagicMock()
    client = MagicMock()
    client.get_or_create_collection.return_value = collection

    with patch("synapse.pipeline.chromadb.PersistentClient", return_value=client), \
         patch("synapse.pipeline.embedding_functions.SentenceTransformerEmbeddingFunction"):
        yield collection


def test_ingest_txt_file(mock_chroma):
    docs = make_docs_dir(("hello.txt", "Hello world " * 10))
    ingest(source_dir=docs, db_path="/tmp/fake_db", verbose=False)
    assert mock_chroma.upsert.called


def test_ingest_multiple_files(mock_chroma):
    docs = make_docs_dir(
        ("a.txt", "Content of A " * 20),
        ("b.md", "Content of B " * 20),
    )
    ingest(source_dir=docs, db_path="/tmp/fake_db", verbose=False)
    assert mock_chroma.upsert.call_count == 2


def test_ingest_is_idempotent(mock_chroma):
    """Running ingest twice should call upsert both times (not insert)."""
    docs = make_docs_dir(("doc.txt", "Some text " * 10))
    ingest(source_dir=docs, db_path="/tmp/fake_db", verbose=False)
    ingest(source_dir=docs, db_path="/tmp/fake_db", verbose=False)
    assert mock_chroma.upsert.call_count == 2


def test_ingest_skips_unsupported_files(mock_chroma):
    docs = make_docs_dir(("image.png", b"fake png data".decode()))
    ingest(source_dir=docs, db_path="/tmp/fake_db", verbose=False)
    mock_chroma.upsert.assert_not_called()


def test_ingest_empty_file_is_skipped(mock_chroma):
    docs = make_docs_dir(("empty.txt", ""))
    ingest(source_dir=docs, db_path="/tmp/fake_db", verbose=False)
    mock_chroma.upsert.assert_not_called()


def test_ingest_missing_directory_raises():
    with pytest.raises(FileNotFoundError):
        ingest(source_dir="/nonexistent/path", db_path="/tmp/fake_db")


def test_upsert_payload_structure(mock_chroma):
    """Verify that ids, documents and metadatas are passed to upsert."""
    docs = make_docs_dir(("test.txt", "word " * 100))
    ingest(source_dir=docs, db_path="/tmp/fake_db", verbose=False)

    call_kwargs = mock_chroma.upsert.call_args.kwargs
    assert "ids" in call_kwargs
    assert "documents" in call_kwargs
    assert "metadatas" in call_kwargs
    assert len(call_kwargs["ids"]) == len(call_kwargs["documents"])
