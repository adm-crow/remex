import json as _json
from unittest.mock import patch

from click.testing import CliRunner

import synapse_core
from synapse_core.cli import cli


@patch("synapse_core.cli.ingest")
def test_cli_ingest_default_args(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs"])
    assert result.exit_code == 0
    mock_ingest.assert_called_once()
    call_kwargs = mock_ingest.call_args.kwargs
    assert call_kwargs["source_dir"] == "./docs"
    assert call_kwargs["incremental"] is False
    assert call_kwargs["chunking"] == "word"


@patch("synapse_core.cli.ingest")
def test_cli_ingest_incremental_flag(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--incremental"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["incremental"] is True


@patch("synapse_core.cli.ingest")
def test_cli_ingest_sentence_chunking(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--chunking", "sentence"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["chunking"] == "sentence"


@patch("synapse_core.cli.query")
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


@patch("synapse_core.cli.query")
def test_cli_query_empty_results(mock_query):
    mock_query.return_value = []
    result = CliRunner().invoke(cli, ["query", "nothing"])
    assert result.exit_code == 0
    assert "No results" in result.output


@patch("synapse_core.cli.sources")
def test_cli_sources_lists_paths(mock_sources):
    mock_sources.return_value = ["/docs/a.txt", "/docs/b.pdf"]
    result = CliRunner().invoke(cli, ["sources"])
    assert result.exit_code == 0
    assert "/docs/a.txt" in result.output
    assert "/docs/b.pdf" in result.output


@patch("synapse_core.cli.sources")
def test_cli_sources_empty(mock_sources):
    mock_sources.return_value = []
    result = CliRunner().invoke(cli, ["sources"])
    assert result.exit_code == 0
    assert "empty" in result.output.lower()


@patch("synapse_core.cli.purge")
def test_cli_purge(mock_purge):
    result = CliRunner().invoke(cli, ["purge"])
    assert result.exit_code == 0
    mock_purge.assert_called_once()


@patch("synapse_core.cli.reset")
def test_cli_reset_with_yes_flag(mock_reset):
    result = CliRunner().invoke(cli, ["reset", "--yes"])
    assert result.exit_code == 0
    mock_reset.assert_called_once()


@patch("synapse_core.cli.reset")
def test_cli_reset_aborts_without_confirmation(mock_reset):
    """reset without --yes must prompt; answering 'n' must abort."""
    result = CliRunner().invoke(cli, ["reset"], input="n\n")
    assert result.exit_code != 0
    mock_reset.assert_not_called()


@patch("synapse_core.cli.reset")
def test_cli_reset_passes_confirm_true(mock_reset):
    """CLI reset must always pass confirm=True to the API."""
    result = CliRunner().invoke(cli, ["reset", "--yes"])
    assert result.exit_code == 0
    assert mock_reset.call_args.kwargs.get("confirm") is True


def test_cli_version():
    result = CliRunner().invoke(cli, ["--version"])
    assert result.exit_code == 0
    assert synapse_core.__version__ in result.output


# --- ingest-sqlite ---

@patch("synapse_core.cli.ingest_sqlite")
def test_cli_ingest_sqlite_basic(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, ["ingest-sqlite", "./data.db", "--table", "articles"])
    assert result.exit_code == 0
    mock_ingest_sqlite.assert_called_once()
    kw = mock_ingest_sqlite.call_args.kwargs
    assert kw["db_path"] == "./data.db"
    assert kw["table"] == "articles"
    assert kw["chunking"] == "word"


@patch("synapse_core.cli.ingest_sqlite")
def test_cli_ingest_sqlite_missing_table_errors(mock_ingest_sqlite):
    """--table is required; omitting it must exit non-zero."""
    result = CliRunner().invoke(cli, ["ingest-sqlite", "./data.db"])
    assert result.exit_code != 0
    mock_ingest_sqlite.assert_not_called()


@patch("synapse_core.cli.ingest_sqlite")
def test_cli_ingest_sqlite_columns_parsed_as_list(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--columns", "title,body"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["columns"] == ["title", "body"]


@patch("synapse_core.cli.ingest_sqlite")
def test_cli_ingest_sqlite_id_column_passed(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--id-column", "uuid"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["id_column"] == "uuid"


@patch("synapse_core.cli.ingest_sqlite")
def test_cli_ingest_sqlite_row_template_passed(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--row-template", "{title}: {body}"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["row_template"] == "{title}: {body}"


@patch("synapse_core.cli.ingest_sqlite")
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


@patch("synapse_core.cli.generate_answer", return_value="You can return within 30 days.")
@patch("synapse_core.cli.detect_provider", return_value="anthropic")
@patch("synapse_core.cli.query")
def test_cli_query_ai_flag_shows_answer(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund policy", "--ai"])
    assert result.exit_code == 0
    assert "You can return within 30 days." in result.output
    assert "anthropic" in result.output
    assert "Sources" in result.output


@patch("synapse_core.cli.generate_answer", return_value="Answer here.")
@patch("synapse_core.cli.detect_provider", return_value="openai")
@patch("synapse_core.cli.query")
def test_cli_query_ai_explicit_provider(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai", "--provider", "openai"])
    assert result.exit_code == 0
    mock_generate.assert_called_once()
    assert mock_generate.call_args.kwargs["provider"] == "openai"


@patch("synapse_core.cli.generate_answer", return_value="Answer here.")
@patch("synapse_core.cli.detect_provider", return_value="ollama")
@patch("synapse_core.cli.query")
def test_cli_query_ai_model_override(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai", "--model", "mistral"])
    assert result.exit_code == 0
    assert mock_generate.call_args.kwargs["model"] == "mistral"


@patch("synapse_core.cli.detect_provider", return_value=None)
@patch("synapse_core.cli.query")
def test_cli_query_ai_no_provider_detected(mock_query, mock_detect):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai"])
    assert result.exit_code != 0
    assert "no AI provider" in result.output


@patch("synapse_core.cli.generate_answer", side_effect=ImportError("pip install anthropic"))
@patch("synapse_core.cli.detect_provider", return_value="anthropic")
@patch("synapse_core.cli.query")
def test_cli_query_ai_missing_sdk_shows_error(mock_query, mock_detect, mock_generate):
    mock_query.return_value = _FAKE_RESULT
    result = CliRunner().invoke(cli, ["query", "refund", "--ai"])
    assert result.exit_code != 0
    assert "Error:" in result.output


# --- --format json ---

@patch("synapse_core.cli.query")
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


@patch("synapse_core.cli.query")
def test_cli_query_format_json_empty_results(mock_query):
    mock_query.return_value = []
    result = CliRunner().invoke(cli, ["query", "test", "--format", "json"])
    assert result.exit_code == 0
    assert _json.loads(result.output) == []


@patch("synapse_core.cli.query")
def test_cli_query_format_json_ai_flag_rejected(mock_query):
    """--format json cannot be combined with --ai."""
    result = CliRunner().invoke(cli, ["query", "test", "--format", "json", "--ai"])
    assert result.exit_code != 0
    mock_query.assert_not_called()


# --- new v0.6 CLI options ---

@patch("synapse_core.cli.ingest")
def test_cli_ingest_min_chunk_size_passed(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--min-chunk-size", "100"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["min_chunk_size"] == 100


@patch("synapse_core.cli.ingest_sqlite")
def test_cli_ingest_sqlite_min_chunk_size_passed(mock_ingest_sqlite):
    result = CliRunner().invoke(cli, [
        "ingest-sqlite", "./data.db", "--table", "articles", "--min-chunk-size", "30"
    ])
    assert result.exit_code == 0
    assert mock_ingest_sqlite.call_args.kwargs["min_chunk_size"] == 30


@patch("synapse_core.cli.ingest")
def test_cli_ingest_streaming_threshold_converted_to_bytes(mock_ingest):
    """--streaming-threshold N (MB) must be passed as N*1024*1024 bytes."""
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--streaming-threshold", "10"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["streaming_threshold"] == 10 * 1024 * 1024


@patch("synapse_core.cli.ingest")
def test_cli_ingest_streaming_threshold_zero_disables(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--streaming-threshold", "0"])
    assert result.exit_code == 0
    assert mock_ingest.call_args.kwargs["streaming_threshold"] == 0


@patch("synapse_core.cli.ingest")
def test_cli_ingest_streaming_threshold_negative_rejected(mock_ingest):
    result = CliRunner().invoke(cli, ["ingest", "./docs", "--streaming-threshold", "-1"])
    assert result.exit_code != 0


@patch("synapse_core.cli.query")
def test_cli_query_where_valid_json(mock_query):
    mock_query.return_value = []
    result = CliRunner().invoke(
        cli, ["query", "test", "--where", '{"source_type": {"$eq": "file"}}']
    )
    assert result.exit_code == 0
    call_kwargs = mock_query.call_args.kwargs
    assert call_kwargs["where"] == {"source_type": {"$eq": "file"}}


@patch("synapse_core.cli.query")
def test_cli_query_where_invalid_json_exits_nonzero(mock_query):
    result = CliRunner().invoke(cli, ["query", "test", "--where", "not json"])
    assert result.exit_code != 0
    assert "not valid JSON" in result.output
    mock_query.assert_not_called()


@patch("synapse_core.cli.query")
def test_cli_query_collections_passed_as_list(mock_query):
    mock_query.return_value = []
    result = CliRunner().invoke(
        cli, ["query", "test", "--collections", "col_a,col_b,col_c"]
    )
    assert result.exit_code == 0
    call_kwargs = mock_query.call_args.kwargs
    assert call_kwargs["collection_names"] == ["col_a", "col_b", "col_c"]


@patch("synapse_core.cli.query")
def test_cli_query_n_results_zero_rejected(mock_query):
    result = CliRunner().invoke(cli, ["query", "test", "-n", "0"])
    assert result.exit_code != 0


# --- error handling ---

@patch("synapse_core.cli.ingest")
def test_cli_ingest_file_not_found_shows_error(mock_ingest):
    mock_ingest.side_effect = FileNotFoundError("Source directory not found: ./missing")
    result = CliRunner().invoke(cli, ["ingest", "./missing"])
    assert result.exit_code != 0
    assert "Error:" in result.output


@patch("synapse_core.cli.query")
def test_cli_query_collection_not_found_shows_error(mock_query):
    mock_query.side_effect = ValueError("Collection 'synapse' not found — run ingest() first.")
    result = CliRunner().invoke(cli, ["query", "test"])
    assert result.exit_code != 0
    assert "Error:" in result.output
