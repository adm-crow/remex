"""API-level tests for query and chat endpoints."""

from unittest.mock import patch, MagicMock

import pytest
from fastapi.testclient import TestClient

from remex.api.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def mock_query_results():
    return [
        {
            "text": "The refund policy allows 30 days.",
            "source": "/docs/policy.txt",
            "source_type": "file",
            "score": 0.95,
            "distance": 0.05,
            "chunk": 0,
            "doc_title": "",
            "doc_author": "",
            "doc_created": "",
        }
    ]


def test_query_endpoint_returns_results(client, tmp_path, mock_query_results):
    with patch("remex.api.routes.query.query", return_value=mock_query_results):
        resp = client.post(
            "/collections/test/query",
            json={"text": "refund", "db_path": str(tmp_path / "db")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert data[0]["score"] == 0.95


def test_query_endpoint_rejects_invalid_n_results(client, tmp_path):
    resp = client.post(
        "/collections/test/query",
        json={"text": "q", "db_path": str(tmp_path), "n_results": 0},
    )
    assert resp.status_code == 422


def test_query_endpoint_rejects_deeply_nested_where(client, tmp_path):
    deeply_nested = {"a": {"b": {"c": {"d": {"e": {"f": "bad"}}}}}}
    resp = client.post(
        "/collections/test/query",
        json={"text": "q", "db_path": str(tmp_path), "where": deeply_nested},
    )
    assert resp.status_code == 422


def test_chat_endpoint_returns_answer(client, tmp_path, mock_query_results):
    chat_result = {
        "answer": "You can return items within 30 days.",
        "sources": mock_query_results,
        "provider": "anthropic",
        "model": "claude-sonnet-4-5",
    }
    with patch("remex.api.routes.query.query", return_value=mock_query_results), \
         patch("remex.api.routes.query.generate_answer", return_value=chat_result["answer"]):
        resp = client.post(
            "/collections/test/chat",
            json={
                "text": "refund policy?",
                "db_path": str(tmp_path / "db"),
                "provider": "anthropic",
                "model": "claude-sonnet-4-5",
                "api_key": "test-key",
            },
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "answer" in data
    assert data["provider"] == "anthropic"


def test_chat_endpoint_empty_api_key_triggers_error(client, tmp_path):
    """An empty api_key string should be treated as None by the route — not crash."""
    with patch("remex.api.routes.query.query", return_value=[]):
        resp = client.post(
            "/collections/test/chat",
            json={
                "text": "q",
                "db_path": str(tmp_path / "db"),
                "provider": "anthropic",
                "api_key": "",
            },
        )
    # Empty results → 200 with empty sources; or error from provider — either is valid.
    # What must NOT happen is a 500 internal server error from an unhandled crash.
    assert resp.status_code != 500


def test_chat_endpoint_rejects_deeply_nested_where(client, tmp_path):
    deeply_nested = {"a": {"b": {"c": {"d": {"e": {"f": "bad"}}}}}}
    resp = client.post(
        "/collections/test/chat",
        json={"text": "q", "db_path": str(tmp_path), "where": deeply_nested},
    )
    assert resp.status_code == 422
