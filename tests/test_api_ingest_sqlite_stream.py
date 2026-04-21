"""Tests for the SSE SQLite ingest stream endpoint."""

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
    defaults = dict(sources_found=3, sources_ingested=3, sources_skipped=0,
                    chunks_stored=6, skipped_reasons=[])
    return IngestResult(**{**defaults, **kwargs})


def _parse_events(response_text: str) -> list[dict]:
    events = []
    for line in response_text.splitlines():
        if line.startswith("data: "):
            events.append(json.loads(line[6:]))
    return events


def test_sqlite_stream_returns_done_event(client, tmp_path):
    import sqlite3
    db = str(tmp_path / "test.db")
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)")
    conn.commit()
    conn.close()

    result = _make_result()

    def fake_ingest_sqlite(*args, on_progress=None, **kwargs):
        if on_progress:
            on_progress(IngestProgress(
                filename="t[1]", files_done=1, files_total=3,
                status="ingested", chunks_stored=2,
            ))
        return result

    with patch("remex.api.routes.ingest.ingest_sqlite", side_effect=fake_ingest_sqlite):
        resp = client.post(
            "/collections/test/ingest/sqlite/stream",
            json={"sqlite_path": db, "table": "t", "db_path": str(tmp_path / "chroma")},
        )

    assert resp.status_code == 200
    events = _parse_events(resp.text)
    types = [e["type"] for e in events]
    assert "progress" in types
    assert "done" in types
    done = next(e for e in events if e["type"] == "done")
    assert done["result"]["sources_ingested"] == 3
    assert done["result"]["chunks_stored"] == 6


def test_sqlite_stream_emits_error_on_failure(client, tmp_path):
    import sqlite3
    db = str(tmp_path / "test.db")
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)")
    conn.commit()
    conn.close()

    from remex.core.exceptions import TableNotFoundError

    with patch("remex.api.routes.ingest.ingest_sqlite",
               side_effect=TableNotFoundError("no such table")):
        resp = client.post(
            "/collections/test/ingest/sqlite/stream",
            json={"sqlite_path": db, "table": "missing", "db_path": str(tmp_path / "chroma")},
        )

    assert resp.status_code == 200
    events = _parse_events(resp.text)
    error_events = [e for e in events if e["type"] == "error"]
    assert len(error_events) == 1
    assert "no such table" in error_events[0]["detail"]


def test_sqlite_stream_rejects_relative_sqlite_path(client, tmp_path):
    resp = client.post(
        "/collections/test/ingest/sqlite/stream",
        json={"sqlite_path": "relative/path.db", "table": "t",
              "db_path": str(tmp_path / "chroma")},
    )
    assert resp.status_code == 422


def test_sqlite_stream_rejects_invalid_overlap(client, tmp_path):
    import sqlite3
    db = str(tmp_path / "test.db")
    conn = sqlite3.connect(db)
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
    conn.commit()
    conn.close()

    resp = client.post(
        "/collections/test/ingest/sqlite/stream",
        json={
            "sqlite_path": db,
            "table": "t",
            "db_path": str(tmp_path / "chroma"),
            "chunk_size": 100,
            "overlap": 200,
        },
    )
    assert resp.status_code == 422
