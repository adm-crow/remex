import sqlite3
import pytest
from fastapi.testclient import TestClient
from remex.api.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_list_tables_returns_sorted_table_names(client, tmp_path):
    db = tmp_path / "test.db"
    conn = sqlite3.connect(str(db))
    conn.execute("CREATE TABLE users (id INTEGER, name TEXT)")
    conn.execute("CREATE TABLE posts (id INTEGER, body TEXT)")
    conn.close()

    response = client.get(f"/collections/sqlite/tables?path={db}")
    assert response.status_code == 200
    assert response.json() == {"tables": ["posts", "users"]}


def test_list_tables_empty_db(client, tmp_path):
    db = tmp_path / "empty.db"
    sqlite3.connect(str(db)).close()

    response = client.get(f"/collections/sqlite/tables?path={db}")
    assert response.status_code == 200
    assert response.json() == {"tables": []}


def test_list_tables_bad_path(client, tmp_path):
    missing = tmp_path / "nonexistent" / "missing.db"
    response = client.get(f"/collections/sqlite/tables?path={missing}")
    assert response.status_code == 400
    assert "File does not exist" in response.json()["detail"]


def test_list_tables_relative_path_rejected(client):
    response = client.get("/collections/sqlite/tables?path=relative/path.db")
    assert response.status_code == 400
    assert "Path must be absolute" in response.json()["detail"]


def test_list_tables_corrupt_file(client, tmp_path):
    db = tmp_path / "corrupt.db"
    db.write_text("this is not a sqlite database")

    response = client.get(f"/collections/sqlite/tables?path={db}")
    assert response.status_code == 400
    assert "Cannot read SQLite file" in response.json()["detail"]
