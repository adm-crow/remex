# Changelog

All notable changes to `remex` are documented here.

---

## [Unreleased]

---

## [1.3.1] — 2026-04-29

### Added
- **First-launch bootstrapper** — Studio now auto-installs `remex-cli[api]` on first run; no manual `pip install` step required.
  - `uv.exe` is bundled inside the installer; a self-contained Python 3.11 virtual environment is created in `%APPDATA%\Remex Studio\venv\` on first launch.
  - A full-screen setup UI shows a progress bar and step label while the install runs (~30 s on a typical connection). Requires an internet connection once.
  - Subsequent launches hit a fast path (~1 ms version check) and show no setup screen.
  - If setup fails (no network, disk error) an error screen is shown with a **Retry** button.
  - The sidecar is now launched from the venv's full path instead of relying on `PATH`, fixing the "Could not start remex serve" error when Studio is opened from the Start Menu or taskbar.

### Fixed
- **Python console window visible on launch** — `remex serve` (and the bundled `uv.exe` during setup) now spawns hidden on Windows using `CREATE_NO_WINDOW`, so no terminal window appears.

---

## [1.3.0] — 2026-04-22

### Added
- **Remex Pro** — commercial tier, 29€, one-time purchase
  - Pro embedding models: `bge-large-en-v1.5`, `e5-large-v2`, `nomic-embed-text-v1.5`
  - Advanced exports: BibTeX, RIS, CSL-JSON, Obsidian vault
  - Watch-folder auto-ingest
  - Unlimited searchable query history (free tier capped at 20)
  - Eight extra accent themes + Pro badge in-app
  - Priority email support (`support@getremex.com`, 48-hour business-day SLA)
- Lemon Squeezy-backed license activation (`Settings → License`)
- **Dark mode "Follow system"** — new toggle in Settings that tracks the OS theme automatically
- **Chunk viewer modal** — expand any result card to read the full chunk text; navigate with arrow keys or buttons
- **Source filter in Query pane** — collapsible chip strip lets you narrow results to one or more source documents before searching; works for both vector search and AI Answer
- **Bulk source delete** — select multiple sources with checkboxes and delete in one step; partial failures shown inline
- **Collection description** — add a short note to any collection via the pencil icon; shown in the stats row
- **Re-ingest button** — every collection card gains a one-click re-ingest button once parameters have been saved; navigates to the Ingest tab with all fields pre-filled
- **Ingest parameters saved per collection** — chunk size, overlap, embedding model, and source path are persisted after each successful ingest and restored on re-ingest
- **Query history filter** (Pro) — search across saved queries when history exceeds 20 entries
- **Multi-collection AI Answer** — select multiple collection pills to generate a single AI-synthesised answer across them, with merged sources ranked by score
- **AI Answer export** — copy or save the AI answer + source list as Markdown
- **SQLite incremental mode** — `--incremental` flag for `ingest-sqlite` skips unchanged rows by row hash
- **Embedding model presets redesigned** — single-column list showing tag, full model name, and relative CPU speed; new "Balanced" preset (`intfloat/e5-base-v2`)
- **Advanced settings section** — chunk size, overlap, and incremental toggle consolidated on one row; separator line and tinted background card clearly scope the section

### Changed
- **Studio license** — `studio/` subtree relicensed to FSL-1.1-MIT starting this release.
  Pre-1.3.0 releases remain Apache-2.0 forever. See [`LICENSES.md`](LICENSES.md).
- Python CLI and library (`remex-cli` on PyPI) remain **Apache-2.0 indefinitely** — no change.
- `db_path` validated as an absolute path on all five API request schemas (was only enforced in route handlers)

### Performance
- Embedding batch size raised from 32 → 128 via a `_RemexEmbeddingFunction` subclass that overrides `__call__`; lets `sentence_transformers` sort by sequence length before encoding — ~15% fewer FLOPs for variable-length text
- Cross-file ChromaDB upsert batch limit raised from 256 → 2 048 chunks, reducing round-trips on large ingests

### Fixed
- **AI Answer ignored source filter** — `where`, `n_results`, and `min_score` were missing from the `useChat` / `useMultiChat` React Query cache keys; changing the filter returned the cached result instead of re-fetching
- **Progress counter "7 of 6"** — off-by-one: `files_done` is 1-based from the backend but the UI was adding an extra `+1`
- **"Processing file N of N…" persisted after all files done** — spinner now shows "Storing embeddings…" while the final batch flush + embed is in progress
- **Unhandled error responses leaked internal detail** — exception handler in `main.py` now logs full stack server-side and returns a generic `"An internal error occurred."` to the client
- **Sentinel collection name collision** — rename sentinel is now an MD5-based name (`remextmp.<8hex>`) instead of a prefix, preventing collisions between collections that share a long common prefix
- **`lastIngestParamsMap` lost on collection rename** — re-ingest params now migrated from old to new name in the rename `onSuccess` handler
- **Bulk delete "Deleting…" button state unreliable** — replaced `deleteMutation.isPending` (flips per-item) with a local `isBulkDeleting` flag for the duration of the whole loop
- **Obsidian vault export broken on Windows** — extension detection used `path.split(".").pop()` which returns the last path segment for folder paths with no dot; replaced with last-segment `lastIndexOf(".")` logic
- **Streaming `fetch()` no network-error handling** — `ingestFilesStream` and `ingestSqliteStream` now wrap `fetch()` in try/catch and surface a human-readable connection error
- **`purge` route fetched collection metadata twice** — simplified to a single pass using `raise_if_missing=True`
- **`ChunkViewerModal` had no keyboard navigation** — `ArrowLeft` / `ArrowRight` key events now move between chunks while the modal is open
- **Query state not cleared on project switch** — `text` and `submitted` are now reset when `currentDb` changes, preventing stale queries from a previous project from executing
- **`UpgradeModal` crashed when `open()` returned `undefined` in tests** — switched to optional chaining `?.catch()`

---

## [1.2.1] — 2026-04-19

### Changed
- Settings pane: moved "Keyboard shortcuts" and "Report a bug / Request a feature" into their own card under AI Agent on the right column

### Removed
- Unused shadcn UI components (`card.tsx`, `separator.tsx`, `textarea.tsx`) that had zero imports
- Historical planning/design docs under `docs/superpowers/` — features they describe already shipped

---

## [1.2.0] — 2026-04-19

### Added
- Keyboard shortcuts cheat sheet modal (`?` key)
- "Report a bug / Request a feature" link in Settings pane (opens GitHub issues)
- CI: Rust/Clippy/test job + GitHub Releases workflow via `tauri-action`
- PyPI publish workflow via OIDC Trusted Publisher (skips already-published versions on re-runs)

### Changed
- Package renamed on PyPI from `remex` to `remex-cli` (import path still `remex`)
- Unified version across Python, Tauri, npm, and Cargo manifests at 1.2.0

### Fixed
- Sidecar error message in Studio references the correct `remex-cli[api]` package name
- `pyproject.toml` self-extras (`studio`, `all`) use the renamed `remex-cli` distribution
- `remex.core.__version__` synced to the released version (was stuck at 0.2.0 and exposed by `/health` and `/info` endpoints)

---

## [0.4.0] — 2026-04-18

### Added — Studio v1.0

**Query pane**
- Multi-collection AI Answer via `POST /collections/multi-chat` — queries all selected collections, merges results by score, generates a single AI-synthesised answer
- Filter results by source document — collapsible chip strip, passes `where` filter to ChromaDB
- Export results to JSON, CSV, or Markdown via native save dialog
- Collection pills show chunk count + embedding model in tooltip
- Empty states for no-project / no-collections / no-results scenarios

**Ingest pane**
- Stop button cancels in-progress ingest stream (FilesTab + SQLiteTab)
- Incremental mode toggle in Advanced settings (skip unchanged files by SHA-256 hash)
- Skipped-file reasons persisted in last-ingest result and shown in post-ingest toast

**Collections pane**
- Collection rename — `PATCH /collections/{name}/rename` + inline rename dialog with pencil button

**Settings pane**
- App version display (reads from Tauri `getVersion()`)

**Shell / UX**
- First-run onboarding modal (persisted `onboardingDone` flag, never shown again)
- Per-theme background tints + dot-grid pattern follows active theme
- Animated dot-grid homepage replaces aurora mesh

### Fixed
- API key removed from React Query cache keys (security)
- CSP hardened: `unsafe-inline` removed, `connect-src` narrowed to sidecar port only
- SQLite path validation: rejects relative paths and non-existent files before opening
- `write_text_file` Tauri command validates path extension
- Abort race condition in SSE `done` event (FilesTab + SQLiteTab)
- Keyboard shortcut `e.key` case-insensitive matching across platforms
- Duplicate collection name prevention in CollectionSwitcher
- Rename endpoint uses `.upsert()` for idempotency
- Generic `except Exception` catches narrowed to specific types in pipeline

### Performance
- Embedding batch size raised from 64 → 256

---

## [0.3.0] — 2026-04-12

### Added
- **Remex Studio** — native desktop app (Tauri v2 + React 19 + TypeScript)
  - Visual ingest with live progress, streaming SSE, and embedding model picker
  - Query panel with semantic search, min-score filter, and AI Answer (markdown rendered)
  - Collections panel — stats, sources list, delete source, purge, reset
  - Settings panel — API server URL, dark mode, accent colour, AI provider/model/key
  - Automatic sidecar management — spawns `remex serve` on startup, restarts on URL change
- **API additions for Studio** — `api_key` field on `/chat` endpoint forwarded to AI providers; catch-all exception handler ensures CORS headers on all error responses; `detect_provider()` runs off the async event loop to avoid blocking
- **`remex serve --host / --port`** — explicit bind address flags, used by the Studio sidecar

---

## [0.2.0] — 2026-04-09

### Changed
- **Package renamed** from `synapse-core` to `remex`. Import path: `from remex import ingest, query` (was `from synapse_core import ...`)
- Unified CLI entry point: `remex` command replaces `synapse` (all subcommands unchanged)
- `remex.toml` / `[remex]` section replaces `synapse.toml` / `[synapse]` for project config
- Default ChromaDB path changed from `./synapse_db` to `./remex_db`
- Default collection name changed from `synapse` to `remex`
- Base exception renamed from `SynapseError` to `RemexError` (`SynapseError` kept as a backward-compat alias)
- `remex.api` FastAPI sidecar added — start with `remex serve` (requires `remex[api]`)
- Top-level `remex` package now re-exports the full public API (previously only `remex.core`)

---

## [1.1.1] — 2026-03-24

### Added
- `save_config(settings, root)` — writes a `[synapse]` section to `synapse.toml`; preserves other sections; exported from top-level namespace
- `load_config()` exported from top-level namespace (previously only used internally by the CLI)
- `detect_provider()`, `generate_answer()`, `PROVIDERS`, `DEFAULT_MODELS` exported from top-level namespace (previously only accessible via `synapse_core.ai`)
- `SUPPORTED_EXTENSIONS` frozenset and `is_supported()` exported from top-level namespace (previously only accessible via `synapse_core.extractors`)

---

## [1.1.0] — 2026-03-24

### Added
- `list_collections(db_path)` — returns all collection names in a ChromaDB directory; exposed in CLI as `synapse list-collections`
- `collection_stats(db_path, collection_name)` — returns a `CollectionStats` dataclass with `total_chunks`, `total_sources`, and `embedding_model`; CLI: `synapse stats`
- `delete_source(source, db_path, collection_name)` — explicitly removes all chunks for a given source (file path or SQLite source string); CLI: `synapse delete-source SOURCE [--yes]`
- `query(…, min_score=…)` / `query_async(…, min_score=…)` — optional float 0–1 to filter out low-relevance results; CLI: `synapse query --min-score 0.5`
- `CollectionStats` dataclass exported from the top-level `synapse_core` namespace
- `py.typed` marker — downstream type checkers (Pylance, mypy) now pick up remex's type hints automatically

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
