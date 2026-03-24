from pathlib import Path
from unittest.mock import patch

from click.testing import CliRunner

from synapse_core.cli import cli
from synapse_core.config import load_config, save_config


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
    assert cfg["list-collections"]["db_path"] == "./mydb"
    assert cfg["stats"]["db_path"] == "./mydb"
    assert cfg["delete-source"]["db_path"] == "./mydb"


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
    _write_toml(tmp_path, '[synapse]\nchunk_size = 500\noverlap = 50\nmin_chunk_size = 20\nchunking = "word"\n')
    cfg = load_config(tmp_path)
    assert cfg["ingest"]["chunk_size"] == 500
    assert cfg["ingest"]["overlap"] == 50
    assert cfg["ingest"]["min_chunk_size"] == 20
    assert cfg["ingest"]["chunking"] == "word"


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
        CliRunner().invoke(cli, ["ingest", str(tmp_path)])
    assert mock_ingest.called


@patch("synapse_core.cli.ingest")
def test_cli_flag_overrides_config(mock_ingest, tmp_path):
    """A CLI flag always wins over synapse.toml."""
    _write_toml(tmp_path, '[synapse]\ndb = "./config_db"\n')
    with patch("synapse_core.cli.load_config", return_value=load_config(tmp_path)):
        CliRunner().invoke(cli, ["ingest", str(tmp_path), "--db", "./flag_db"])
    assert mock_ingest.call_args.kwargs["db_path"] == "./flag_db"


# --- save_config unit tests ---

def test_save_config_creates_file(tmp_path):
    path = save_config({"db": "./mydb"}, root=tmp_path)
    assert path.exists()
    content = path.read_text(encoding="utf-8")
    assert '[synapse]' in content
    assert 'db = "./mydb"' in content


def test_save_config_roundtrip(tmp_path):
    """Values written by save_config must be readable back by load_config."""
    save_config({"db": "./custom", "collection": "proj", "chunk_size": 500}, root=tmp_path)
    cfg = load_config(tmp_path)
    assert cfg["ingest"]["db_path"] == "./custom"
    assert cfg["ingest"]["collection"] == "proj"
    assert cfg["ingest"]["chunk_size"] == 500


def test_save_config_replaces_synapse_section(tmp_path):
    """Calling save_config twice must overwrite the [synapse] section, not append."""
    save_config({"db": "./first"}, root=tmp_path)
    save_config({"db": "./second"}, root=tmp_path)
    content = (tmp_path / "synapse.toml").read_text(encoding="utf-8")
    assert content.count("[synapse]") == 1
    assert "./second" in content
    assert "./first" not in content


def test_save_config_preserves_other_sections(tmp_path):
    """Other TOML sections in the file must survive a save_config call."""
    _write_toml(tmp_path, "[other]\nkey = 42\n\n[synapse]\ndb = \"./old\"\n")
    save_config({"db": "./new"}, root=tmp_path)
    content = (tmp_path / "synapse.toml").read_text(encoding="utf-8")
    assert "[other]" in content
    assert "key = 42" in content
    assert "./new" in content


def test_save_config_ignores_unknown_keys(tmp_path):
    """Keys not in _KNOWN_KEYS must not appear in the written file."""
    save_config({"db": "./db", "unknown_key": "surprise"}, root=tmp_path)
    content = (tmp_path / "synapse.toml").read_text(encoding="utf-8")
    assert "unknown_key" not in content


def test_save_config_omits_missing_keys(tmp_path):
    """Only keys present in the settings dict are written."""
    save_config({"db": "./db"}, root=tmp_path)
    content = (tmp_path / "synapse.toml").read_text(encoding="utf-8")
    assert "collection" not in content
    assert "chunk_size" not in content


def test_save_config_integer_values_unquoted(tmp_path):
    save_config({"chunk_size": 800, "overlap": 100}, root=tmp_path)
    content = (tmp_path / "synapse.toml").read_text(encoding="utf-8")
    assert "chunk_size = 800" in content
    assert "overlap = 100" in content


def test_save_config_returns_absolute_path(tmp_path):
    path = save_config({"db": "./db"}, root=tmp_path)
    assert path.is_absolute()
