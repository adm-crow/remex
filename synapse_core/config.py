"""Load project-level defaults from synapse.toml."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any, Optional


_CONFIG_FILE = "synapse.toml"
_SECTION = "synapse"


def load_config(root: Optional[Path] = None) -> dict[str, dict[str, Any]]:
    """Read ``synapse.toml`` and return a Click ``default_map``.

    Searches for ``synapse.toml`` in *root* (defaults to the current working
    directory).  Returns an empty dict if the file is absent or malformed so
    the CLI always starts cleanly.

    The ``[synapse]`` section supports:

    .. code-block:: toml

        [synapse]
        db             = "./synapse_db"
        collection     = "myproject"
        embedding_model = "all-MiniLM-L6-v2"
        chunk_size     = 1000
        overlap        = 200
        min_chunk_size = 50
        chunking       = "word"
    """
    config_path = (root or Path.cwd()) / _CONFIG_FILE
    if not config_path.exists():
        return {}

    try:
        with open(config_path, "rb") as f:
            data = tomllib.load(f)
    except Exception:
        return {}

    section = data.get(_SECTION, {})
    if not isinstance(section, dict) or not section:
        return {}

    db              = section.get("db")
    collection      = section.get("collection")
    embedding_model = section.get("embedding_model")
    chunk_size      = section.get("chunk_size")
    overlap         = section.get("overlap")
    min_chunk_size  = section.get("min_chunk_size")
    chunking        = section.get("chunking")

    def _common(*, use_chroma_path: bool = False) -> dict[str, Any]:
        m: dict[str, Any] = {}
        if db is not None:
            m["chroma_path" if use_chroma_path else "db_path"] = db
        if collection is not None:
            m["collection"] = collection
        if embedding_model is not None:
            m["embedding_model"] = embedding_model
        return m

    def _chunking_opts() -> dict[str, Any]:
        m: dict[str, Any] = {}
        if chunk_size is not None:
            m["chunk_size"] = chunk_size
        if overlap is not None:
            m["overlap"] = overlap
        if min_chunk_size is not None:
            m["min_chunk_size"] = min_chunk_size
        if chunking is not None:
            m["chunking"] = chunking
        return m

    return {
        "ingest":        {**_common(), **_chunking_opts()},
        "ingest-sqlite": {**_common(use_chroma_path=True), **_chunking_opts()},
        "query":         _common(),
        "sources":       _common(),
        "purge":         _common(),
        "reset":         _common(),
    }
