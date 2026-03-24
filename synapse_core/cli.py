import json
from pathlib import Path

import click

from . import __version__
from .ai import DEFAULT_MODELS, PROVIDERS, detect_provider, generate_answer
from .config import load_config
from .exceptions import SynapseError
from .pipeline import ingest, purge, query, reset, sources
from .sqlite_ingester import ingest_sqlite

_TOML_TEMPLATE = """\
[synapse]
# Default options applied to every synapse command.
# Override any value with a CLI flag — flags always win.

db             = "./synapse_db"    # ChromaDB persistence path
collection     = "synapse"         # collection name
embedding_model = "all-MiniLM-L6-v2"

# Chunking defaults (used by ingest / ingest-sqlite)
# chunk_size     = 1000
# overlap        = 200
# min_chunk_size = 50
# chunking       = "word"          # "word" or "sentence"
"""


class _SynapseGroup(click.Group):
    """Click group that injects synapse.toml values as CLI defaults."""

    def make_context(self, info_name, args, parent=None, **kwargs):  # type: ignore[override]
        kwargs.setdefault("default_map", load_config())
        return super().make_context(info_name, args, parent=parent, **kwargs)


@click.group(cls=_SynapseGroup)
@click.version_option(__version__, prog_name="synapse")
def cli() -> None:
    """synapse — local RAG: ingest files, query semantically."""


@cli.command(name="ingest")
@click.argument("source_dir", default="./docs")
@click.option(
    "--db",
    "db_path",
    default="./synapse_db",
    show_default=True,
    help="ChromaDB persistence path.",
)
@click.option(
    "--collection", default="synapse", show_default=True, help="Collection name."
)
@click.option(
    "--chunk-size",
    default=1000,
    show_default=True,
    type=click.IntRange(min=1),
    help="Target characters per chunk.",
)
@click.option(
    "--overlap",
    default=200,
    show_default=True,
    type=click.IntRange(min=0),
    help="Character overlap between chunks.",
)
@click.option(
    "--incremental",
    is_flag=True,
    help="Skip files whose content hasn't changed (SHA-256 check).",
)
@click.option(
    "--chunking",
    default="word",
    show_default=True,
    type=click.Choice(["word", "sentence"]),
    help="Chunking strategy.",
)
@click.option(
    "--streaming-threshold",
    default=50,
    show_default=True,
    type=click.IntRange(min=0),
    help="Stream files larger than this size (MB) to limit memory use. 0 = disable.",
)
@click.option(
    "--min-chunk-size",
    default=50,
    show_default=True,
    type=click.IntRange(min=1),
    help="Discard chunks shorter than this many characters.",
)
@click.option(
    "--embedding-model",
    default="all-MiniLM-L6-v2",
    show_default=True,
    help="SentenceTransformer model name for embeddings.",
)
def ingest_cmd(
    source_dir: str,
    db_path: str,
    collection: str,
    chunk_size: int,
    overlap: int,
    incremental: bool,
    chunking: str,
    streaming_threshold: int,
    min_chunk_size: int,
    embedding_model: str,
) -> None:
    """Ingest files from SOURCE_DIR into ChromaDB."""
    try:
        ingest(
            source_dir=source_dir,
            db_path=db_path,
            collection_name=collection,
            chunk_size=chunk_size,
            overlap=overlap,
            min_chunk_size=min_chunk_size,
            incremental=incremental,
            chunking=chunking,
            streaming_threshold=streaming_threshold * 1024 * 1024,
            embedding_model=embedding_model,
        )
    except (SynapseError, FileNotFoundError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)


@cli.command(name="ingest-sqlite")
@click.argument("db_path")
@click.option("--table", required=True, help="Table name to ingest.")
@click.option(
    "--db",
    "chroma_path",
    default="./synapse_db",
    show_default=True,
    help="ChromaDB persistence path.",
)
@click.option(
    "--collection", default="synapse", show_default=True, help="Collection name."
)
@click.option(
    "--columns",
    default=None,
    help="Comma-separated column names to embed (default: all columns).",
)
@click.option(
    "--id-column",
    default="id",
    show_default=True,
    help="Primary key column for stable chunk IDs.",
)
@click.option(
    "--row-template", default=None, help='Row format string, e.g. "{title}: {body}".'
)
@click.option(
    "--chunk-size",
    default=1000,
    show_default=True,
    type=click.IntRange(min=1),
    help="Target characters per chunk.",
)
@click.option(
    "--overlap",
    default=200,
    show_default=True,
    type=click.IntRange(min=0),
    help="Character overlap between chunks.",
)
@click.option(
    "--chunking",
    default="word",
    show_default=True,
    type=click.Choice(["word", "sentence"]),
    help="Chunking strategy.",
)
@click.option(
    "--min-chunk-size",
    default=50,
    show_default=True,
    type=click.IntRange(min=1),
    help="Discard chunks shorter than this many characters.",
)
@click.option(
    "--embedding-model",
    default="all-MiniLM-L6-v2",
    show_default=True,
    help="SentenceTransformer model name for embeddings.",
)
def ingest_sqlite_cmd(
    db_path: str,
    table: str,
    chroma_path: str,
    collection: str,
    columns: str | None,
    id_column: str,
    row_template: str | None,
    chunk_size: int,
    overlap: int,
    chunking: str,
    min_chunk_size: int,
    embedding_model: str,
) -> None:
    """Ingest records from a SQLite DB_PATH table into ChromaDB."""
    columns_list = (
        [c.strip() for c in columns.split(",") if c.strip()] if columns else None
    )
    try:
        ingest_sqlite(
            db_path=db_path,
            table=table,
            columns=columns_list,
            id_column=id_column,
            row_template=row_template,
            chroma_path=chroma_path,
            collection_name=collection,
            chunk_size=chunk_size,
            overlap=overlap,
            min_chunk_size=min_chunk_size,
            chunking=chunking,
            embedding_model=embedding_model,
        )
    except (SynapseError, FileNotFoundError, ValueError) as e:
        click.echo(f"Error: {e}", err=True)
        raise SystemExit(1)


@cli.command(name="query")
@click.argument("text")
@click.option(
    "--db",
    "db_path",
    default="./synapse_db",
    show_default=True,
    help="ChromaDB persistence path.",
)
@click.option(
    "--collection", default="synapse", show_default=True, help="Collection name."
)
@click.option(
    "-n",
    "--n-results",
    default=5,
    show_default=True,
    type=click.IntRange(min=1),
    help="Number of results to return.",
)
@click.option(
    "--ai",
    "use_ai",
    is_flag=True,
    help="Generate an AI answer from the retrieved chunks.",
)
@click.option(
    "--provider",
    default=None,
    type=click.Choice(list(PROVIDERS), case_sensitive=False),
    help="LLM provider (anthropic, openai, ollama). Auto-detected if omitted.",
)
@click.option(
    "--model", default=None, help="Model name override (e.g. gpt-4o, llama3)."
)
@click.option(
    "--where",
    default=None,
    help='Metadata filter as JSON (e.g. \'{"source_type": {"$eq": "file"}}\').',
)
@click.option(
    "--collections",
    default=None,
    help="Comma-separated list of collection names for multi-collection query.",
)
@click.option(
    "--format",
    "fmt",
    default="text",
    show_default=True,
    type=click.Choice(["text", "json"]),
    help="Output format. Use 'json' for scripting / piping.",
)
@click.option(
    "--embedding-model",
    default="all-MiniLM-L6-v2",
    show_default=True,
    help="SentenceTransformer model name (must match the model used at ingest).",
)
def query_cmd(
    text: str,
    db_path: str,
    collection: str,
    n_results: int,
    use_ai: bool,
    provider: str | None,
    model: str | None,
    where: str | None,
    collections: str | None,
    fmt: str,
    embedding_model: str,
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
        [c.strip() for c in collections.split(",") if c.strip()]
        if collections
        else None
    )

    try:
        results = query(
            text=text,
            db_path=db_path,
            collection_name=collection,
            n_results=n_results,
            where=where_dict,
            collection_names=collection_names,
            embedding_model=embedding_model,
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
        # Resolve provider
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
                question=text,
                context=context,
                provider=resolved,
                model=resolved_model,
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

    # Default: raw results
    for i, r in enumerate(results, 1):
        title = f" [{r['doc_title']}]" if r.get("doc_title") else ""
        click.echo(
            f"[{i}] score={r['score']:.3f}  {r['source']}{title}  chunk={r['chunk']}"
        )
        click.echo(f"    {r['text'][:200]}")
        click.echo()


@cli.command(name="sources")
@click.option(
    "--db",
    "db_path",
    default="./synapse_db",
    show_default=True,
    help="ChromaDB persistence path.",
)
@click.option(
    "--collection", default="synapse", show_default=True, help="Collection name."
)
def sources_cmd(db_path: str, collection: str) -> None:
    """List all ingested source paths."""
    paths = sources(db_path=db_path, collection_name=collection)
    if not paths:
        click.echo("Collection is empty.")
        return
    for path in paths:
        click.echo(path)


@cli.command(name="purge")
@click.option(
    "--db",
    "db_path",
    default="./synapse_db",
    show_default=True,
    help="ChromaDB persistence path.",
)
@click.option(
    "--collection", default="synapse", show_default=True, help="Collection name."
)
def purge_cmd(db_path: str, collection: str) -> None:
    """Remove chunks whose source file no longer exists on disk."""
    purge(db_path=db_path, collection_name=collection)


@cli.command(name="reset")
@click.option(
    "--db",
    "db_path",
    default="./synapse_db",
    show_default=True,
    help="ChromaDB persistence path.",
)
@click.option(
    "--collection", default="synapse", show_default=True, help="Collection name."
)
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
    """Scaffold a new synapse project in PATH (default: current directory).

    Creates:
      - docs/           directory for your source files
      - synapse.toml    project config with default values
      - .gitignore      entry for synapse_db/ (if inside a git repo)
    """
    root = Path(path).resolve()
    root.mkdir(parents=True, exist_ok=True)

    # docs/ directory
    docs = root / "docs"
    if not docs.exists():
        docs.mkdir()
        click.echo("  created  docs/")
    else:
        click.echo("  exists   docs/  (skipped)")

    # synapse.toml
    config_file = root / "synapse.toml"
    if not config_file.exists():
        config_file.write_text(_TOML_TEMPLATE, encoding="utf-8")
        click.echo("  created  synapse.toml")
    else:
        click.echo("  exists   synapse.toml  (skipped)")

    # .gitignore — only touch if inside a git repo
    git_dir = root / ".git"
    if git_dir.exists():
        gitignore = root / ".gitignore"
        entry = "synapse_db/"
        if gitignore.exists():
            if entry not in gitignore.read_text():
                with gitignore.open("a", encoding="utf-8") as f:
                    f.write(f"\n# synapse\n{entry}\n")
                click.echo(f"  updated  .gitignore  ({entry})")
        else:
            gitignore.write_text(f"# synapse\n{entry}\n", encoding="utf-8")
            click.echo(f"  created  .gitignore  ({entry})")

    click.echo()
    click.echo("Ready. Next steps:")
    click.echo("  1. Drop your files into docs/")
    click.echo("  2. synapse ingest")
    click.echo('  3. synapse query "your question"')
