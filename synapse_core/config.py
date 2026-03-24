"""Load and save project-level defaults from/to synapse.toml."""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any, Optional

from .logger import logger


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
    except Exception as e:
        logger.warning("Could not parse %s: %s — using defaults.", config_path.name, e)
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
        "ingest":            {**_common(), **_chunking_opts()},
        "ingest-sqlite":     {**_common(use_chroma_path=True), **_chunking_opts()},
        "query":             _common(),
        "sources":           _common(),
        "purge":             _common(),
        "reset":             _common(),
        "list-collections":  _common(),
        "stats":             _common(),
        "delete-source":     _common(),
    }


# Keys accepted in the [synapse] section, in display order.
_KNOWN_KEYS: tuple[str, ...] = (
    "db",
    "collection",
    "embedding_model",
    "chunk_size",
    "overlap",
    "min_chunk_size",
    "chunking",
)


def save_config(
    settings: dict[str, Any],
    root: Optional[Path] = None,
) -> Path:
    """Write *settings* to ``synapse.toml`` under the ``[synapse]`` section.

    Only keys listed in :data:`_KNOWN_KEYS` are written; unknown keys are
    silently ignored to protect the file from accidental pollution.

    If the file already exists its ``[synapse]`` section is replaced while
    any other sections are preserved.  If the file does not exist it is
    created.

    Args:
        settings: Flat dict of ``[synapse]`` values, e.g.
                  ``{"db": "./mydb", "collection": "docs"}``.
        root:     Directory containing ``synapse.toml``.
                  Defaults to the current working directory.

    Returns:
        Absolute :class:`~pathlib.Path` to the written file.
    """
    config_path = (root or Path.cwd()) / _CONFIG_FILE

    # Read any existing content that is NOT the [synapse] section.
    other_lines: list[str] = []
    if config_path.exists():
        in_synapse = False
        for line in config_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if stripped == f"[{_SECTION}]":
                in_synapse = True
                continue
            if in_synapse and stripped.startswith("["):
                in_synapse = False
            if not in_synapse:
                other_lines.append(line)

    # Build the new [synapse] block.
    synapse_lines: list[str] = [f"[{_SECTION}]"]
    for key in _KNOWN_KEYS:
        if key not in settings:
            continue
        value = settings[key]
        if isinstance(value, str):
            synapse_lines.append(f'{key} = "{value}"')
        else:
            synapse_lines.append(f"{key} = {value}")

    # Assemble: other sections first, then the [synapse] block.
    # Strip trailing blank lines from other_lines to avoid double-spacing.
    trimmed_other = "\n".join(other_lines).rstrip()
    new_content = (
        (trimmed_other + "\n\n" if trimmed_other else "")
        + "\n".join(synapse_lines)
        + "\n"
    )

    config_path.write_text(new_content, encoding="utf-8")
    return config_path.resolve()
