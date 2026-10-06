"""Host-header allow-list (DNS-rebinding protection) for the loopback sidecar."""

import os
from unittest.mock import patch

from click.testing import CliRunner
from fastapi.testclient import TestClient

from remex.api.main import create_app
from remex.cli import cli


def _clear_allowed_hosts(monkeypatch):
    # setenv first so monkeypatch records the var and removes whatever serve sets.
    monkeypatch.setenv("REMEX_ALLOWED_HOSTS", "")
    monkeypatch.delenv("REMEX_ALLOWED_HOSTS")


def test_loopback_allow_list_rejects_foreign_host(monkeypatch):
    monkeypatch.setenv("REMEX_ALLOWED_HOSTS", "127.0.0.1,localhost")
    app = create_app()
    assert TestClient(app, base_url="http://127.0.0.1:37421").get("/health").status_code == 200
    assert TestClient(app, base_url="http://localhost:37421").get("/health").status_code == 200
    assert TestClient(app, base_url="http://attacker.example:37421").get("/health").status_code == 400


def test_no_allow_list_by_default(monkeypatch):
    _clear_allowed_hosts(monkeypatch)
    app = create_app()
    assert TestClient(app, base_url="http://my-lan-host:8000").get("/health").status_code == 200


def test_serve_restricts_hosts_when_bound_to_loopback(monkeypatch):
    _clear_allowed_hosts(monkeypatch)
    with patch("uvicorn.run") as run, patch("remex.api.bootstrap.bootstrap_sidecar"):
        result = CliRunner().invoke(cli, ["serve", "--host", "127.0.0.1", "--port", "1"])
    assert result.exit_code == 0, result.output
    assert os.environ["REMEX_ALLOWED_HOSTS"] == "127.0.0.1,localhost"
    run.assert_called_once()


def test_serve_leaves_hosts_open_when_bound_to_all_interfaces(monkeypatch):
    _clear_allowed_hosts(monkeypatch)
    with patch("uvicorn.run"), patch("remex.api.bootstrap.bootstrap_sidecar"):
        result = CliRunner().invoke(cli, ["serve", "--host", "0.0.0.0", "--port", "1"])
    assert result.exit_code == 0, result.output
    assert "REMEX_ALLOWED_HOSTS" not in os.environ
