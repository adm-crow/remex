<div align="center">
  <img src="logo.svg" alt="Synapse" width="130" /><br/><br/>

  <h1>⚡ synapse-core</h1>
  <p><strong>Local-first RAG for Python — ingest files, query semantically, feed any AI agent.</strong></p>

  [![CI](https://github.com/adm-crow/synapse/actions/workflows/ci.yml/badge.svg)](https://github.com/adm-crow/synapse/actions/workflows/ci.yml)
  [![tests](https://img.shields.io/badge/tests-187%20passing-brightgreen?style=flat-square)](tests/)
  [![PyPI](https://img.shields.io/pypi/v/synapse-core?style=flat-square&color=blue)](https://pypi.org/project/synapse-core/)
  [![Python](https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
  [![License](https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square)](LICENSE)
  [![Downloads](https://img.shields.io/pypi/dm/synapse-core?style=flat-square&color=orange)](https://pypi.org/project/synapse-core/)

</div>

---

**synapse** turns your local files and SQLite databases into a searchable vector store. No cloud, no API key, no infrastructure required.

- **12 file formats** — `txt` `md` `csv` `pdf` `docx` `json` `jsonl` `html` `pptx` `xlsx` `epub` `odt`
- **SQLite ingestion** — embed table rows alongside files in the same collection
- **Incremental ingestion** — SHA-256 hash check, skip unchanged files on re-runs
- **Semantic search** — ranked results with scores, source path, and document metadata
- **Document metadata** — title, author, created date extracted from PDF, DOCX, HTML, PPTX, EPUB, ODT
- **Local embeddings** — `sentence-transformers`, fully offline
- **CLI** — `synapse init`, `ingest`, `query --ai`, `sources`, `purge`, `reset`
- **Project config** — `synapse.toml` sets per-project defaults; no flags to repeat

---

## Install

```bash
pip install synapse-core
# or
uv add synapse-core
```

Optional extras:

```bash
pip install synapse-core[formats,sentence]      # .html .pptx .xlsx .epub .odt + sentence chunking
pip install synapse-core[ai]                    # Anthropic + OpenAI SDKs (for --ai flag)
pip install synapse-core[formats,sentence,ai]   # everything
```

---

## Quick start

```python
from synapse_core import ingest, query

# Ingest a folder — persists to ./synapse_db by default
result = ingest("./docs")
print(f"{result.sources_ingested}/{result.sources_found} files ingested, {result.chunks_stored} chunks stored")

# Query semantically
results = query("what is the refund policy?", n_results=4)
for r in results:
    print(f"[{r['score']:.2f}] {r['source']}")
    print(r['text'])
```

Each query result is a typed dict with keys: `text`, `source`, `source_type`, `score`, `distance`, `chunk`, `doc_title`, `doc_author`, `doc_created`.

> [!TIP]
> Run `ingest()` once — the collection persists on disk. Subsequent calls are idempotent (upsert, never duplicates). Use `incremental=True` to skip unchanged files.

---

## CLI

```bash
# Ingest
synapse ingest ./docs
synapse ingest ./docs --incremental                            # skip unchanged files
synapse ingest ./docs --chunking sentence                      # sentence-aware splitting
synapse ingest ./docs --streaming-threshold 100                # stream files > 100 MB (default 50)
synapse ingest ./docs --embedding-model paraphrase-MiniLM-L6-v2
synapse ingest-sqlite ./data.db --table articles
synapse ingest-sqlite ./data.db --table articles --columns "title,body"
synapse ingest-sqlite ./data.db --table articles --row-template "{title}: {body}"

# Query
synapse query "what is the refund policy?"
synapse query "..." --format json                              # emit JSON for scripting / piping
synapse query "..." --collections "docs,archive"
synapse query "..." --where '{"source_type": {"$eq": "file"}}'
synapse query "..." --embedding-model paraphrase-MiniLM-L6-v2 # must match ingest model
synapse query "..." --ai                                       # AI-synthesized answer (auto-detects provider)
synapse query "..." --ai --provider anthropic --model claude-sonnet-4-5

# Manage
synapse init             # scaffold docs/, synapse.toml, update .gitignore
synapse sources          # list all indexed sources
synapse purge            # remove chunks from deleted files
synapse reset --yes      # wipe the entire collection
```

Every command accepts `--db PATH`, `--collection NAME`, and `--embedding-model`. Run `synapse <command> --help` for all options.

> [!TIP]
> Run `synapse init` once per project. It creates a `synapse.toml` where you can set your default `db`, `collection`, `embedding_model`, and chunking options — so you stop repeating flags on every command.

---

## API reference

<details>
<summary><strong>ingest()</strong></summary>

```python
result = ingest(
    source_dir           = "./docs",            # folder to scan (recursive)
    db_path              = "./synapse_db",
    collection_name      = "synapse",
    chunk_size           = 1000,                # target characters per chunk
    overlap              = 200,
    min_chunk_size       = 50,                  # discard chunks shorter than this
    embedding_model      = "all-MiniLM-L6-v2",
    incremental          = False,               # skip unchanged files (SHA-256)
    chunking             = "word",              # "word" or "sentence" (requires [sentence])
    streaming_threshold  = 50 * 1024 * 1024,   # stream large text files; 0 = disable
    on_progress          = None,                # Callable[[IngestProgress], None]
)
# result: IngestResult — .sources_found / .sources_ingested / .sources_skipped
#                        .chunks_stored / .skipped_reasons
```

Raises `SourceNotFoundError` if `source_dir` does not exist.

**tqdm example:**
```python
from tqdm import tqdm
from synapse_core import ingest, IngestProgress

with tqdm(unit="file") as bar:
    def _cb(p: IngestProgress) -> None:
        bar.total = p.files_total
        bar.update(1)
        bar.set_postfix(file=p.filename, status=p.status)
    ingest("./docs", on_progress=_cb)
```

</details>

<details>
<summary><strong>ingest_sqlite()</strong></summary>

```python
result = ingest_sqlite(
    db_path         = "./data.db",
    table           = "articles",
    columns         = None,         # columns to embed (None = all)
    id_column       = "id",         # primary key for stable chunk IDs
    row_template    = None,         # optional "{title}: {body}" format string
    chroma_path     = "./synapse_db",
    collection_name = "synapse",
    chunk_size      = 1000,
    overlap         = 200,
    min_chunk_size  = 50,
    embedding_model = "all-MiniLM-L6-v2",
    chunking        = "word",
    on_progress     = None,         # Callable[[IngestProgress], None]
)
```

Raises `SourceNotFoundError` if the database file is missing, `TableNotFoundError` if the table does not exist.

</details>

<details>
<summary><strong>ingest_many()</strong></summary>

```python
result = ingest_many(
    paths                = ["./docs/a.pdf", "./reports/q1.docx"],  # explicit list
    db_path              = "./synapse_db",
    collection_name      = "synapse",
    chunk_size           = 1000,
    overlap              = 200,
    min_chunk_size       = 50,
    embedding_model      = "all-MiniLM-L6-v2",
    chunking             = "word",
    incremental          = False,               # skip unchanged files (SHA-256)
    streaming_threshold  = 50 * 1024 * 1024,   # stream large text files; 0 = disable
    on_progress          = None,                # Callable[[IngestProgress], None]
)
```

Ingests a specific list of files instead of scanning a directory. Unsupported or missing files are skipped and recorded in `result.skipped_reasons`. Accepts `str` or `pathlib.Path`.

</details>

<details>
<summary><strong>query()</strong></summary>

```python
results = query(
    text             = "what is the refund policy?",
    db_path          = "./synapse_db",
    collection_name  = "synapse",
    n_results        = 5,
    embedding_model  = "all-MiniLM-L6-v2",  # must match the model used at ingest
    where            = None,                 # ChromaDB metadata filter dict
    collection_names = None,                 # query multiple collections, merge by score
)
```

Returns `List[QueryResult]`. Raises `CollectionNotFoundError` (single-collection mode). Missing collections are silently skipped in multi-collection mode.

</details>

<details>
<summary><strong>purge() · reset() · sources()</strong></summary>

```python
from synapse_core import purge, reset, sources

paths = sources()                  # sorted list of all indexed source paths

result = purge()                   # remove chunks whose source no longer exists on disk
print(result.chunks_deleted, result.chunks_checked)

reset(confirm=True)                # wipe entire collection — confirm=True required
```

> [!WARNING]
> `reset()` requires `confirm=True`. The CLI passes it automatically after `--yes` or an interactive prompt.

```python
# Logging
import logging, synapse_core
synapse_core.setup_logging(log_file="ingest.log")
synapse_core.setup_logging(level=logging.DEBUG)
```

</details>

<details>
<summary><strong>Exceptions</strong></summary>

```
SynapseError                   ← catch-all
├── CollectionNotFoundError    ← also ValueError  (query on missing collection)
├── SourceNotFoundError        ← also FileNotFoundError  (missing dir or .db file)
└── TableNotFoundError         ← also ValueError  (missing SQLite table)
```

All subclasses inherit from the matching Python built-in, so existing `except ValueError` / `except FileNotFoundError` code continues to work.

</details>

---

## synapse.toml

Run `synapse init` once per project to generate a config file. Any key set there becomes the default for every CLI command — flags always override.

```toml
[synapse]
db              = "./synapse_db"         # ChromaDB persistence path
collection      = "myproject"            # collection name
embedding_model = "all-MiniLM-L6-v2"    # SentenceTransformer model

# Chunking (ingest / ingest-sqlite)
# chunk_size     = 1000
# overlap        = 200
# min_chunk_size = 50
# chunking       = "word"               # "word" or "sentence"
```

The file is looked up in the current working directory each time `synapse` runs. No `synapse.toml` = all defaults apply as before.

---

## Connecting an AI agent

synapse handles retrieval — wire `query()` to any LLM:

```python
from synapse_core import ingest, query

ingest("./docs")  # run once

def ask(question: str, client) -> str:
    context = "\n\n".join(r["text"] for r in query(question, n_results=4))
    # pass context to your LLM of choice (Anthropic, OpenAI, Ollama, …)
    ...
```

Set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` and use `synapse query "..." --ai` for a zero-code AI answer from the CLI.

---

## Roadmap

- [ ] Async API — `async def aingest()` / `async def aquery()` for FastAPI
- [ ] Pluggable embedders — OpenAI, Cohere, HuggingFace Inference API
- [ ] Pluggable vector stores — Qdrant, FAISS, Weaviate
- [ ] Re-ranking — cross-encoder re-ranking of retrieved chunks

See [ROADMAP.md](ROADMAP.md) for the full history and v1.0 progress.

---

<div align="center">
  <sub><a href="https://pypi.org/project/synapse-core/">PyPI</a> · <a href="CHANGELOG.md">Changelog</a> · <a href="LICENSE">Apache 2.0</a></sub>
</div>
