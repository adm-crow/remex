<div align="center">

  <img src="logo.svg" alt="remex" width="90" /><br/><br/>

  # remex

  **Search your documents with AI — privately, offline, on your machine.**

  <br/>

  [![License](https://img.shields.io/badge/License-Apache%202.0-5C6BC0?style=for-the-badge)](LICENSE)
  [![CI](https://img.shields.io/github/actions/workflow/status/adm-crow/remex/ci.yml?branch=main&style=for-the-badge&logo=github&logoColor=white&label=CI)](https://github.com/adm-crow/remex/actions)
  [![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/adm-crow/remex/releases)

  <br/>

  <img src="docs/screenshots/remex_homepage.png" alt="Remex Studio" width="720" />

</div>

---

remex is a local-first knowledge base for your documents. Point it at any folder — PDFs, notes, code, spreadsheets — and it becomes instantly searchable using natural language. Ask questions and get answers backed by the exact sources in your files, with no data ever leaving your machine.

It runs entirely offline, requires no cloud account, and works with any AI provider you already have — Anthropic, OpenAI, or a local Ollama instance.

---

## Remex Studio

A native Windows desktop app to ingest, search, and query your documents with AI.

### Install

> **A Windows installer (`.exe`) is coming soon and will be available on the [Releases](https://github.com/adm-crow/remex/releases) page.**

> **Building from source:** see [`studio/README.md`](studio/README.md).

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
| **Source filtering** | Narrow results by file or table within a collection |
| **Export results** | Copy or export query results for use elsewhere |

---

<div align="center">
  <sub>
    <a href="CHANGELOG.md">Changelog</a> ·
    <a href="LICENSE">Apache 2.0</a> ·
    <a href="https://github.com/adm-crow/remex">GitHub</a>
  </sub>
</div>
