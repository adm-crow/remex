"""Tests for the blocking POST /collections/{collection}/ingest endpoint."""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from remex.api.main import app
from remex.core.models import IngestResult


@pytest.fixture
def client():
    return TestClient(app)


def _make_result(**kwargs) -> IngestResult:
    defaults = dict(sources_found=3, sources_ingested=2, sources_skipped=1,
                    chunks_stored=6, skipped_reasons=["already ingested"])
    return IngestResult(**{**defaults, **kwargs})


def test_ingest_returns_result(client, tmp_path):
    result = _make_result()
    with patch("remex.api.routes.ingest.ingest", return_value=result):
        resp = client.post(
            "/collections/mycol/ingest",
            json={"source_dir": str(tmp_path), "db_path": str(tmp_path / "db")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sources_found"] == 3
    assert data["sources_ingested"] == 2
    assert data["sources_skipped"] == 1
    assert data["chunks_stored"] == 6
    assert data["skipped_reasons"] == ["already ingested"]


def test_ingest_passes_correct_params(client, tmp_path):
    result = _make_result()
    with patch("remex.api.routes.ingest.ingest", return_value=result) as mock_ingest:
        client.post(
            "/collections/mycol/ingest",
            json={
                "source_dir": str(tmp_path),
                "db_path": str(tmp_path / "db"),
                "chunk_size": 500,
                "overlap": 50,
                "incremental": True,
            },
        )
    call_kwargs = mock_ingest.call_args.kwargs
    assert call_kwargs["collection_name"] == "mycol"
    assert call_kwargs["chunk_size"] == 500
    assert call_kwargs["overlap"] == 50
    assert call_kwargs["incremental"] is True


def test_ingest_returns_400_on_remex_error(client, tmp_path):
    from remex.core.exceptions import RemexError
    with patch("remex.api.routes.ingest.ingest", side_effect=RemexError("bad source")):
        resp = client.post(
            "/collections/mycol/ingest",
            json={"source_dir": str(tmp_path), "db_path": str(tmp_path / "db")},
        )
    assert resp.status_code == 400
    assert "bad source" in resp.json()["detail"]


def test_ingest_returns_400_on_file_not_found(client, tmp_path):
    with patch("remex.api.routes.ingest.ingest", side_effect=FileNotFoundError("missing")):
        resp = client.post(
            "/collections/mycol/ingest",
            json={"source_dir": str(tmp_path), "db_path": str(tmp_path / "db")},
        )
    assert resp.status_code == 400


def test_ingest_rejects_relative_source_dir(client, tmp_path):
    resp = client.post(
        "/collections/mycol/ingest",
        json={"source_dir": "./relative/path", "db_path": str(tmp_path / "db")},
    )
    assert resp.status_code == 422
