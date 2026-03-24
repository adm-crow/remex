<div align="center">
  <img src="logo.svg" alt="Synapse" width="110" /><br/><br/>

  <h1>synapse-core</h1>
  <p><strong>Local-first RAG for Python — ingest files, query semantically, feed any AI.</strong></p>

![PyPI - Python Version](https://img.shields.io/pypi/pyversions/synapse-core?style=flat-square&logo=python&logoColor=white)
![PyPI - Version](https://img.shields.io/pypi/v/synapse-core?style=flat-square&logo=pypi&logoColor=white)
![GitHub License](https://img.shields.io/github/license/adm-crow/synapse?style=flat-square&logo=github&logoColor=white)
<br>
![PyPI - Downloads](https://img.shields.io/pypi/dm/synapse-core?style=flat-square&logo=pypi&logoColor=white)
![GitHub branch check runs](https://img.shields.io/github/check-runs/adm-crow/synapse/main?style=flat-square&logo=github&logoColor=white)
![GitHub Release Date](https://img.shields.io/github/release-date/adm-crow/synapse?display_date=published_at&style=flat-square&logo=github&logoColor=white)
</div>

---

No cloud, no API key, no infrastructure required. Just point Synapse to a folder (or a SQLite database), run a single function, and semantically query your documents — entirely offline, right on your machine.

| | |
|---|---|
| **12 formats** | `.txt` `.md` `.csv` `.pdf` `.docx` `.json` `.jsonl` `.html` `.pptx` `.xlsx` `.epub` `.odt` |
| **Embeddings** | Local `sentence-transformers` — fully offline, no data leaves your machine |
| **Storage** | ChromaDB persistent vector store — survives restarts, idempotent upserts |
| **Extras** | SQLite ingestion · Async API · CLI · `synapse.toml` project config |

---

## Install

```bash
pip install synapse-core
# or
uv add synapse-core
```

> [!NOTE]
> Optional extras
> ```bash
> pip install "synapse-core[formats]"              # .html .pptx .xlsx .epub .odt support
> pip install "synapse-core[sentence]"             # sentence-aware chunking (requires NLTK)
> pip install "synapse-core[ai]"                   # Anthropic + OpenAI SDKs for --ai flag
> pip install "synapse-core[formats,sentence,ai]"  # everything
> ```

---

## Quickstart

```python
from synapse_core import ingest, query

data = ingest("./docs")
print(f"{data.sources_ingested}/{data.sources_found} files ingested, {data.chunks_stored} chunks stored")

results = query("what is the refund policy?", n_results=4)
for result in results:
    print(f"[{result['score']:.2f}]  {result['source']}")
    print(result["text"])
```

> [!TIP]
> `ingest()` upserts — run it as many times as you want, no duplicates. Use `incremental=True` to skip files whose content hasn't changed since the last run (SHA-256 check).

---

## CLI

```bash
synapse init                                      # scaffold docs/, synapse.toml, .gitignore

synapse ingest ./docs
synapse ingest ./docs --incremental               # skip unchanged files
synapse ingest ./docs --chunking sentence

synapse ingest-sqlite ./data.db --table articles
synapse ingest-sqlite ./data.db --table articles --columns "title,body"
synapse ingest-sqlite ./data.db --table articles --row-template "{title}: {body}"

synapse query "refund policy"
synapse query "..." -n 10 --format json
synapse query "..." --collections "docs,archive"
synapse query "..." --where '{"source_type": {"$eq": "file"}}'
synapse query "..." --ai                          # AI answer, provider auto-detected
synapse query "..." --ai --provider anthropic --model claude-opus-4-6

synapse sources                                   # list all indexed sources
synapse purge                                     # remove chunks from deleted files
synapse reset --yes                               # wipe the entire collection
```

> [!TIP]
> Every command accepts `--db PATH`, `--collection NAME`, and `--embedding-model`. Run `synapse <cmd> --help` for all options.

<details>
<summary>Full CLI flag reference</summary>

**`synapse ingest [SOURCE_DIR]`**
```
  SOURCE_DIR                         Directory to scan recursively [default: ./docs]
  --db PATH                          ChromaDB persistence path [default: ./synapse_db]
  --collection NAME                  Collection name [default: synapse]
  --chunk-size INT                   Target characters per chunk [default: 1000]
  --overlap INT                      Character overlap between chunks [default: 200]
  --min-chunk-size INT               Discard chunks shorter than this [default: 50]
  --chunking [word|sentence]         Chunking strategy [default: word]
  --streaming-threshold INT          Stream files larger than N MB [default: 50]; 0 = off
  --embedding-model MODEL            SentenceTransformer model name
  --incremental                      Skip files unchanged since last run (SHA-256)
```

**`synapse ingest-sqlite DB_PATH --table TABLE`**
```
  DB_PATH                            Path to the SQLite database file
  --table NAME              *        Table to ingest (required)
  --db PATH                          ChromaDB persistence path [default: ./synapse_db]
  --collection NAME                  Collection name [default: synapse]
  --columns col1,col2                Columns to embed (default: all columns)
  --id-column NAME                   Primary key column [default: id]
  --row-template STR                 Row format string, e.g. "{title}: {body}"
  --chunk-size INT                   Target characters per chunk [default: 1000]
  --overlap INT                      Character overlap between chunks [default: 200]
  --min-chunk-size INT               Discard chunks shorter than this [default: 50]
  --chunking [word|sentence]         Chunking strategy [default: word]
  --embedding-model MODEL            SentenceTransformer model name
```

**`synapse query TEXT`**
```
  TEXT                               Search query (required)
  --db PATH                          ChromaDB persistence path [default: ./synapse_db]
  --collection NAME                  Collection name [default: synapse]
  -n, --n-results INT                Number of results to return [default: 5]
  --embedding-model MODEL            SentenceTransformer model (must match ingest)
  --where JSON                       ChromaDB metadata filter as JSON
  --collections col1,col2            Query multiple collections, merge results by score
  --format [text|json]               Output format [default: text]
  --ai                               Generate an AI answer from retrieved chunks
  --provider [anthropic|openai|ollama]  LLM provider (auto-detected if omitted)
  --model NAME                       Model name override (e.g. gpt-4o, llama3)
```

</details>

---

## API reference

<details>
<summary>Full API reference — ingest · query · ingest_sqlite · ingest_many · async · purge · reset · sources</summary>

### `ingest()`

Scan a directory recursively, chunk every supported file, embed it, and persist to ChromaDB.

```python
from synapse_core import ingest

result = ingest(
    source_dir          = "./docs",
    db_path             = "./synapse_db",
    collection_name     = "synapse",
    chunk_size          = 1000,                # target characters per chunk
    overlap             = 200,                 # character overlap between chunks
    min_chunk_size      = 50,                  # discard chunks shorter than this
    embedding_model     = "all-MiniLM-L6-v2",
    incremental         = False,               # skip files unchanged since last run
    chunking            = "word",              # "word" or "sentence"
    streaming_threshold = 50 * 1024 * 1024,   # stream files > N bytes; 0 = disable
    verbose             = True,
    on_progress         = None,                # Callable[[IngestProgress], None]
)
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

---

### `query()`

Embed the query and return the closest matching chunks, ranked by relevance.

```python
from synapse_core import query

hits = query(
    text             = "what is the refund policy?",
    db_path          = "./synapse_db",
    collection_name  = "synapse",
    n_results        = 5,                      # must be >= 1
    embedding_model  = "all-MiniLM-L6-v2",    # must match the model used at ingest
    where            = None,                   # ChromaDB metadata filter dict
    collection_names = None,                   # list of names → query all, merge by score
)
```

Raises `CollectionNotFoundError` in single-collection mode. Missing collections are silently skipped in multi-collection mode.

**Filter examples:**
```python
hits = query("...", where={"source_type": {"$eq": "file"}})
hits = query("...", where={"source": {"$eq": "/abs/path/to/report.pdf"}})
hits = query("...", collection_names=["docs", "archive", "notes"])
```

> Supported operators: `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` `$in` `$nin`

---

### `ingest_sqlite()`

Ingest rows from a SQLite table. Files and database records coexist in the same collection and are queried together.

```python
from synapse_core import ingest_sqlite

result = ingest_sqlite(
    db_path         = "./data.db",
    table           = "articles",
    columns         = None,           # list of columns to embed; None = all
    id_column       = "id",           # primary key for stable chunk IDs
    row_template    = None,           # e.g. "{title}: {body}" — overrides default serialization
    chroma_path     = "./synapse_db",
    collection_name = "synapse",
    chunk_size      = 1000,
    overlap         = 200,
    min_chunk_size  = 50,
    embedding_model = "all-MiniLM-L6-v2",
    chunking        = "word",
    verbose         = True,
    on_progress     = None,
)
```

- If `id_column` is absent from the table, SQLite's built-in `rowid` is used automatically.
- Rows are serialized as `"col1: val1 | col2: val2 | ..."` unless `row_template` is set.

Raises `SourceNotFoundError` · `TableNotFoundError` · `ValueError` (bad column names).

---

### `ingest_many()`

Ingest an explicit list of files instead of scanning a directory.

```python
from synapse_core import ingest_many

result = ingest_many(
    paths               = ["./a.pdf", "./reports/q1.docx"],  # str or pathlib.Path
    db_path             = "./synapse_db",
    collection_name     = "synapse",
    chunk_size          = 1000,
    overlap             = 200,
    min_chunk_size      = 50,
    embedding_model     = "all-MiniLM-L6-v2",
    chunking            = "word",
    verbose             = True,
    incremental         = False,
    streaming_threshold = 50 * 1024 * 1024,
    on_progress         = None,
)
```

Unsupported or missing files are skipped — reasons recorded in `result.skipped_reasons`.

---

### Async API

`ingest_async()` and `query_async()` are drop-in async equivalents backed by `asyncio.to_thread()`. All parameters are identical to their sync counterparts.

```python
from synapse_core import ingest_async, query_async

async def main():
    result = await ingest_async("./docs", incremental=True)
    hits   = await query_async("refund policy", n_results=3)
```

**FastAPI example:**
```python
from fastapi import FastAPI
from synapse_core import ingest_async, query_async

app = FastAPI()

@app.post("/ingest")
async def ingest_endpoint(path: str):
    result = await ingest_async(source_dir=path)
    return {"ingested": result.sources_ingested, "chunks": result.chunks_stored}

@app.get("/search")
async def search_endpoint(q: str, n: int = 5):
    return await query_async(q, n_results=n)
```

---

### `purge()` · `reset()` · `sources()`

```python
from synapse_core import purge, reset, sources

paths  = sources(db_path="./synapse_db", collection_name="synapse")

result = purge(db_path="./synapse_db", collection_name="synapse")
print(f"Deleted {result.chunks_deleted} stale chunk(s) out of {result.chunks_checked} checked")

reset(db_path="./synapse_db", collection_name="synapse", confirm=True)
```

> [!WARNING]
> `reset()` raises `ValueError` unless `confirm=True` is explicitly passed.

**Logging:**
```python
import logging, synapse_core

synapse_core.setup_logging()                        # coloured console output
synapse_core.setup_logging(log_file="ingest.log")   # also write to a file
synapse_core.setup_logging(level=logging.WARNING)   # suppress info messages
```

</details>

---

## synapse.toml

Run `synapse init` once per project. Defaults for every command — CLI flags always override. Looked up in the **current working directory** at runtime.

```toml
[synapse]
db              = "./synapse_db"
collection      = "myproject"
embedding_model = "all-MiniLM-L6-v2"

# chunk_size     = 1000
# overlap        = 200
# min_chunk_size = 50
# chunking       = "word"     # "word" or "sentence"
```

---

## Use with any LLM

```python
from synapse_core import ingest, query

ingest("./docs")  # run once — idempotent

def ask(question: str, client) -> str:
    context = "\n\n".join(r["text"] for r in query(question, n_results=5))
    response = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        system=f"Answer using only the context below:\n\n{context}",
        messages=[{"role": "user", "content": question}],
    )
    return response.content[0].text
```

Or zero-code from the CLI — set `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` and use `--ai`:

```bash
synapse query "what changed in v2?" --ai
```

---

<details>
<summary>Reference — Return types · Exceptions · Metadata · Chunking · AI providers</summary>

### Return types

**`IngestResult`** — returned by `ingest()`, `ingest_many()`, `ingest_sqlite()`

| Field | Type | Description |
|---|---|---|
| `sources_found` | `int` | Files (or rows) discovered |
| `sources_ingested` | `int` | Successfully chunked and stored |
| `sources_skipped` | `int` | Skipped: empty, extract error, or hash unchanged |
| `chunks_stored` | `int` | Total chunks written to ChromaDB |
| `skipped_reasons` | `list[str]` | Human-readable reason per skip, e.g. `"doc.txt: empty"` |

**`PurgeResult`** — returned by `purge()`

| Field | Type | Description |
|---|---|---|
| `chunks_deleted` | `int` | Chunks removed from ChromaDB |
| `chunks_checked` | `int` | Total chunks scanned |

**`IngestProgress`** — received by the `on_progress` callback

| Field | Type | Description |
|---|---|---|
| `filename` | `str` | Base name of the file just processed |
| `files_done` | `int` | Files processed so far (including this one) |
| `files_total` | `int` | Total supported files found |
| `status` | `"ingested" \| "skipped" \| "error"` | Outcome for this file |
| `chunks_stored` | `int` | Cumulative chunks written in this run |

**`QueryResult`** — each item returned by `query()`

| Field | Type | Description |
|---|---|---|
| `text` | `str` | Chunk content |
| `source` | `str` | Absolute file path, or `/path/to/db.db::table` for SQLite |
| `source_type` | `str` | `"file"` or `"sqlite"` |
| `score` | `float` | Relevance 0–1 (higher = better) |
| `distance` | `float` | Raw ChromaDB L2 distance (lower = closer) |
| `chunk` | `int` | Chunk index within the source document |
| `doc_title` | `str` | Extracted title (empty string if unavailable) |
| `doc_author` | `str` | Extracted author (empty string if unavailable) |
| `doc_created` | `str` | ISO-8601 creation date (empty string if unavailable) |

---

### Exceptions

```
SynapseError                    ← base class, catch-all
├── SourceNotFoundError         ← also FileNotFoundError
├── CollectionNotFoundError     ← also ValueError
└── TableNotFoundError          ← also ValueError
```

Every exception inherits from both `SynapseError` and the matching Python built-in — existing `except ValueError` / `except FileNotFoundError` handlers keep working unchanged.

---

### Metadata extraction

| Format | Title | Author | Date |
|--------|:-----:|:------:|:----:|
| PDF | ✓ | ✓ | ✓ |
| DOCX | ✓ | ✓ | ✓ |
| HTML | ✓ | ✓ | ✓ |
| PPTX | ✓ | ✓ | ✓ |
| EPUB | ✓ | ✓ | ✓ |
| ODT | ✓ | ✓ | ✓ |
| TXT / MD / CSV / JSON / JSONL / XLSX | — | — | — |

All fields are always present in `QueryResult` — empty string when unavailable.

---

### Chunking modes

| Mode | Flag | Extra | Description |
|------|------|-------|-------------|
| **word** | `--chunking word` | *(none)* | Default. Splits on whitespace boundaries. Fast, works for all formats. |
| **sentence** | `--chunking sentence` | `[sentence]` | Splits on sentence boundaries using NLTK. Better retrieval precision for prose-heavy documents. |

Chunks shorter than `min_chunk_size` (default 50 chars) are discarded. Consecutive chunks overlap by `overlap` characters (default 200) to preserve context at boundaries.

Large text-based files (`txt`, `md`, `csv`, `jsonl`) are streamed through the chunker in pages when the file exceeds `streaming_threshold` (default 50 MB), keeping memory flat regardless of file size.

---

### AI providers

`--ai` and `generate_answer()` support three providers, auto-detected in priority order:

| Priority | Provider | Activation |
|----------|----------|------------|
| 1 | **Anthropic** | `ANTHROPIC_API_KEY` set |
| 2 | **OpenAI** | `OPENAI_API_KEY` set |
| 3 | **Ollama** | Local server at `http://localhost:11434` |

Default models: `claude-sonnet-4-5` · `gpt-4o` · `llama3`. Override with `--model`.

```bash
# Ollama setup
ollama serve
ollama pull llama3
synapse query "..." --ai --provider ollama --model llama3
```

The AI answer is generated from retrieved chunks only — your full corpus is never sent to any provider.

</details>

---

<div align="center">
  <sub>
    <a href="CHANGELOG.md">Changelog</a> ·
    <a href="ROADMAP.md">Roadmap</a> ·
    <a href="https://pypi.org/project/synapse-core/">PyPI</a> ·
    <a href="LICENSE">Apache 2.0</a>
  </sub>
</div>
