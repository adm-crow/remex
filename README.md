<div align="center">

  <img src="logo.svg" alt="remex" width="90" /><br/><br/>

  # remex

  **Search your documents with AI — privately, offline, on your machine.**

  <br/>

  [![License](https://img.shields.io/badge/License-Apache%202.0-5C6BC0?style=for-the-badge)](LICENSE)
  [![CI](https://img.shields.io/github/actions/workflow/status/adm-crow/remex/ci.yml?branch=main&style=for-the-badge&logo=github&logoColor=white&label=CI)](https://github.com/adm-crow/remex/actions)
  [![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/adm-crow/remex/releases)

  <br/>

  remex turns any folder of documents into a searchable knowledge base.<br/>
  Point it at your files, ask questions in plain language, and get answers — with sources.<br/>
  No cloud, no API key, no data leaving your machine.

  <br/>

  <img src="docs/screenshots/remex_homepage.png" alt="Remex Studio" width="720" />

</div>

<br/>

---

## Remex Studio

A native desktop app to ingest, search, and query your documents with AI — entirely on your machine, no cloud required.

<div align="center">
  <table>
    <tr>
      <td align="center">
        <img src="docs/screenshots/remex_ingest.png" alt="Ingest" width="340" /><br/>
        <sub>Ingest — pick a folder, watch live progress</sub>
      </td>
      <td align="center">
        <img src="docs/screenshots/remex_collection.png" alt="Collections" width="340" /><br/>
        <sub>Collections — stats, sources, manage</sub>
      </td>
    </tr>
    <tr>
      <td align="center">
        <img src="docs/screenshots/remex_settings.png" alt="Settings" width="340" /><br/>
        <sub>Settings — API server, AI provider, theme</sub>
      </td>
      <td></td>
    </tr>
  </table>
</div>

### Install

Requires Python 3.11+ and `remex[api]` on your PATH:

```bash
pip install "remex[api]"
```

Then **download the Remex Studio installer** for your platform and run it.

> Studio automatically starts `remex serve` in the background. You can also connect it to a manually-started server via **Settings → API Server**.

> **Building from source:** see [`studio/README.md`](studio/README.md).

---

## CLI

The CLI covers the same capabilities as the desktop app — useful for automation, scripting, and CI pipelines.

### Install

```bash
pip install remex
```

### Commands

```bash
# Set up a new project
remex init

# Ingest a folder
remex ingest ./docs
remex ingest ./docs --incremental          # skip unchanged files
remex ingest-sqlite ./data.db --table logs # ingest from SQLite

# Search
remex query "what is the refund policy?"
remex query "..." --ai                     # generate an AI answer
remex query "..." --ai --provider ollama --model llama3

# Start the API server
remex serve                                # http://localhost:8000
```

> Run `remex <command> --help` for all options.

---

## Features

| | |
|:---|:---|
| **Fully offline** | No data leaves your machine — local embeddings, local storage |
| **12 file formats** | `.pdf` `.docx` `.md` `.txt` `.csv` `.json` `.html` `.pptx` `.xlsx` `.epub` `.odt` `.jsonl` |
| **SQLite ingest** | Embed database rows alongside files in the same collection |
| **Incremental ingest** | SHA-256 hash check — unchanged files are skipped automatically |
| **AI answers** | Auto-detects Anthropic, OpenAI, or a local Ollama instance |
| **Multi-collection search** | Query across collections, results merged by relevance score |
| **FastAPI server** | `remex serve` exposes a REST + SSE API for any client |
| **remex.toml** | Per-project config — set defaults once, override with flags |

---

<div align="center">
  <sub>
    <a href="CHANGELOG.md">Changelog</a> ·
    <a href="LICENSE">Apache 2.0</a> ·
    <a href="https://pypi.org/project/remex/">PyPI</a> ·
    <a href="https://github.com/adm-crow/remex">GitHub</a>
  </sub>
</div>
