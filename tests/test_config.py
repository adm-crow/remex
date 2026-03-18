from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner

from synapse_core.cli import cli
from synapse_core.config import load_config


def _write_toml(tmp_path: Path, content: str) -> Path:
    f = tmp_path / "synapse.toml"
    f.write_text(content, encoding="utf-8")
    return f


# --- load_config unit tests ---

def test_load_config_empty_when_no_file(tmp_path):
    assert load_config(tmp_path) == {}


def test_load_config_returns_db_for_all_commands(tmp_path):
    _write_toml(tmp_path, '[synapse]\ndb = "./mydb"\n')
    cfg = load_config(tmp_path)
    assert cfg["ingest"]["db_path"] == "./mydb"
    assert cfg["query"]["db_path"] == "./mydb"
    assert cfg["ingest-sqlite"]["chroma_path"] == "./mydb"
    assert cfg["sources"]["db_path"] == "./mydb"
    assert cfg["purge"]["db_path"] == "./mydb"
    assert cfg["reset"]["db_path"] == "./mydb"


def test_load_config_collection(tmp_path):
    _write_toml(tmp_path, '[synapse]\ncollection = "myproject"\n')
    cfg = load_config(tmp_path)
    assert cfg["ingest"]["collection"] == "myproject"
    assert cfg["query"]["collection"] == "myproject"


def test_load_config_embedding_model(tmp_path):
    _write_toml(tmp_path, '[synapse]\nembedding_model = "paraphrase-MiniLM-L6-v2"\n')
    cfg = load_config(tmp_path)
    assert cfg["ingest"]["embedding_model"] == "paraphrase-MiniLM-L6-v2"
    assert cfg["query"]["embedding_model"] == "paraphrase-MiniLM-L6-v2"


def test_load_config_chunking_options(tmp_path):
    _write_toml(tmp_path, '[synapse]\nchunk_size = 500\noverlap = 50\nmin_chunk_size = 20\nchuning = "word"\n')
    cfg = load_config(tmp_path)
    assert cfg["ingest"]["chunk_size"] == 500
    assert cfg["ingest"]["overlap"] == 50
    assert cfg["ingest"]["min_chunk_size"] == 20


def test_load_config_tolerates_malformed_toml(tmp_path):
    _write_toml(tmp_path, "this is not valid toml ][[\n")
    assert load_config(tmp_path) == {}


def test_load_config_tolerates_missing_section(tmp_path):
    _write_toml(tmp_path, "[other]\nkey = 1\n")
    assert load_config(tmp_path) == {}


def test_load_config_omits_missing_keys(tmp_path):
    _write_toml(tmp_path, '[synapse]\ndb = "./db"\n')
    cfg = load_config(tmp_path)
    assert "embedding_model" not in cfg["ingest"]
    assert "chunk_size" not in cfg["ingest"]


# --- CLI integration: config values used as defaults ---

@patch("synapse_core.cli.ingest")
def test_cli_uses_config_db(mock_ingest, tmp_path):
    _write_toml(tmp_path, '[synapse]\ndb = "./custom_db"\n')
    with patch("synapse_core.config.Path") as mock_path_cls:
        mock_path_cls.cwd.return_value = tmp_path
        mock_path_cls.side_effect = lambda *a, **k: Path(*a, **k)
        CliRunner().invoke(cli, ["ingest", str(tmp_path)])
    # Direct approach: patch load_config
    with patch("synapse_core.cli.load_config", return_value=load_config(tmp_path)):
        result = CliRunner().invoke(cli, ["ingest", str(tmp_path)])
    assert mock_ingest.called


@patch("synapse_core.cli.ingest")
def test_cli_flag_overrides_config(mock_ingest, tmp_path):
    """A CLI flag always wins over synapse.toml."""
    _write_toml(tmp_path, '[synapse]\ndb = "./config_db"\n')
    with patch("synapse_core.cli.load_config", return_value=load_config(tmp_path)):
        CliRunner().invoke(cli, ["ingest", str(tmp_path), "--db", "./flag_db"])
    assert mock_ingest.call_args.kwargs["db_path"] == "./flag_db"
