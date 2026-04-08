import json as _json
from unittest.mock import MagicMock, patch

from click.testing import CliRunner

import remex.core
from remex.cli import cli


@patch("remex.cli.ingest")
def test_cli_ingest_default_args(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs"])
    assert result.exit_code == 0
    mock_ingest.assert_called_once()
    call_kwargs = mock_ingest.call_args.kwargs
    assert call_kwargs["source_dir"] == "./docs"
    assert call_kwargs["incremental"] is False
    assert call_kwargs["chunking"] == "word"


@patch("remex.cli.ingest")
def test_cli_ingest_incremental_flag(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--incremental"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["incremental"] is True


@patch("remex.cli.ingest")
def test_cli_ingest_sentence_chunking(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--chunking", "sentence"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["chunking"] == "sentence"


@patch("remex.cli.query")
def test_cli_query_returns_results(mock_query):
    mock_query.return_value = [
        {
            "text": "Refunds are accepted within 30 days.",
            "source": "/docs/policy.txt",
            "score": 0.91,
            "chunk": 0,
            "doc_title": "Policy",
            "doc_author": "",
            "doc_created": "",
        }
    ]
    result = CliRunner().invoke(cli, ["query", "refund policy"])
    assert result.exit_code == 0
    assert "0.910" in result.output
    assert "policy.txt" in result.output
    assert "Refunds are accepted" in result.output



@patch("remex.cli.sources")
def test_cli_sources_lists_paths(mock_sources):
    mock_sources.return_value = ["/docs/a.txt", "/docs/b.pdf"]
    result = CliRunner().invoke(cli, ["sources"])
    assert result.exit_code == 0
    assert "/docs/a.txt" in result.output
    assert "/docs/b.pdf" in result.output



@patch("remex.cli.purge")
def test_cli_purge(mock_purge):
    result = CliRunner().invoke(cli, ["purge"])
    assert result.exit_code == 0
    mock_purge.assert_called_once()


@patch("remex.cli.reset")
def test_cli_reset_with_yes_flag(mock_reset):
    result = CliRunner().invoke(cli, ["reset", "--yes"])
    assert result.exit_code == 0
    mock_reset.assert_called_once()


@patch("remex.cli.reset")
def test_cli_reset_aborts_without_confirmation(mock_reset):
    """reset without --yes must prompt; answering 'n' must abort."""
    result = CliRunner().invoke(cli, ["reset"], input="n\n")
    assert result.exit_code != 0
    mock_reset.assert_not_called()


@patch("remex.cli.reset")
def test_cli_reset_passes_confirm_true(mock_reset):
    """CLI reset must always pass confirm=True to the API."""
    result = CliRunner().invoke(cli, ["reset", "--yes"])
    assert result.exit_code == 0
    assert mock_reset.call_args.kwargs.get("confirm") is True


def test_cli_version():
    result = CliRunner().invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert remex.core.__version__ in result.output


# --- ingest-sqlite ---

@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_basic(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, ["ingest-sqlite", "./data.db", "--table", "articles"])
    assert result.exit_code == 0
    mock_ingest_sqlite.assert_called_once()
    kw = mock_ingest_sqlite.call_args.kwargs
    assert kw["db_path"] == "./data.db"
    assert kw["table"] == "articles"
    assert kw["chunking"] == "word"


@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_missing_table_errors(mock_ingest_sqlite):
    """--table is required; omitting it must exit non-zero."""
    result = CliRunner().invoke(cli, ["ingest-sqlite", "./data.db"])
    assert result.exit_code != 0
    mock_ingest_sqlite.assert_not_called()


@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_columns_parsed_as_list(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--columns", "title,body"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["columns"] == ["title", "body"]


@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_id_column_passed(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--id-column", "uuid"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["id_column"] == "uuid"


@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_row_template_passed(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--row-template", "{title}: {body}"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["row_template"] == "{title}: {body}"


@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_chunking_sentence(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--chunking", "sentence"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["chunking"] == "sentence"


# --- --ai flag ---

_FAKE_RESULT = [
    {
        "text": "Refunds are accepted within 30 days.",
        "source": "/docs/policy.txt",
        "score": 0.91,
        "chunk": 0,
        "doc_title": "Policy",
        "doc_author": "",
        "doc_created": "",
    }
]


@patch("remex.cli.generate_answer", return_value="You can return within 30 days.")
@patch("remex.cli.detect_provider", return_value="anthropic")
@patch("remex.cli.query")
def test_cli_query_ai_flag_shows_answer(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund policy", "--ai"])
    assert result.exit_code == 0
    assert "You can return within 30 days." in result.output
    assert "anthropic" in result.output
    assert "Sources" in result.output


@patch("remex.cli.generate_answer", return_value="Answer here.")
@patch("remex.cli.detect_provider", return_value="openai")
@patch("remex.cli.query")
def test_cli_query_ai_explicit_provider(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai", "--provider", "openai"])
    assert result.exit_code == 0
    mock_generate.assert_called_once()
    assert mock_generate.call_args.kwargs["provider"] == "openai"


@patch("remex.cli.generate_answer", return_value="Answer here.")
@patch("remex.cli.detect_provider", return_value="ollama")
@patch("remex.cli.query")
def test_cli_query_ai_model_override(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai", "--model", "mistral"])
    assert result.exit_code == 0
    assert mock_generate.call_args.kwargs["model"] == "mistral"


@patch("remex.cli.detect_provider", return_value=None)
@patch("remex.cli.query")
def test_cli_query_ai_no_provider_detected(mock_query, mock_detect):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai"])
    assert result.exit_code != 0
    assert "no AI provider" in result.output


@patch("remex.cli.generate_answer", side_effect=ImportError("pip install anthropic"))
@patch("remex.cli.detect_provider", return_value="anthropic")
@patch("remex.cli.query")
def test_cli_query_ai_missing_sdk_shows_error(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai"])
    assert result.exit_code != 0
    assert "Error:" in result.output


# --- --format json ---

@patch("remex.cli.query")
def test_cli_query_format_json_outputs_json(mock_query):
    mock_query.return_value = [
        {"text": "chunk", "source": "/a.txt", "score": 0.9, "chunk": 0,
         "source_type": "file", "distance": 0.1, "doc_title": "", "doc_author": "", "doc_created": ""}
    ]
    result = CliRunner().invoke(cli, ["query", "test", "--format", "json"])
    assert result.exit_code == 0
    data = _json.loads(result.output)
    assert isinstance(data, list)
    assert data[0]["source"] == "/a.txt"


@patch("remex.cli.query")
def test_cli_query_format_json_empty_results(mock_query):
    mock_query.return_value = []
    result = CliRunner().invoke(cli, ["query", "test", "--format", "json"])
    assert result.exit_code == 0
    assert _json.loads(result.output) == []


@patch("remex.cli.query")
def test_cli_query_format_json_ai_flag_rejected(mock_query):
    """--format json cannot be combined with --ai."""
    result = CliRunner().invoke(cli, ["query", "test", "--format", "json", "--ai"])
    assert result.exit_code != 0
    mock_query.assert_not_called()


# --- new v0.6 CLI options ---

@patch("remex.cli.ingest")
def test_cli_ingest_min_chunk_size_passed(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--min-chunk-size", "100"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["min_chunk_size"] == 100


@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_min_chunk_size_passed(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--min-chunk-size", "30"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["min_chunk_size"] == 30


@patch("remex.cli.ingest")
def test_cli_ingest_streaming_threshold_converted_to_bytes(mock_ingest):
    """--streaming-threshold N (MB) must be passed as N*1024*1024 bytes."""
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--streaming-threshold", "10"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["streaming_threshold"] == 10 * 1024 * 1024


@patch("remex.cli.ingest")
def test_cli_ingest_streaming_threshold_zero_disables(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--streaming-threshold", "0"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["streaming_threshold"] == 0


@patch("remex.cli.ingest")
def test_cli_ingest_streaming_threshold_negative_rejected(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--streaming-threshold", "-1"])
    assert result.exit_code != 0


@patch("remex.cli.query")
def test_cli_query_where_valid_json(mock_query):
    mock_query.return_value = []
    result = CliRunner().invoke(
        cli, ["query", "test", "--where", '{"source_type": {"$eq": "file"}}']
    )
    assert result.exit_code == 0
    call_kwargs = mock_query.call_args.kwargs
    assert call_kwargs["where"] == {"source_type": {"$eq": "file"}}


@patch("remex.cli.query")
def test_cli_query_where_invalid_json_exits_nonzero(mock_query):
    result = CliRunner().invoke(cli, ["query", "test", "--where", "not json"])
    assert result.exit_code != 0
    assert "not valid JSON" in result.output
    mock_query.assert_not_called()


@patch("remex.cli.query")
def test_cli_query_collections_passed_as_list(mock_query):
    mock_query.return_value = []
    result = CliRunner().invoke(
        cli, ["query", "test", "--collections", "col_a,col_b,col_c"]
    )
    assert result.exit_code == 0
    call_kwargs = mock_query.call_args.kwargs
    assert call_kwargs["collection_names"] == ["col_a", "col_b", "col_c"]


@patch("remex.cli.query")
def test_cli_query_n_results_zero_rejected(mock_query):
    result = CliRunner().invoke(cli, ["query", "test", "-n", "0"])
    assert result.exit_code != 0


# --- error handling ---

@patch("remex.cli.ingest")
def test_cli_ingest_file_not_found_shows_error(mock_ingest):
    mock_ingest.side_effect = FileNotFoundError("Source directory not found: ./missing")
    result = CliRunner().invoke(cli, ["ingest", "./missing"])
    assert result.exit_code != 0
    assert "Error:" in result.output


@patch("remex.cli.query")
def test_cli_query_collection_not_found_shows_error(mock_query):
    mock_query.side_effect = ValueError("Collection 'synapse' not found — run ingest() first.")
    result = CliRunner().invoke(cli, ["query", "test"])
    assert result.exit_code != 0
    assert "Error:" in result.output


# --- --embedding-model flag ---

@patch("remex.cli.ingest")
def test_cli_ingest_embedding_model_passed(mock_ingest):
    CliRunner().invoke(cli, ["ingest", "./docs", "--embedding-model", "paraphrase-MiniLM-L6-v2"])
    assert mock_ingest.call_args.kwargs["embedding_model"] == "paraphrase-MiniLM-L6-v2"


@patch("remex.cli.ingest_sqlite")
def test_cli_ingest_sqlite_embedding_model_passed(mock_ingest_sqlite, tmp_path):
    db = tmp_path / "data.db"
    db.write_bytes(b"")
    mock_ingest_sqlite.return_value = MagicMock()
    CliRunner().invoke(cli, [
        "ingest-sqlite", str(db), "--table", "t",
        "--embedding-model", "paraphrase-MiniLM-L6-v2",
    ])
    assert mock_ingest_sqlite.call_args.kwargs["embedding_model"] == "paraphrase-MiniLM-L6-v2"


@patch("remex.cli.query")
def test_cli_query_embedding_model_passed(mock_query):
    mock_query.return_value = []
    CliRunner().invoke(cli, ["query", "hello", "--embedding-model", "paraphrase-MiniLM-L6-v2"])
    assert mock_query.call_args.kwargs["embedding_model"] == "paraphrase-MiniLM-L6-v2"




# --- remex init ---

def test_cli_init_creates_docs_and_toml(tmp_path):
    result = CliRunner().invoke(cli, ["init", str(tmp_path)])
    assert result.exit_code == 0
    assert (tmp_path / "docs").is_dir()
    assert (tmp_path / "remex.toml").exists()


def test_cli_init_toml_has_remex_section(tmp_path):
    CliRunner().invoke(cli, ["init", str(tmp_path)])
    content = (tmp_path / "remex.toml").read_text()
    assert "[remex]" in content
    assert "db" in content


def test_cli_init_skips_existing_docs(tmp_path):
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "existing.txt").write_text("hi")
    result = CliRunner().invoke(cli, ["init", str(tmp_path)])
    assert result.exit_code == 0
    assert (tmp_path / "docs" / "existing.txt").exists()  # not deleted


def test_cli_init_skips_existing_toml(tmp_path):
    existing = "[remex]\ndb = \"./custom\"\n"
    (tmp_path / "remex.toml").write_text(existing)
    CliRunner().invoke(cli, ["init", str(tmp_path)])
    assert (tmp_path / "remex.toml").read_text() == existing  # unchanged


def test_cli_init_gitignore_updated_in_git_repo(tmp_path):
    (tmp_path / ".git").mkdir()
    result = CliRunner().invoke(cli, ["init", str(tmp_path)])
    assert result.exit_code == 0
    gitignore = tmp_path / ".gitignore"
    assert gitignore.exists()
    assert "remex_db/" in gitignore.read_text()


def test_cli_init_no_gitignore_outside_repo(tmp_path):
    """No .git dir → no .gitignore should be created."""
    CliRunner().invoke(cli, ["init", str(tmp_path)])
    assert not (tmp_path / ".gitignore").exists()


def test_cli_init_shows_next_steps(tmp_path):
    result = CliRunner().invoke(cli, ["init", str(tmp_path)])
    assert "remex ingest" in result.output
    assert "remex query" in result.output


# --- remex serve ---

def test_cli_serve_help():
    result = CliRunner().invoke(cli, ["serve", "--help"])
    assert result.exit_code == 0
    assert "--host" in result.output
    assert "--port" in result.output


def test_cli_serve_missing_api_dep():
    import sys
    with patch.dict(sys.modules, {"uvicorn": None}):
        result = CliRunner().invoke(cli, ["serve"])
    assert result.exit_code != 0
    assert "pip install remex[api]" in result.output


# --- remex studio ---

def test_cli_studio_placeholder():
    result = CliRunner().invoke(cli, ["studio"])
    assert result.exit_code == 0
    assert "not yet available" in result.output.lower()
