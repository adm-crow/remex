# Changelog

All notable changes to `synapse-core` are documented here.

---

## [1.0.0] — 2026-03-24

### Added
- `ingest_async()` — async wrapper around `ingest()`, runs in a thread pool via `asyncio.to_thread()`; full parameter parity with `ingest()`
- `query_async()` — async wrapper around `query()`, runs in a thread pool via `asyncio.to_thread()`; full parameter parity with `query()`
- Both functions exported from the top-level `synapse_core` namespace

### Fixed
- `ingest_many()` was not returning its `IngestResult` (returned `None`)

---

## [0.7.0] — 2026-03-18

### Added
- `--embedding-model` CLI flag on `ingest`, `ingest-sqlite`, and `query` — override the SentenceTransformer model without touching Python code
- `ingest_many()` gains `incremental=True` (SHA-256 hash-skip) and `streaming_threshold` — now consistent with `ingest()`
- `synapse init` CLI command — scaffolds `docs/`, writes `synapse.toml`, adds `synapse_db/` to `.gitignore`
- `synapse.toml` project config — `[synapse]` section sets per-project defaults for all CLI commands; CLI flags always override
- EPUB metadata extraction — `extract_metadata()` reads title, author, date from OPF/Dublin Core
- ODT metadata extraction — `extract_metadata()` reads `dc:title`, `dc:creator`, `dc:date`
- End-to-end integration test hitting a real ChromaDB `PersistentClient`

---

## [0.6.3] — 2026-03-18

### Added
- `ingest_many(paths)` — ingest an explicit list of files instead of scanning a directory; accepts `str` or `pathlib.Path`; skipped files recorded in `result.skipped_reasons`
- `ingest_sqlite()` `on_progress` callback — same `Callable[[IngestProgress], None]` pattern as `ingest()`
- `query --format json` CLI flag — emits raw JSON for scripting and piping; conflicts with `--ai` (caught early)
- `ingest-sqlite` CLI gains `--columns`, `--id-column`, `--row-template` flags matching the Python API
- `--min-chunk-size` CLI flag on `ingest` and `ingest-sqlite` commands
- `query()` validates `n_results >= 1` at the API level (was only guarded by the CLI)

### Changed
- Test suite consolidated from 10 files → 6 component-based files (166 tests total)
- `examples/` folder removed — usage covered by README and inline docstrings
- README simplified from ~440 lines to ~185 lines

---

## [0.6.1] — 2025

### Added
- `IngestResult.skipped_reasons` — human-readable list of why each file was skipped
- `PurgeResult` — typed return from `purge()` with `chunks_deleted` and `chunks_checked`
- `reset(confirm=True)` guard — API raises `ValueError` unless `confirm=True` is passed explicitly
- Embedding model mismatch detection — warns when the model passed to `ingest()` differs from the one stored in collection metadata

---

## [0.6.0] — 2025

### Added
- Streaming ingest — large files (`.txt` `.md` `.csv` `.jsonl`) are paged through the chunker without loading the full file into memory (`streaming_threshold` param, default 50 MB)
- `on_progress` callback on `ingest()` — `Callable[[IngestProgress], None]` for tqdm / custom UIs
- `IngestProgress` model — `filename`, `files_done`, `files_total`, `status`, `chunks_stored`
- Multi-collection query — `query(collection_names=[...])` merges results from multiple collections ranked by score
- Metadata filtering — `query(where={...})` passes a ChromaDB `where` filter

---

## [0.5.5] — 2025

### Added
- Typed public API — `IngestResult`, `QueryResult` (TypedDict), `SynapseError` exception hierarchy
- `CollectionNotFoundError`, `SourceNotFoundError`, `TableNotFoundError` — all also inherit from matching Python built-ins

---

## [0.5.1] — 2025

### Added
- `--ai` CLI flag — AI-synthesized answer using Anthropic, OpenAI, or Ollama (auto-detected from env vars)
- `--provider` and `--model` overrides for `synapse query`

---

## [0.5.0] — 2025

### Added
- CLI — `synapse ingest`, `query`, `sources`, `purge`, `reset`
- 12 file formats: `txt` `md` `csv` `pdf` `docx` `json` `jsonl` `html` `pptx` `xlsx` `epub` `odt`
- Document metadata extraction — title, author, created date (PDF / DOCX / HTML / PPTX)

---

## [0.4.0] — 2025

### Added
- Incremental ingest — SHA-256 hash check, skip unchanged files on re-runs
- Sentence-aware chunking (NLTK) via `chunking="sentence"`

---

## [0.3.0] — 2025

### Changed
- Replaced all `print()` calls with structured logging via `synapse_core.logger`
- Added `setup_logging()` public helper

---

## [0.2.0] — 2025

### Added
- `query()` added to public API with ranked results and score normalization

---

## [0.1.0] — 2025

### Added
- Initial release — `ingest()` scans a directory, chunks text, stores embeddings in ChromaDB
- `ingest_sqlite()` — embed SQLite table rows alongside files in the same collection
- `purge()` — remove chunks whose source no longer exists on disk
- `reset()` — wipe an entire collection
- `sources()` — list all indexed source paths
