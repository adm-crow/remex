<div align="center">
  <img src="logo.svg" alt="Synapse" width="130" /><br/><br/>

  <h1>⚡ synapse-core</h1>
  <p><strong>Local-first RAG for Python — ingest files, query semantically, feed any AI agent.</strong></p>

  [![CI](https://github.com/adm-crow/synapse/actions/workflows/ci.yml/badge.svg)](https://github.com/adm-crow/synapse/actions/workflows/ci.yml)
  [![tests](https://img.shields.io/badge/tests-155%20passing-brightgreen?style=flat-square)](tests/)
  [![PyPI](https://img.shields.io/pypi/v/synapse-core?style=flat-square&color=blue)](https://pypi.org/project/synapse-core/)
  [![Python](https://img.shields.io/badge/python-3.11%2B-blue?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
  [![License](https://img.shields.io/badge/license-Apache%202.0-green?style=flat-square)](LICENSE)
  [![Downloads](https://img.shields.io/pypi/dm/synapse-core?style=flat-square&color=orange)](https://pypi.org/project/synapse-core/)

</div>

---

**synapse** turns your local files and SQLite databases into a searchable vector store. No cloud, no API key, no infrastructure required.

```
Files / SQLite  ──►  Extract  ──►  Chunk  ──►  Embed  ──►  ChromaDB  ──►  Your AI Agent
```

| | Feature | |
|:---:|:---|:---|
| 📄 | **12 file formats** | `txt` `md` `csv` `pdf` `docx` `json` `jsonl` `html` `pptx` `xlsx` `epub` `odt` |
| 🗄️ | **SQLite ingestion** | Embed table records alongside files in the same collection |
| ✂️ | **Smart chunking** | Word-boundary and sentence-aware, configurable size & overlap |
| 🧠 | **Local embeddings** | `sentence-transformers` — no API key, fully offline |
| 🔁 | **Incremental ingestion** | SHA-256 hash — skip unchanged files on re-runs |
| 🔍 | **Semantic search** | Ranked results with scores, source path, and document metadata |
| 🖥️ | **CLI** | `synapse ingest`, `query --ai`, `sources`, `purge`, `reset` |
| 🤖 | **Agent-agnostic** | Works with Anthropic, OpenAI, Ollama — anything |

---

## Install

```bash
pip install synapse-core
# or
uv add synapse-core
```

Extra file formats (`.html` `.pptx` `.xlsx` `.epub` `.odt`) and sentence chunking:

```bash
pip install synapse-core[formats,sentence]
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

`ingest()` returns an [`IngestResult`](#ingestresult) with ingestion stats. Each query result is a typed dict ([`QueryResult`](#queryresult)):

```python
{
    "text":        "chunk content...",
    "source":      "/abs/path/to/file.txt",
    "source_type": "file",               # "file" or "sqlite"
    "score":       0.91,                 # relevance 0–1, higher is better
    "distance":    0.09,                 # raw ChromaDB L2 distance
    "chunk":       2,                    # index within the source document
    "doc_title":   "Company Policy",     # from PDF/DOCX/HTML/PPTX metadata
    "doc_author":  "Jane Doe",
    "doc_created": "2024-01-15T...",
}
```

> [!TIP]
> Run `ingest()` once — the collection persists on disk. Subsequent calls are idempotent (upsert, never duplicates). Use `incremental=True` to skip unchanged files.

---

## CLI

```bash
# Ingest
synapse ingest ./docs
synapse ingest ./docs --incremental          # skip unchanged files
synapse ingest ./docs --chunking sentence    # sentence-aware splitting
synapse ingest ./docs --streaming-threshold 100  # stream files > 100 MB (default 50)
synapse ingest-sqlite ./data.db --table articles

# Query
synapse query "what is the refund policy?"   # raw chunks
synapse query "..." --collections "docs,archive"  # merge results from multiple collections
synapse query "..." --where '{"source_type": {"$eq": "file"}}'  # metadata filter

# AI-powered answer — set your key first:
# macOS/Linux:        export ANTHROPIC_API_KEY="sk-ant-..."
# Windows PowerShell: $env:ANTHROPIC_API_KEY = "sk-ant-..."

synapse query "what is the refund policy?" --ai
synapse query "..." --ai --provider anthropic --model claude-sonnet-4-5
synapse query "..." --ai --provider openai   --model gpt-4o
synapse query "..." --ai --provider ollama   --model mistral

# Manage
synapse sources          # list all indexed sources
synapse purge            # remove chunks from deleted files
synapse reset --yes      # wipe the entire collection
```

Every command accepts `--db PATH` and `--collection NAME` to target a specific store. Run `synapse <command> --help` for all options.

---

## Connecting an AI agent

synapse handles retrieval — you wire it to any LLM. Full example with the **Anthropic SDK**:

```bash
pip install synapse-core anthropic
# macOS/Linux:        export ANTHROPIC_API_KEY="sk-ant-..."
# Windows PowerShell: $env:ANTHROPIC_API_KEY = "sk-ant-..."
```

```python
import anthropic
from anthropic.types import TextBlock
from synapse_core import ingest, query

ingest("./docs")  # run once

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

def ask(question: str) -> str:
    chunks = query(question, n_results=4)
    context = "\n\n".join(r["text"] for r in chunks)

    response = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        system=(
            "You are a helpful assistant. "
            "Answer using ONLY the context below. "
            "If the answer is not in the context, say so.\n\n"
            f"CONTEXT:\n{context}"
        ),
        messages=[{"role": "user", "content": question}],
    )
    text_block = next((b for b in response.content if isinstance(b, TextBlock)), None)
    if text_block is None:
        raise RuntimeError("Anthropic response contained no text block.")
    return text_block.text

print(ask("What is the refund policy?"))
```

> [!NOTE]
> Swap `anthropic` for `openai`, `ollama`, or any other SDK — the `query()` call stays the same.

---

## API reference

<details>
<summary><strong>ingest()</strong></summary>

```python
result = ingest(
    source_dir           = "./docs",            # folder to scan (recursive)
    db_path              = "./synapse_db",      # ChromaDB persistence path
    collection_name      = "synapse",
    chunk_size           = 1000,                # target characters per chunk
    overlap              = 200,                 # overlap between consecutive chunks
    min_chunk_size       = 50,                  # discard chunks shorter than this
    embedding_model      = "all-MiniLM-L6-v2",
    incremental          = False,               # skip unchanged files (SHA-256)
    chunking             = "word",              # "word" or "sentence" (requires [sentence])
    verbose              = True,
    streaming_threshold  = 50 * 1024 * 1024,   # stream .txt/.md/.csv/.jsonl files > 50 MB
    on_progress          = None,                # optional Callable[[IngestProgress], None]
)
# result.sources_found / sources_ingested / sources_skipped / chunks_stored
```

Raises `SourceNotFoundError` if `source_dir` does not exist.

**Progress callback (tqdm example):**
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
    columns         = None,                 # columns to embed (None = all)
    id_column       = "id",                 # primary key for stable chunk IDs
    row_template    = None,                 # optional "{title}: {body}" format string
    chroma_path     = "./synapse_db",
    collection_name = "synapse",
    chunk_size      = 1000,
    overlap         = 200,
    min_chunk_size  = 50,
    embedding_model = "all-MiniLM-L6-v2",
    chunking        = "word",
    verbose         = True,
)
# result.sources_found / sources_ingested / sources_skipped / chunks_stored
```

Raises `SourceNotFoundError` if the database file is missing, `TableNotFoundError` if the table does not exist.

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
    where            = None,                 # optional ChromaDB metadata filter
    collection_names = None,                 # query multiple collections, merge by score
)

# Metadata filter example — only return file chunks:
results = query("...", where={"source_type": {"$eq": "file"}})

# Multi-collection example — merge results from two collections:
results = query("...", collection_names=["docs", "archive"])
```

Returns `List[QueryResult]` — each item is a typed dict with keys: `text`, `source`, `source_type`, `score`, `distance`, `chunk`, `doc_title`, `doc_author`, `doc_created`. Raises `CollectionNotFoundError` if no collection exists yet (single-collection mode). Missing collections are silently skipped in multi-collection mode.

</details>

<details>
<summary><strong>purge() · reset() · sources()</strong></summary>

```python
from synapse_core import purge, reset, sources

sources()   # list all ingested source paths
purge()     # remove chunks whose source file no longer exists on disk
reset()     # delete the entire collection (irreversible)
```

All three accept `db_path` and `collection_name`.

```python
# Logging — colored INFO by default
import logging, synapse_core
synapse_core.setup_logging(log_file="ingest.log")       # persist to file
synapse_core.setup_logging(level=logging.DEBUG)          # more verbose
synapse_core.setup_logging(level=logging.CRITICAL)       # silence
```

</details>

<details>
<summary><strong>Exceptions · Models</strong></summary>

#### IngestResult

Returned by `ingest()` and `ingest_sqlite()`.

```python
from synapse_core import IngestResult

result: IngestResult = ingest("./docs")
print(result.sources_found)      # files/rows discovered
print(result.sources_ingested)   # successfully stored
print(result.sources_skipped)    # unchanged (incremental), empty, or errored
print(result.chunks_stored)      # total chunks written to ChromaDB
```

#### QueryResult

A `TypedDict` — plain `dict` at runtime, typed for static analysis.

```python
from synapse_core import QueryResult
from typing import List

results: List[QueryResult] = query("refund policy")
```

#### Exception hierarchy

```
SynapseError                   ← catch-all for all synapse errors
├── CollectionNotFoundError    ← also a ValueError  (query on missing collection)
├── SourceNotFoundError        ← also a FileNotFoundError  (missing dir or .db file)
└── TableNotFoundError         ← also a ValueError  (missing SQLite table)
```

```python
from synapse_core import SynapseError, CollectionNotFoundError

try:
    results = query("test", db_path="./empty_db")
except CollectionNotFoundError:
    print("Run ingest() first.")
except SynapseError as e:
    print(f"Synapse error: {e}")
```

All subclasses also inherit from the matching Python built-in (`ValueError`, `FileNotFoundError`) so existing `except ValueError` / `except FileNotFoundError` code continues to work unchanged.

</details>

---

## Architecture

```
synapse/
├── synapse_db/              ← ChromaDB writes here (auto-created)
└── synapse_core/
    ├── __init__.py          ← public API
    ├── cli.py               ← synapse ingest · ingest-sqlite · query · sources · purge · reset
    ├── pipeline.py          ← ingest() · query() · purge() · reset() · sources()
    ├── sqlite_ingester.py   ← ingest_sqlite()
    ├── extractors.py        ← 12 formats + document metadata extraction
    ├── chunker.py           ← word-boundary & sentence-aware chunking
    ├── models.py            ← IngestResult · QueryResult
    ├── exceptions.py        ← SynapseError hierarchy
    └── logger.py            ← colored logger · setup_logging()
```

---

## Roadmap

- [x] 12 file formats — `txt`, `md`, `pdf`, `docx`, `csv`, `json`, `jsonl`, `html`, `pptx`, `xlsx`, `epub`, `odt`
- [x] Word-boundary & sentence-aware chunking
- [x] Local embeddings — `sentence-transformers`, fully offline
- [x] ChromaDB — persistent vector store, zero config
- [x] Idempotent ingestion — upsert, never duplicates
- [x] Incremental ingestion — SHA-256 hash check
- [x] Document metadata — title, author, creation date
- [x] Collection management — `purge()`, `reset()`, `sources()`
- [x] SQLite ingestion — `ingest_sqlite()`
- [x] CI/CD — GitHub Actions, Python 3.11–3.13
- [x] PyPI release — `pip install synapse-core`
- [x] CLI — `synapse ingest`, `query --ai`, `purge`, `reset`, `sources`
- [x] Typed API — `IngestResult`, `QueryResult`, `SynapseError` hierarchy
- [x] Streaming ingest — pages through large files without loading them fully into memory
- [x] Progress callback — `on_progress: Callable[[IngestProgress], None]` for tqdm / UIs
- [x] Multi-collection query — merge results from several collections ranked by score
- [x] Metadata filtering — `query(where={"source_type": {"$eq": "file"}})` ChromaDB filter
- [ ] File watcher — `watch()` auto-ingest on change
- [ ] Pluggable embedders — OpenAI, Cohere, HuggingFace Inference API
- [ ] Pluggable vector stores — Qdrant, FAISS, Weaviate
- [ ] Re-ranking — cross-encoder re-ranking of retrieved chunks

---

<div align="center">
  <sub><a href="https://pypi.org/project/synapse-core/">PyPI</a> · <a href="LICENSE">Apache 2.0</a></sub>
</div>
