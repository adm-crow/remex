# Synapse-Core — v1.0 Roadmap

Progress toward a stable, production-ready 1.0 release.

## Already done ✅

- [x] Exception hierarchy — `SynapseError` base + typed subclasses
- [x] Typed API — `IngestResult`, `QueryResult`, `SynapseError` hierarchy
- [x] Incremental ingest (SHA-256 file-hash check)
- [x] SQLite ingest (`ingest_sqlite`)
- [x] Multi-format extraction (12 formats: txt, md, csv, pdf, docx, json, jsonl, html, pptx, xlsx, epub, odt)
- [x] Sentence-aware chunking (NLTK)
- [x] AI answer generation (`--ai` flag, Anthropic / OpenAI / Ollama)
- [x] Document metadata extraction (title, author, created — PDF/DOCX/HTML/PPTX/EPUB/ODT)
- [x] Beta status on PyPI

---

## Must-have — blockers for v1.0

- [x] **Streaming ingest** — large text files (`.txt`, `.md`, `.csv`, `.jsonl`) are now paged through the chunker without loading the entire file into memory (`streaming_threshold` param, default 50 MB). *(v0.6)*
- [x] **Progress callback** — `ingest()` accepts `on_progress: Callable[[IngestProgress], None]` for tqdm / custom UIs. *(v0.6)*
- [x] **Multi-collection query** — `query(collection_names=[...])` queries multiple collections and merges results ranked by score. *(v0.6)*
- [x] **Metadata filtering** — `query(where={...})` passes a ChromaDB `where` filter so callers can restrict results by source type, date range, etc. *(v0.6)*
- [x] **Async API** — `ingest_async()` / `query_async()` for FastAPI / async frameworks; backed by `asyncio.to_thread()`. *(v1.0.0)*
- [x] **`ingest()` skip reasons** — `IngestResult.skipped_reasons: list[str]` exposes *why* each file was skipped (`"hash_match"`, `"empty"`, `"extract_error: …"`). *(v0.6.1)*

---

## Should-have — important for a mature v1.0

- [x] **Embedding model mismatch detection** — warns when `embedding_model` differs from the model stored in collection metadata (set on first ingest). *(v0.6.1)*
- [x] **`purge()` returns `PurgeResult`** — typed return with `chunks_deleted` and `chunks_checked`, consistent with `IngestResult`. *(v0.6.1)*
- [x] **`reset()` confirmation guard in API** — `confirm: bool = False` parameter; raises `ValueError` unless `confirm=True`. CLI passes `confirm=True` after prompting. *(v0.6.1)*
- [x] **EPUB / ODT metadata** — `extract_metadata()` now extracts title, author, and date from EPUB (OPF/DC) and ODT files. *(v0.7.0)*
- [x] **`ingest_sqlite` progress callback** — same `on_progress` pattern as `ingest()`. *(v0.6.2)*

---

## Nice-to-have — DX polish

- [x] **`synapse init`** — scaffolds `docs/`, writes `synapse.toml`, updates `.gitignore`. *(v0.7.0)*
- [x] **Config file (`synapse.toml`)** — `[synapse]` section sets per-project defaults for all CLI commands; flags always override. *(v0.7.0)*
- [x] **`query --format json`** — CLI option to emit raw JSON for scripting / piping. *(v0.6.2)*
- [x] **Batch ingest API** — `ingest_many(paths: list[Path])` to ingest a specific list of files instead of scanning a directory. *(v0.6.2)*
- [x] **`ingest-sqlite` CLI options** — `--columns`, `--id-column`, `--row-template` now exposed as CLI flags. *(v0.6.2)*
- [x] **`--min-chunk-size` CLI flag** — exposed on `ingest` and `ingest-sqlite` commands, consistent with the Python API default of 50 chars. *(v0.6.3)*
- [x] **`query()` n_results validation** — raises `ValueError` when `n_results < 1`, consistent with the CLI's `IntRange(min=1)` guard. *(v0.6.3)*
- [x] **`ingest_many` incremental + streaming** — `incremental=True` (hash-skip) and `streaming_threshold` now supported in `ingest_many()`, consistent with `ingest()`. *(v0.7.0)*
- [x] **`--embedding-model` CLI flag** — exposed on `ingest`, `ingest-sqlite`, and `query` commands. *(v0.7.0)*
- [x] **Real integration tests** — end-to-end test hitting a real `PersistentClient` added. *(v0.7.0)*
