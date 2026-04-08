# Remex Monorepo Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the unified CLI from `remex/core/cli.py` to `remex/cli.py`, add `remex serve` and `remex studio` commands, update `pyproject.toml` to v0.2.0 with correct extras and entry points.

**Architecture:** `remex/core/` is a pure library layer with no CLI knowledge. `remex/cli.py` is the single CLI entry point that imports from core and api. The FastAPI sidecar (`remex/api/`) remains optional behind the `api` extra.

**Tech Stack:** Python 3.11+, Click, FastAPI (optional), uvicorn (optional), uv + hatchling, pytest

**Spec:** `docs/superpowers/specs/2026-04-08-remex-monorepo-consolidation-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `remex/cli.py` | Unified CLI — all commands, imports from `remex.core` |
| Delete | `remex/core/cli.py` | Old CLI location — no longer needed |
| Modify | `tests/test_cli.py` | Update import paths + add `serve`/`studio` tests |
| Modify | `tests/test_config.py` | Update CLI import path |
| Modify | `pyproject.toml` | Entry point, extras, version bump to 0.2.0 |

---

## Task 1: Make tests import from `remex.cli` (RED)

**Files:**
- Modify: `tests/test_cli.py`
- Modify: `tests/test_config.py`

- [ ] **Step 1: Update `tests/test_cli.py` — top imports and all patch paths**

Replace the top of `tests/test_cli.py` (lines 1–8):

```python
import json as _json
from unittest.mock import MagicMock, patch

from click.testing import CliRunner

import remex.core
from remex.cli import cli
```

Then replace every occurrence of `"remex.core.cli.` with `"remex.cli.` in the patch decorators throughout the file. There are ~30 occurrences. Examples:

```python
# Before
@patch("remex.core.cli.ingest")
# After
@patch("remex.cli.ingest")

# Before
@patch("remex.core.cli.query")
# After
@patch("remex.cli.query")

# Before
@patch("remex.core.cli.ingest_sqlite")
# After
@patch("remex.cli.ingest_sqlite")

# Before
@patch("remex.core.cli.sources")
# After
@patch("remex.cli.sources")

# Before
@patch("remex.core.cli.purge")
# After
@patch("remex.cli.purge")

# Before
@patch("remex.core.cli.reset")
# After
@patch("remex.cli.reset")

# Before
@patch("remex.core.cli.generate_answer", ...)
# After
@patch("remex.cli.generate_answer", ...)

# Before
@patch("remex.core.cli.detect_provider", ...)
# After
@patch("remex.cli.detect_provider", ...)
```

- [ ] **Step 2: Update `tests/test_config.py` line 6**

```python
# Before
from remex.core.cli import cli
# After
from remex.cli import cli
```

- [ ] **Step 3: Run tests — verify they FAIL with ImportError**

```
cd C:\Users\JG-PERSONNAL\remex
uv run pytest tests/test_cli.py tests/test_config.py -q
```

Expected: `ModuleNotFoundError: No module named 'remex.cli'`

---

## Task 2: Add failing tests for new commands (RED)

**Files:**
- Modify: `tests/test_cli.py`

- [ ] **Step 1: Append new tests at the bottom of `tests/test_cli.py`**

```python
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
```

- [ ] **Step 2: Run — verify still FAIL**

```
uv run pytest tests/test_cli.py -q
```

Expected: `ModuleNotFoundError: No module named 'remex.cli'`

---

## Task 3: Create `remex/cli.py` (GREEN)

**Files:**
- Create: `remex/cli.py`

- [ ] **Step 1: Create `remex/cli.py` with this exact content**

```python
import json
from pathlib import Path

import click

from remex.core import __version__
from remex.core.ai import DEFAULT_MODELS, PROVIDERS, detect_provider, generate_answer
from remex.core.config import load_config
from remex.core.exceptions import SynapseError
from remex.core.pipeline import collection_stats, delete_source, ingest, list_collections, purge, query, reset, sources
from remex.core.sqlite_ingester import ingest_sqlite

_TOML_TEMPLATE = """\
[remex]
# Default options applied to every remex command.
# Override any value with a CLI flag — flags always win.

db             = "./remex_db"      # ChromaDB persistence path
collection     = "remex"           # collection name
embedding_model = "all-MiniLM-L6-v2"

# Chunking defaults (used by ingest / ingest-sqlite)
# chunk_size     = 1000
# overlap        = 200
# min_chunk_size = 50
# chunking       = "word"          # "word" or "sentence"
"""


class _RemexGroup(click.Group):
    """Click group that injects remex.toml values as CLI defaults."""

    def make_context(self, info_name, args, parent=None, **kwargs):  # type: ignore[override]
        kwargs.setdefault("default_map", load_config())
        return super().make_context(info_name, args, parent=parent, **kwargs)


@click.group(cls=_RemexGroup)
@click.version_option(__version__, prog_name="remex")
def cli() -> None:
    """remex — local RAG: ingest files, query semantically."""


@cli.command(name="ingest")
@click.argument("source_dir", default="./docs")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
@click.option("--chunk-size", default=1000, show_default=True, type=click.IntRange(min=1), help="Target characters per chunk.")
@click.option("--overlap", default=200, show_default=True, type=click.IntRange(min=0), help="Character overlap between chunks.")
@click.option("--incremental", is_flag=True, help="Skip files whose content hasn't changed (SHA-256 check).")
@click.option("--chunking", default="word", show_default=True, type=click.Choice(["word", "sentence"]), help="Chunking strategy.")
@click.option("--streaming-threshold", default=50, show_default=True, type=click.IntRange(min=0), help="Stream files larger than this size (MB) to limit memory use. 0 = disable.")
@click.option("--min-chunk-size", default=50, show_default=True, type=click.IntRange(min=1), help="Discard chunks shorter than this many characters.")
@click.option("--embedding-model", default="all-MiniLM-L6-v2", show_default=True, help="SentenceTransformer model name for embeddings.")
def ingest_cmd(
    source_dir: str, db_path: str, collection: str, chunk_size: int, overlap: int,
    incremental: bool, chunking: str, streaming_threshold: int, min_chunk_size: int,
    embedding_model: str,
) -> None:
    """Ingest files from SOURCE_DIR into ChromaDB."""
    try:
        ingest(
            source_dir=source_dir, db_path=db_path, collection_name=collection,
            chunk_size=chunk_size, overlap=overlap, min_chunk_size=min_chunk_size,
            incremental=incremental, chunking=chunking,
            streaming_threshold=streaming_threshold * 1024 * 1024,
            embedding_model=embedding_model,
        )
    except (SynapseError, FileNotFoundError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)


@cli.command(name="ingest-sqlite")
@click.argument("db_path")
@click.option("--table", required=True, help="Table name to ingest.")
@click.option("--db", "chroma_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
@click.option("--columns", default=None, help="Comma-separated column names to embed (default: all columns).")
@click.option("--id-column", default="id", show_default=True, help="Primary key column for stable chunk IDs.")
@click.option("--row-template", default=None, help='Row format string, e.g. "{title}: {body}".')
@click.option("--chunk-size", default=1000, show_default=True, type=click.IntRange(min=1), help="Target characters per chunk.")
@click.option("--overlap", default=200, show_default=True, type=click.IntRange(min=0), help="Character overlap between chunks.")
@click.option("--chunking", default="word", show_default=True, type=click.Choice(["word", "sentence"]), help="Chunking strategy.")
@click.option("--min-chunk-size", default=50, show_default=True, type=click.IntRange(min=1), help="Discard chunks shorter than this many characters.")
@click.option("--embedding-model", default="all-MiniLM-L6-v2", show_default=True, help="SentenceTransformer model name for embeddings.")
def ingest_sqlite_cmd(
    db_path: str, table: str, chroma_path: str, collection: str, columns: str | None,
    id_column: str, row_template: str | None, chunk_size: int, overlap: int,
    chunking: str, min_chunk_size: int, embedding_model: str,
) -> None:
    """Ingest records from a SQLite DB_PATH table into ChromaDB."""
    columns_list = ([c.strip() for c in columns.split(",") if c.strip()] if columns else None)
    try:
        ingest_sqlite(
            db_path=db_path, table=table, columns=columns_list, id_column=id_column,
            row_template=row_template, chroma_path=chroma_path, collection_name=collection,
            chunk_size=chunk_size, overlap=overlap, min_chunk_size=min_chunk_size,
            chunking=chunking, embedding_model=embedding_model,
        )
    except (SynapseError, FileNotFoundError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)


@cli.command(name="query")
@click.argument("text")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
@click.option("-n", "--n-results", default=5, show_default=True, type=click.IntRange(min=1), help="Number of results to return.")
@click.option("--ai", "use_ai", is_flag=True, help="Generate an AI answer from the retrieved chunks.")
@click.option("--provider", default=None, type=click.Choice(list(PROVIDERS), case_sensitive=False), help="LLM provider (anthropic, openai, ollama). Auto-detected if omitted.")
@click.option("--model", default=None, help="Model name override (e.g. gpt-4o, llama3).")
@click.option("--where", default=None, help='Metadata filter as JSON (e.g. \'{"source_type": {"$eq": "file"}}\').')
@click.option("--collections", default=None, help="Comma-separated list of collection names for multi-collection query.")
@click.option("--format", "fmt", default="text", show_default=True, type=click.Choice(["text", "json"]), help="Output format.")
@click.option("--embedding-model", default="all-MiniLM-L6-v2", show_default=True, help="SentenceTransformer model name (must match the model used at ingest).")
@click.option("--min-score", default=None, type=click.FloatRange(min=0.0, max=1.0), help="Minimum relevance score (0–1).")
def query_cmd(
    text: str, db_path: str, collection: str, n_results: int, use_ai: bool,
    provider: str | None, model: str | None, where: str | None, collections: str | None,
    fmt: str, embedding_model: str, min_score: float | None,
) -> None:
    """Semantic search over the ChromaDB collection.

    Add --ai to generate a synthesized answer via an LLM.
    Provider is auto-detected from ANTHROPIC_API_KEY / OPENAI_API_KEY / Ollama.
    Use --collections to query multiple collections and merge results.
    Use --where to filter by metadata (ChromaDB filter syntax).
    """
    if fmt == "json" and use_ai:
        click.echo("Error: --format json cannot be combined with --ai.", err=True)
        raise SystemExit(1)

    where_dict = None
    if where:
        try:
            where_dict = json.loads(where)
        except json.JSONDecodeError as e:
            click.echo(f"Error: --where is not valid JSON: {e}", err=True)
            raise SystemExit(1)

    collection_names = (
        [c.strip() for c in collections.split(",") if c.strip()] if collections else None
    )

    try:
        results = query(
            text=text, db_path=db_path, collection_name=collection, n_results=n_results,
            where=where_dict, collection_names=collection_names,
            embedding_model=embedding_model, min_score=min_score,
        )
    except (SynapseError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)

    if fmt == "json":
        click.echo(json.dumps(list(results), indent=2))
        return

    if not results:
        click.echo("No results found.")
        return

    if use_ai:
        resolved = provider or detect_provider()
        if resolved is None:
            click.echo(
                "Error: no AI provider detected.\n"
                "Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or start 'ollama serve'.\n"
                "You can also pass --provider explicitly.",
                err=True,
            )
            raise SystemExit(1)

        resolved_model = model or DEFAULT_MODELS.get(resolved, "")
        context = "\n\n".join(r["text"] for r in results)

        try:
            answer = generate_answer(
                question=text, context=context, provider=resolved, model=resolved_model,
            )
        except (ImportError, RuntimeError, ValueError) as e:
            click.echo(f"Error: {e}", err=True)
            raise SystemExit(1)

        click.echo(f"\nAnswer  [{resolved} / {resolved_model}]")
        click.echo("─" * 60)
        click.echo(answer)
        click.echo("\nSources")
        click.echo("─" * 60)
        seen: set[str] = set()
        for r in results:
            src = r["source"]
            if src not in seen:
                title = f"  [{r['doc_title']}]" if r.get("doc_title") else ""
                click.echo(f"  [{r['score']:.2f}] {src}{title}")
                seen.add(src)
        click.echo()
        return

    for i, r in enumerate(results, 1):
        title = f" [{r['doc_title']}]" if r.get("doc_title") else ""
        click.echo(f"[{i}] score={r['score']:.3f}  {r['source']}{title}  chunk={r['chunk']}")
        click.echo(f"    {r['text'][:200]}")
        click.echo()


@cli.command(name="sources")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
def sources_cmd(db_path: str, collection: str) -> None:
    """List all ingested source paths."""
    paths = sources(db_path=db_path, collection_name=collection)
    if not paths:
        click.echo("Collection is empty.")
        return
    for path in paths:
        click.echo(path)


@cli.command(name="purge")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
def purge_cmd(db_path: str, collection: str) -> None:
    """Remove chunks whose source file no longer exists on disk."""
    purge(db_path=db_path, collection_name=collection)


@cli.command(name="reset")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
@click.option("--yes", is_flag=True, help="Skip confirmation prompt.")
def reset_cmd(db_path: str, collection: str, yes: bool) -> None:
    """Wipe the entire ChromaDB collection (destructive)."""
    if not yes:
        click.confirm(
            f"Delete collection '{collection}' in '{db_path}'? This cannot be undone.",
            abort=True,
        )
    reset(db_path=db_path, collection_name=collection, confirm=True)


@cli.command(name="init")
@click.argument("path", default=".", type=click.Path())
def init_cmd(path: str) -> None:
    """Scaffold a new remex project in PATH (default: current directory).

    Creates:
      - docs/           directory for your source files
      - remex.toml      project config with default values
      - .gitignore      entry for remex_db/ (if inside a git repo)
    """
    root = Path(path).resolve()
    root.mkdir(parents=True, exist_ok=True)

    docs = root / "docs"
    if not docs.exists():
        docs.mkdir()
        click.echo("  created  docs/")
    else:
        click.echo("  exists   docs/  (skipped)")

    config_file = root / "remex.toml"
    if not config_file.exists():
        config_file.write_text(_TOML_TEMPLATE, encoding="utf-8")
        click.echo("  created  remex.toml")
    else:
        click.echo("  exists   remex.toml  (skipped)")

    git_dir = root / ".git"
    if git_dir.exists():
        gitignore = root / ".gitignore"
        entry = "remex_db/"
        if gitignore.exists():
            if entry not in gitignore.read_text():
                with gitignore.open("a", encoding="utf-8") as f:
                    f.write(f"\n# remex\n{entry}\n")
                click.echo(f"  updated  .gitignore  ({entry})")
        else:
            gitignore.write_text(f"# remex\n{entry}\n", encoding="utf-8")
            click.echo(f"  created  .gitignore  ({entry})")

    click.echo()
    click.echo("Ready. Next steps:")
    click.echo("  1. Drop your files into docs/")
    click.echo("  2. remex ingest")
    click.echo('  3. remex query "your question"')


@cli.command(name="list-collections")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
def list_collections_cmd(db_path: str) -> None:
    """List all collection names in a ChromaDB directory."""
    names = list_collections(db_path=db_path)
    if not names:
        click.echo("No collections found.")
        return
    for name in names:
        click.echo(name)


@cli.command(name="stats")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
def stats_cmd(db_path: str, collection: str) -> None:
    """Show statistics for a ChromaDB collection."""
    try:
        stats = collection_stats(db_path=db_path, collection_name=collection)
    except SynapseError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)
    click.echo(f"Collection : {stats.name}")
    click.echo(f"Chunks     : {stats.total_chunks}")
    click.echo(f"Sources    : {stats.total_sources}")
    click.echo(f"Model      : {stats.embedding_model or '(unknown)'}")


@cli.command(name="delete-source")
@click.argument("source")
@click.option("--db", "db_path", default="./remex_db", show_default=True, help="ChromaDB persistence path.")
@click.option("--collection", default="remex", show_default=True, help="Collection name.")
@click.option("--yes", is_flag=True, help="Skip confirmation prompt.")
def delete_source_cmd(source: str, db_path: str, collection: str, yes: bool) -> None:
    """Remove all chunks for SOURCE from the collection."""
    if not yes:
        click.confirm(
            f"Remove all chunks for '{source}' from collection '{collection}'?",
            abort=True,
        )
    try:
        deleted = delete_source(source=source, db_path=db_path, collection_name=collection)
    except SynapseError as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)
    if deleted:
        click.echo(f"Deleted {deleted} chunk(s).")
    else:
        click.echo("No chunks found for that source.")


@cli.command(name="serve")
@click.option("--host", default="127.0.0.1", show_default=True, help="Bind host.")
@click.option("--port", default=8000, show_default=True, type=int, help="Bind port.")
@click.option("--reload", is_flag=True, help="Enable auto-reload (development only).")
def serve_cmd(host: str, port: int, reload: bool) -> None:
    """Start the remex FastAPI sidecar."""
    try:
        import uvicorn
    except ImportError:
        raise click.ClickException("Run: pip install remex[api]")
    uvicorn.run("remex.api.main:app", host=host, port=port, reload=reload)


@cli.command(name="studio")
def studio_cmd() -> None:
    """Launch the remex Studio GUI."""
    click.echo("Studio not yet available. Install the Tauri app separately.")
```

- [ ] **Step 2: Run tests — verify they now PASS**

```
uv run pytest tests/test_cli.py tests/test_config.py -q
```

Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add remex/cli.py tests/test_cli.py tests/test_config.py
git commit -m "feat: move unified CLI to remex/cli.py, add serve and studio commands"
```

---

## Task 4: Delete `remex/core/cli.py`

**Files:**
- Delete: `remex/core/cli.py`

- [ ] **Step 1: Delete the file**

```bash
git rm remex/core/cli.py
```

- [ ] **Step 2: Run full test suite — verify nothing broke**

```
uv run pytest -q
```

Expected: all green. (Nothing imports `remex.core.cli` anymore.)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove remex/core/cli.py — superseded by remex/cli.py"
```

---

## Task 5: Update `pyproject.toml`

**Files:**
- Modify: `pyproject.toml`

- [ ] **Step 1: Update version, entry points, and extras**

In `pyproject.toml`, make these changes:

**Version** (line ~3):
```toml
version = "0.2.0"
```

**Scripts** — replace the existing `[project.scripts]` block:
```toml
[project.scripts]
remex = "remex.cli:cli"
```
(Remove the `remex-api = "remex.api.__main__:main"` line entirely.)

**Optional dependencies** — replace the existing `[project.optional-dependencies]` block:
```toml
[project.optional-dependencies]
sentence = ["nltk"]
formats  = ["python-pptx", "openpyxl", "beautifulsoup4", "ebooklib", "odfpy"]
ai       = ["anthropic", "openai"]
api      = ["fastapi", "uvicorn[standard]"]
studio   = ["remex[api]"]
all      = ["remex[sentence,formats,ai,api]"]
```

- [ ] **Step 2: Verify the entry point resolves correctly**

```bash
uv run remex --version
```

Expected: `remex, version 0.2.0`

- [ ] **Step 3: Verify `remex serve --help` works**

```bash
uv run remex serve --help
```

Expected: shows `--host`, `--port`, `--reload` options, exit code 0.

- [ ] **Step 4: Verify `remex studio` works**

```bash
uv run remex studio
```

Expected: `Studio not yet available. Install the Tauri app separately.`

- [ ] **Step 5: Run full test suite one last time**

```
uv run pytest -q
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml
git commit -m "feat: v0.2.0 — unified CLI entry point, studio/api extras, remove remex-api script"
```

---

## Task 6: Stage and commit the in-progress migration files

The repo has unstaged deletions (`synapse_core/`) and modifications (`README.md`, `CHANGELOG.md`, etc.) from the import rename work. Clean this up.

- [ ] **Step 1: Check what's uncommitted**

```bash
git status
```

- [ ] **Step 2: Stage the synapse_core deletions**

```bash
git add -u synapse_core/
```

- [ ] **Step 3: Stage remaining modified files**

```bash
git add README.md CHANGELOG.md logo.svg uv.lock
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove synapse_core — fully replaced by remex.core"
```

- [ ] **Step 5: Final verification**

```bash
git status
uv run pytest -q
```

Expected: clean working tree, all tests green.
