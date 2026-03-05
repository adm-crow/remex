<div align="center">
  <img src="logo.svg" alt="Synapse" width="180" />

  <h1>synapse</h1>

  <p><strong>Turn your files into answers.</strong></p>

  <p>
    Drop flat files into a folder.<br/>
    Synapse extracts, chunks, embeds and stores them locally.<br/>
    Connect any AI agent to get contextualised answers.
  </p>

  <p>
    <img alt="Python" src="https://img.shields.io/badge/python-3.9%2B-blue?style=flat-square&logo=python&logoColor=white" />
    <img alt="License" src="https://img.shields.io/badge/license-MIT-green?style=flat-square" />
    <img alt="Tests" src="https://img.shields.io/badge/tests-21%20passed-brightgreen?style=flat-square" />
    <img alt="ChromaDB" src="https://img.shields.io/badge/vector--db-ChromaDB-orange?style=flat-square" />
  </p>
</div>

---

## Overview

Synapse is a minimal, local-first Python package that turns a folder of documents into a **queryable vector database** — no cloud, no lock-in, no complexity.

```
./docs/                          ./synapse_db/
├── report.pdf      ──────►     ChromaDB collection
├── notes.txt       ingest()    (embeddings + metadata)
└── specs.docx                       │
                                      ▼
                              Any AI agent queries it
```

The package handles the full ingestion pipeline. Your AI agent connects directly to ChromaDB — completely agnostic.

---

## Features

- **Local first** — everything runs on your machine, no API keys required
- **Idempotent** — re-run `ingest()` safely, existing chunks are updated not duplicated
- **Recursive scan** — picks up files in subdirectories automatically
- **Pluggable** — swap the embedding model or extend extractors for new file types
- **Agnostic** — works with LangChain, LlamaIndex, custom agents, or raw ChromaDB queries

---

## Supported file types

| Extension | Library |
|---|---|
| `.txt`, `.md` | built-in |
| `.pdf` | `pypdf` |
| `.docx`, `.doc` | `python-docx` |
| `.csv` | built-in `csv` |

---

## Installation

```bash
pip install -e .
```

> **Requirements:** Python 3.9+

Dependencies are installed automatically: `chromadb`, `sentence-transformers`, `pypdf`, `python-docx`.

---

## Quick start

### 1 — Drop your files

```
./docs/
├── company_policy.pdf
├── product_faq.txt
└── meeting_notes.docx
```

### 2 — Ingest

```python
from synapse import ingest

ingest()
# Ingesting: company_policy.pdf  ->  12 chunks stored
# Ingesting: product_faq.txt     ->   8 chunks stored
# Ingesting: meeting_notes.docx  ->   5 chunks stored
#
# Done. Collection 'synapse' in './synapse_db'
```

### 3 — Query from your agent

```python
import chromadb
from chromadb.utils import embedding_functions

ef = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)
client = chromadb.PersistentClient(path="./synapse_db")
collection = client.get_collection("synapse", embedding_function=ef)

results = collection.query(
    query_texts=["What is the refund policy?"],
    n_results=5,
)

for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
    print(f"[{meta['source']}]  {doc[:200]}")
```

---

## API reference

### `ingest()`

```python
from synapse import ingest

ingest(
    source_dir="./docs",            # folder to scan
    db_path="./synapse_db",         # where ChromaDB persists data
    collection_name="synapse",      # ChromaDB collection name
    chunk_size=1000,                # characters per chunk
    overlap=200,                    # character overlap between chunks
    embedding_model="all-MiniLM-L6-v2",  # any SentenceTransformer model
    verbose=True,                   # print progress
)
```

All parameters are optional — calling `ingest()` with no arguments works out of the box.

---

## Project structure

```
synapse/
├── docs/                   # drop your files here
├── examples/
│   └── quickstart.py       # minimal agent query example
├── synapse/
│   ├── __init__.py         # public API: ingest()
│   ├── pipeline.py         # orchestrates the full pipeline
│   ├── extractors.py       # file type → raw text
│   └── chunker.py          # raw text → overlapping chunks
└── tests/
    ├── test_pipeline.py
    ├── test_extractors.py
    └── test_chunker.py
```

---

## Running tests

```bash
pip install -e ".[dev]"
pytest tests/ -v
```

---

## How it works

```
┌─────────────┐   extract()   ┌────────────┐   chunk_text()   ┌────────────┐
│  File (.pdf,│ ────────────► │  Raw text  │ ───────────────► │   Chunks   │
│  .txt, ...) │               └────────────┘                   └─────┬──────┘
└─────────────┘                                                       │
                                                               embed + upsert
                                                                       │
                                                                       ▼
                                                            ┌──────────────────┐
                                                            │  ChromaDB (local)│
                                                            └──────────────────┘
```

1. **Extract** — raw text is pulled from each file using a per-extension extractor
2. **Chunk** — text is split into overlapping windows (default: 1000 chars, 200 overlap)
3. **Embed** — `sentence-transformers` converts each chunk into a vector (runs locally)
4. **Store** — chunks + vectors + metadata land in a persistent ChromaDB collection

---

## License

MIT
