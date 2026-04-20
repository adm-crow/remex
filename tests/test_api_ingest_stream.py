"""Tests for the SSE ingest stream endpoint."""

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from remex.api.main import app
from remex.core.models import IngestProgress, IngestResult


@pytest.fixture
def client():
    return TestClient(app)


def _make_result(**kwargs) -> IngestResult:
    defaults = dict(sources_found=2, sources_ingested=2, sources_skipped=0,
                    chunks_stored=4, skipped_reasons=[])
    return IngestResult(**{**defaults, **kwargs})


def _parse_events(response_text: str) -> list[dict]:
    events = []
    for line in response_text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


def test_stream_returns_done_event(client, tmp_path):
    result = _make_result()
    progress = IngestProgress(
        filename="doc.txt", files_done=1, files_total=2, status="ingested", chunks_stored=2,
    )

    def fake_ingest(*args, on_progress=None, **kwargs):
        if on_progress:
            on_progress(progress)
        return result

    with patch("remex.api.routes.ingest.ingest", side_effect=fake_ingest):
        resp = client.post(
            "/collections/test/ingest/stream",
            json={"source_dir": str(tmp_path), "db_path": str(tmp_path / "db")},
        )

    assert resp.status_code == 200
    events = _parse_events(resp.text)
    types = [e["type"] for e in events]
    assert "done" in types
    done_event = next(e for e in events if e["type"] == "done")
    assert done_event["result"]["sources_ingested"] == 2
    assert done_event["result"]["chunks_stored"] == 4


def test_stream_emits_progress_events(client, tmp_path):
    def fake_ingest(*args, on_progress=None, **kwargs):
        for i in range(1, 3):
            if on_progress:
                on_progress(IngestProgress(
                    filename=f"file{i}.txt", files_done=i, files_total=2,
                    status="ingested", chunks_stored=i * 2,
                ))
        return _make_result()

    with patch("remex.api.routes.ingest.ingest", side_effect=fake_ingest):
        resp = client.post(
            "/collections/test/ingest/stream",
            json={"source_dir": str(tmp_path), "db_path": str(tmp_path / "db")},
        )

    events = _parse_events(resp.text)
    progress_events = [e for e in events if e["type"] == "progress"]
    assert len(progress_events) == 2
    assert progress_events[0]["filename"] == "file1.txt"
    assert progress_events[1]["files_done"] == 2


def test_stream_emits_error_event_on_ingest_failure(client, tmp_path):
    from remex.core.exceptions import SourceNotFoundError

    with patch("remex.api.routes.ingest.ingest",
               side_effect=SourceNotFoundError("directory not found")):
        resp = client.post(
            "/collections/test/ingest/stream",
            json={"source_dir": str(tmp_path), "db_path": str(tmp_path / "db")},
        )

    assert resp.status_code == 200
    events = _parse_events(resp.text)
    error_events = [e for e in events if e["type"] == "error"]
    assert len(error_events) == 1
    assert "directory not found" in error_events[0]["detail"]


def test_stream_rejects_relative_source_dir(client, tmp_path):
    resp = client.post(
        "/collections/test/ingest/stream",
        json={"source_dir": "relative/path", "db_path": str(tmp_path / "db")},
    )
    assert resp.status_code == 422


def test_stream_rejects_invalid_overlap(client, tmp_path):
    resp = client.post(
        "/collections/test/ingest/stream",
        json={
            "source_dir": str(tmp_path),
            "db_path": str(tmp_path / "db"),
            "chunk_size": 100,
            "overlap": 200,
        },
    )
    assert resp.status_code == 422
