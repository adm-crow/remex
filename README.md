<div align="center">

  <img src="logo.svg" alt="Remex" width="96" /><br/><br/>

  # Remex

  **Your private knowledge base — fully offline, never leaves your machine.**

  <br/>

  [![GitHub Release](https://img.shields.io/github/v/release/adm-crow/remex?style=flat&label=Release&color=4f8ef7)](https://github.com/adm-crow/remex/releases)
  [![CI](https://img.shields.io/github/actions/workflow/status/adm-crow/remex/ci.yml?style=flat&logo=github&label=CI)](https://github.com/adm-crow/remex/actions)
  [![PyPI](https://img.shields.io/pypi/v/remex-cli?style=flat&logo=pypi&logoColor=white&label=PyPI&color=3775a9)](https://pypi.org/project/remex-cli)
  [![License](https://img.shields.io/badge/CLI-Apache%202.0-22c55e?style=flat&label=License)](LICENSES.md)
  [![Windows](https://img.shields.io/badge/Windows-0078D6?style=flat&logo=windows&logoColor=white)](https://github.com/adm-crow/remex/releases)
  [![Python](https://img.shields.io/badge/3.11+-FFD43B?style=flat&logo=python&logoColor=black)](https://pypi.org/project/remex-cli)

  <br/>

  <img src="docs/screenshots/remex_homepage.png" alt="Remex Studio — homepage" width="860" />

</div>

<br/>

Remex turns any folder of documents — PDFs, Word files, notes, spreadsheets, code — into a **private, searchable knowledge base**. Ask questions in plain language and get answers grounded in your own files, with sources cited.

Everything runs on your machine. No cloud account. No API key required for search. Bring your own AI provider (Anthropic, OpenAI, or a local Ollama instance) only when you want synthesised answers.

<br/>

---

## Remex Studio

Native desktop app for Windows. No terminal required.

**[⬇ Download the latest release](https://github.com/adm-crow/remex/releases)**

> **⚠️ Windows SmartScreen warning**
> Windows may display a "Windows protected your PC" warning when downloading or installing Remex Studio. This happens because the app is not yet code-signed with a paid certificate — the software is safe and fully open source, feel free to audit the source code in this repository.
> To proceed: click **"More info"** then **"Run anyway"**.

<br/>

### What you can do

| | |
|---|---|
| 🔍 **Semantic search** | Vector similarity search across one or more collections simultaneously |
| 🤖 **AI Answer** | Ask a question, get a synthesised answer with cited sources (Anthropic · OpenAI · Ollama) |
| 📄 **12 file formats** | `.pdf` `.docx` `.md` `.txt` `.csv` `.json` `.jsonl` `.html` `.pptx` `.xlsx` `.epub` `.odt` |
| 🗄 **SQLite ingest** | Embed rows from any table alongside your files |
| ♻️ **Incremental ingest** | SHA-256 hash check — only changed files are re-processed |
| 🎯 **Source filter** | Narrow results to one or more documents before searching or asking AI |
| 🔎 **Chunk viewer** | Expand any result to read the full chunk, navigate with keyboard arrows |
| 📦 **Collections manager** | Rename, describe, purge, bulk-delete sources, one-click re-ingest |
| 📤 **Export** | JSON · CSV · Markdown · BibTeX · RIS · CSL-JSON · Obsidian vault |
| 🌙 **Themes** | Light, dark, auto (follows OS) + ten accent colours |
| ⌨️ **Keyboard-driven** | Press `?` anywhere in Studio for the full shortcuts reference |

<br/>

---

## Remex Pro — 29€, one-time

Free Remex covers the full local-first workflow. **Remex Pro** unlocks power-user features for a single one-time payment (two machines):

| Feature | Free | Pro |
|:--------|:----:|:---:|
| Semantic search | ✓ | ✓ |
| AI Answer | ✓ | ✓ |
| All 12 file formats + SQLite | ✓ | ✓ |
| Incremental ingest | ✓ | ✓ |
| Source filter + chunk viewer | ✓ | ✓ |
| Collections manager | ✓ | ✓ |
| JSON · CSV · Markdown export | ✓ | ✓ |
| Query history (last 20) | ✓ | ✓ |
| **Pro embedding models** (`bge-large`, `e5-large`, `nomic-embed`) | — | ✓ |
| **Advanced exports** (BibTeX · RIS · CSL-JSON · Obsidian vault) | — | ✓ |
| **Watch-folder auto-ingest** | — | ✓ |
| **Unlimited searchable query history** | — | ✓ |
| **Extra accent themes** (8 additional) | — | ✓ |
| **Priority email support** (48-hour business-day SLA) | — | ✓ |

Activate in `Settings → License` inside Studio. Licenses are issued and validated offline via [Lemon Squeezy](https://lemonsqueezy.com/).

<br/>

---

## Python CLI & Library

```bash
pip install remex-cli            # core — ingest + query
pip install "remex-cli[api]"     # + FastAPI sidecar (used by Studio)
```

### Quick start

```bash
# Scaffold a project
remex init

# Ingest a folder of documents
remex ingest ./docs

# Semantic search
remex query "how does authentication work?"

# AI-synthesised answer (requires ANTHROPIC_API_KEY, OPENAI_API_KEY, or a running Ollama)
remex query "how does authentication work?" --ai
```

### Command reference

| Command | Description |
|:--------|:------------|
| `remex init [path]` | Scaffold `docs/`, `remex.toml`, and `.gitignore` entries |
| `remex ingest <dir>` | Ingest files from a directory into a collection |
| `remex ingest-sqlite <db>` | Ingest rows from a SQLite table |
| `remex query <text>` | Semantic search; add `--ai` for an AI-synthesised answer |
| `remex sources` | List all ingested source paths in a collection |
| `remex stats` | Show chunk and source counts |
| `remex delete-source <path>` | Remove all chunks for a specific source |
| `remex purge` | Remove chunks whose source file no longer exists on disk |
| `remex reset` | Wipe an entire collection |
| `remex list-collections` | List all collections in a database |
| `remex serve` | Start the FastAPI sidecar on `localhost:8745` |

```bash
remex <command> --help    # full option reference for any command
```

### Use as a library

```python
from remex import ingest, query

# Ingest a folder
result = ingest("./docs", collection_name="my-kb")
print(f"{result.chunks_stored} chunks stored")

# Search
results = query("how does auth work?", collection_name="my-kb")
for r in results:
    print(f"[{r.score:.3f}] {r.source}  →  {r.text[:120]}")
```

<br/>

---

## Configuration

Drop a `remex.toml` in your project root (or run `remex init` to generate one):

```toml
[remex]
db              = "./remex_db"
collection      = "my-kb"
embedding_model = "all-MiniLM-L6-v2"

# chunk_size     = 1000   # tokens per chunk
# overlap        = 200    # overlap between chunks
# min_chunk_size = 50     # discard chunks shorter than this
# chunking       = "word" # "word" or "sentence"
```

CLI flags always override `remex.toml` values.

<br/>

---

## Supported embedding models

| Preset | Model | Size | Notes |
|:-------|:------|:----:|:------|
| **Light** | `all-MiniLM-L6-v2` | 22 MB | Default — fast, good accuracy |
| **Balanced** | `intfloat/e5-base-v2` | 438 MB | Better retrieval quality |
| **Multilingual** | `paraphrase-multilingual-MiniLM-L12-v2` | 470 MB | 50+ languages |
| **Large** *(Pro)* | `BAAI/bge-large-en-v1.5` | 1.3 GB | Best English accuracy |
| **E5 Large** *(Pro)* | `intfloat/e5-large-v2` | 1.3 GB | Strong retrieval benchmark |
| **Long ctx** *(Pro)* | `nomic-ai/nomic-embed-text-v1.5` | 547 MB | 8 192-token context window |

Any model from [SBERT](https://www.sbert.net/docs/pretrained_models.html), [HuggingFace sentence-similarity](https://huggingface.co/models?pipeline_tag=sentence-similarity), or [Ollama](https://ollama.com/search?c=embedding) can be used by typing the model name directly.

<br/>

---

## Building from source

> **Studio** requires [Rust](https://rustup.rs/), [Node.js 20+](https://nodejs.org/), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for Windows.

```bash
# Python CLI
pip install -e ".[dev]"
pytest

# Studio (dev server with hot-reload)
cd studio
npm install
npm run tauri dev

# Studio (production build)
npm run tauri build
```

See [`studio/README.md`](studio/README.md) for the full build guide.

<br/>

---

<div align="center">

  **[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Licensing](LICENSES.md) · [GitHub](https://github.com/adm-crow/remex)**

  <sub>Python CLI: Apache-2.0 · Studio (v1.3.0+): FSL-1.1-MIT — see <a href="LICENSES.md">LICENSES.md</a></sub>

</div>
