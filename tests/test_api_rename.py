"""Tests for the PATCH /collections/{collection}/rename endpoint."""

import pytest
from fastapi.testclient import TestClient
from remex.api.main import app
from remex.core import ingest


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def populated_db(tmp_path):
    """Create a tiny collection so rename has something to copy."""
    docs_dir = tmp_path / "docs"
    docs_dir.mkdir()
    (docs_dir / "hello.txt").write_text("Hello world from the test fixture.")
    ingest(
        source_dir=str(docs_dir),
        db_path=str(tmp_path / "db"),
        collection_name="old-name",
    )
    return str(tmp_path / "db")


def test_rename_collection_success(client, populated_db):
    resp = client.patch(
        "/collections/old-name/rename",
        params={"db_path": populated_db},
        json={"new_name": "new-name"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["renamed"] is True
    assert body["old_name"] == "old-name"
    assert body["new_name"] == "new-name"

    # Old name should no longer exist
    resp2 = client.get(f"/collections?db_path={populated_db}")
    collections = resp2.json()
    assert "old-name" not in collections
    assert "new-name" in collections


def test_rename_collection_not_found(client, tmp_path):
    db_path = str(tmp_path / "empty_db")
    resp = client.patch(
        "/collections/nonexistent/rename",
        params={"db_path": db_path},
        json={"new_name": "other"},
    )
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


def test_rename_collection_conflict(client, populated_db):
    """Renaming to an already-existing name should return 409."""
    # Create a second collection
    import chromadb
    chroma = chromadb.PersistentClient(path=populated_db)
    chroma.create_collection("taken-name")

    resp = client.patch(
        "/collections/old-name/rename",
        params={"db_path": populated_db},
        json={"new_name": "taken-name"},
    )
    assert resp.status_code == 409
    assert "already exists" in resp.json()["detail"].lower()


def test_rename_preserves_documents(client, populated_db):
    """After rename, the new collection should contain the same chunks."""
    # Get stats before rename
    stats_before = client.get(
        "/collections/old-name/stats",
        params={"db_path": populated_db},
    ).json()

    client.patch(
        "/collections/old-name/rename",
        params={"db_path": populated_db},
        json={"new_name": "renamed"},
    )

    stats_after = client.get(
        "/collections/renamed/stats",
        params={"db_path": populated_db},
    ).json()

    assert stats_after["total_chunks"] == stats_before["total_chunks"]
    assert stats_after["total_sources"] == stats_before["total_sources"]
