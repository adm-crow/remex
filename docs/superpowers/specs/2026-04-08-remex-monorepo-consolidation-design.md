# Remex — Monorepo Consolidation Design

**Date:** 2026-04-08
**Status:** Approved
**Scope:** Sub-project 1 of 2 — Python package consolidation

---

## Overview

Merge `synapse-core` (already migrated to `remex/core/`) into a clean, releasable
Python package. Drop the NiceGUI `synapse-studio` module entirely. Lay the foundation
for a Tauri v2 GUI (sub-project 2) by stabilising the FastAPI sidecar and unified CLI.

---

## Package Structure

```
remex/                        # repo root
├── remex/                    # Python package
│   ├── __init__.py           # re-exports remex.core public API
│   ├── core/                 # pure RAG library — no CLI knowledge
│   │   ├── __init__.py
│   │   ├── ai.py
│   │   ├── chunker.py
│   │   ├── config.py
│   │   ├── exceptions.py
│   │   ├── extractors.py
│   │   ├── logger.py
│   │   ├── models.py
│   │   ├── pipeline.py
│   │   └── sqlite_ingester.py
│   ├── api/                  # FastAPI sidecar — optional, Tauri-facing
│   │   ├── __init__.py
│   │   ├── __main__.py
│   │   ├── main.py
│   │   └── routes/
│   └── cli.py                # Unified CLI — imports from core + api
├── studio/                   # Sub-project 2 — Tauri app (not touched yet)
├── tests/
├── pyproject.toml
└── remex.toml
```

`remex/studio/` (NiceGUI) is **not created**. The GUI will be a Tauri v2 app in
`studio/` at the repo root, communicating with `remex/api/` over REST.

---

## pyproject.toml

### Entry points

```toml
[project.scripts]
remex = "remex.cli:cli"
# remex-api removed — replaced by `remex serve`
```

### Extras

```toml
[project.optional-dependencies]
sentence = ["nltk"]
formats  = ["python-pptx", "openpyxl", "beautifulsoup4", "ebooklib", "odfpy"]
ai       = ["anthropic", "openai"]
api      = ["fastapi", "uvicorn[standard]"]
studio   = ["remex[api]"]
all      = ["remex[sentence,formats,ai,api]"]
```

`remex[studio]` pulls in `api` because the Tauri sidecar requires it.
`all` does not duplicate `studio` — `api` is already listed.

### Version

`0.1.0 → 0.2.0`. Breaking change: `remex-api` script entry point removed.

---

## CLI (`remex/cli.py`)

All existing commands move verbatim from `remex/core/cli.py`:

| Command | Description |
|---|---|
| `remex init` | Scaffold a new project |
| `remex ingest` | Ingest files into ChromaDB |
| `remex ingest-sqlite` | Ingest a SQLite table |
| `remex query` | Semantic search |
| `remex sources` | List ingested sources |
| `remex stats` | Collection statistics |
| `remex list-collections` | List all collections |
| `remex purge` | Remove stale chunks |
| `remex reset` | Wipe a collection |
| `remex delete-source` | Remove chunks for a source |

Two new commands:

**`remex serve`**
```
remex serve [--host 127.0.0.1] [--port 8000] [--reload]
```
Starts the FastAPI sidecar via uvicorn. Guards against missing `api` extra:
```python
try:
    import uvicorn
except ImportError:
    raise click.ClickException("Run: pip install remex[api]")
```

**`remex studio`**
```
remex studio
```
Placeholder for sub-project 2. Prints a clear message:
```
Studio not yet available. Install the Tauri app separately.
```

`remex/core/cli.py` is **deleted** — it was never a public import surface, no shim needed.

---

## Data Flow

```
User input
  → remex/cli.py           parse args, validate
  → remex/core/pipeline    ingest / query logic
  → ChromaDB (local)       persistence
  → remex/core/models      typed results
  → CLI output / API JSON
```

The API is a thin pass-through. All business logic stays in `remex/core`. No logic
lives in `remex/api/routes/`.

---

## Error Handling

No changes to the existing pattern:

- `SynapseError` and subclasses (`CollectionNotFoundError`, `SourceNotFoundError`,
  `TableNotFoundError`) are the single error vocabulary.
- CLI: catches them, prints `Error: <message>`, exits 1.
- API: catches them, returns appropriate HTTP status codes.
- Optional-dep guards: `ImportError` → `click.ClickException` with install hint.

---

## Testing

Two updates required:

1. **Import fixes** — any test still importing from `synapse_core` updated to `remex.core`.
2. **New CLI smoke tests** — `test_cli.py` extended with:
   - `remex serve --help` exists and exits 0
   - `remex studio` prints the placeholder message
   - `remex serve` without `uvicorn` installed raises a clean error (mock the import)

---

## Out of Scope (Sub-project 2)

- Tauri v2 frontend (`studio/`)
- React/Vue + Tailwind UI
- Collections browser, ingest UI, settings panel
- Tauri sidecar bundling of the Python API
- `remex studio` launcher implementation
