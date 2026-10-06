# Changelog

All notable changes to `remex` are documented here.

---

## [Unreleased]

### Added
- `remex ingest-sqlite --sql "SELECT …"` (custom query / JOIN mode, as in
  Studio) and `--incremental`; `--table` is no longer required (exactly one of
  `--table` / `--sql`).

### Changed
- Default Anthropic model is now `claude-sonnet-5-5` (was `claude-sonnet-4-5`).
  Answers get a 16,000-token budget (current models think by default and
  thinking shares `max_tokens` with the reply), and safety refusals are
  reported as such instead of "response contained no text block".
- Studio: `npm audit fix` within existing semver ranges (20 of 27 advisories).

### Fixed
- **Renamed collections became unqueryable** — rename copied rows into a
  collection created without remex's embedding function, so ChromaDB persisted
  its `default` EF config and every later query/ingest failed with an EF
  conflict (shown as "collection not found"). Rename is now an in-place
  `modify(name=…)` (no copy, no 10,000-chunk limit), and collections already
  broken by an older rename are rebuilt automatically on first use.
- **CLI printed nothing** — `remex ingest` / `purge` / `reset` log through
  `remex.core`, which lost its default handler in 1.5.0; the CLI now installs one.
- **Watched SQLite databases re-ingested forever** — reading a WAL-mode DB
  creates/deletes its `-wal`/`-shm` siblings, so remex's own ingest re-triggered
  the watcher. Changes now count only when the DB's content fingerprint moves.
- **Watched folders could loop / overlap** — Chroma's own writes no longer
  trigger auto-ingest when the project DB sits inside a watched folder, and
  bursts of events coalesce into one follow-up run instead of parallel ingests.
- **Stale chunks after re-ingest** — non-incremental re-ingest of a file that
  shrank left its trailing chunks behind, and the same file ingested via two
  different source roots was stored twice.
- **Cancelled ingests lost files already reported as ingested** — the pending
  batch is now flushed before the cancellation propagates.
- **Model-download timeout could abort a running ingest** — the SSE poller now
  stops as soon as the ingest reports progress.
- `save_config` wrote invalid TOML for Windows paths (unescaped backslashes),
  which `load_config` then silently discarded.
- `remex ingest-sqlite` rejected `chunking = "recursive"` from `remex.toml`;
  its defaults (and `ingest_many` / `ingest_async` / `ingest_sqlite`) now match
  `ingest()` — 768 / 150 / recursive.
- `remex query --provider custom` is no longer offered (it cannot work without
  Studio's base URL / auth header settings).
- Sidecar crash message no longer comes back empty when the log contains
  non-UTF-8 bytes.

### Security
- When bound to loopback, the API sidecar now rejects requests whose `Host`
  header is not `127.0.0.1` / `localhost` (DNS-rebinding protection). Override
  with `REMEX_ALLOWED_HOSTS`.

---

## [2.0.0] — 2026-05-26

> **Remex is now fully free, fully open-source, and locally-managed by default.**
> The 1.x line shipped a Pro tier with paid feature flags and an opaque license
> system. 2.0 removes that entirely: every feature ships in the box, the
> licensing scaffolding is gone, and the codebase has been re-audited end-to-end.

### Added
- **OS keyring storage for API keys** — built-in and custom-provider keys are now
  persisted in Windows Credential Manager / macOS Keychain / libsecret via the
  `keyring` crate. Set once, kept across launches. New Rust commands
  `keyring_get` / `keyring_set` / `keyring_delete`, TS wrapper
  `studio/src/lib/secrets.ts`, write-through setters in the Zustand store, and
  a `hydrateApiKeys()` action that runs on AppShell mount.
- **SQL-query mode for SQLite ingest** — the SQLite tab gains a Source toggle:
  pick a single table (existing) or paste an arbitrary `SELECT` / `WITH`
  statement. Enables multi-table JOINs (e.g. enrich an `albums` row with the
  artist's name from `artists`), computed columns, and union queries. The
  same mode is available in Settings → Auto-ingest so watched databases can
  re-ingest a JOIN incrementally.
- **Low-confidence answer banner** — when no result hits
  `score >= HIGH_CONFIDENCE_THRESHOLD` (`0.70`), the Query pane shows an amber
  "No clear match — showing the closest results (best score X)" hint above the
  results. Search still returns whatever passed `min_score`.
- **Per-project Query defaults** — `nResults` and `minScore` are now stored
  per-project alongside the existing chunk/overlap/mode/embedding defaults.
  Switching projects re-seeds the Query gear popover; changes there persist
  back to the project store.
- **Settings re-organised into 5 tabs** — `General`, `Personalization`,
  `AI & Server`, `Auto-ingest`, `References`. AI Manage is a sub-picker
  (Personas · Custom providers · Embedding presets) so only one editor is
  visible at a time. Status header per tab summarises the configured state.
- **Vertical tab rail** in Settings replaces the top tab bar, footer collapses
  to a single `⋯` overflow menu (Welcome guide, Shortcuts, Report a bug,
  Updates).
- **Sources pane** — collection action buttons fold into a `⋮` dropdown menu;
  stats render as a single dot-separated line for density.
- **Query pane** — merged history + collection chip row, Source filter and
  search options live in popovers (`Sources [N]` and `⚙ {N}`), 2-column
  results grid on wide screens.
- **Brand assets** — three provider logos (`/claude.svg`, `/openai.svg`,
  `/ollama.svg`) shipped in `studio/public/` and used wherever providers are
  surfaced.
- **`SoftAlert`, `SegmentedControl`, `Popover`, `DropdownMenu`** UI primitives
  extracted to `studio/src/components/ui/`.
- **Tagline**: "Stop searching. Start asking. — Local-first AI for the
  documents you already have."

### Changed
- **Remex is fully free.** The Pro tier, license-key checking, and all paid
  feature flags are removed. Every previously paid feature ships enabled.
- **Tagline + homepage cards** updated — the homepage feature pills now lead
  with `Ingest · Search · AI Answer · Private` (replacing the previous
  Collections card with the privacy-positioning Private card).
- **README rewritten** with a Privacy & data flow section that makes the
  local-first vs AI-call boundary explicit, plus an architecture diagram and
  updated screenshots.
- **`__version__` reads from package metadata** instead of being a hard-coded
  string that could drift from `pyproject.toml`.

### Fixed
- **Non-streaming `/ingest/sqlite` route now forwards `sql_query`** — previously
  it called `ingest_sqlite()` without passing it, so any non-streaming SQL-mode
  request errored at the validator. Only the `/stream` variant worked.
- **`spawn_sidecar` arg mismatch** — the SetupScreen sent an unknown `extras`
  argument that the Rust handler didn't accept; extras now go through the
  existing `install_extras` post-spawn path only.
- **Settings → AI Agent form fields now re-sync** when `apiUrl` or `setupExtras`
  change externally (matching the existing `aiModel`/`aiApiKey` behaviour).
- **`useChat` / `useMultiChat` cache keys** include `base_url` / `header_name` /
  `header_prefix` so switching between custom providers with the same model
  name no longer returns the previous provider's cached answer.
- **`RenameCollectionDialog` resets** on `open` / `currentName` change so
  renaming a different collection doesn't show the previous name.
- **Watch-DB wizard** now captures `idColumn` / `columns` / `rowTemplate`; the
  AppShell auto-ingest handler reads them so an automated re-ingest matches
  what was originally configured.
- **Source filter scoped to single-collection queries** — applying a
  per-collection source filter across a multi-collection query was silently
  zero-ing out the other collections. The Sources popover is hidden in
  multi-collection mode.
- **Settings footer kept blocking the main thread** on `kill_sidecar`; now
  runs `kill()+wait()` on a `spawn_blocking` thread.
- **Incremental SQLite N+1** — prefetch chunk-0 metadata once instead of
  per-row `collection.get`; large incremental re-ingests are now O(1) per
  unchanged row.
- **`SELECT COUNT(*)` SQL wrapper** uses a subquery-with-alias form so
  user-supplied queries ending with `ORDER BY`/`LIMIT` or starting with
  `WITH` are wrapped portably.
- **`n_chunks` int coercion guard** — pre-2.0 chunks missing this field no
  longer throw on incremental re-ingest; falls back to `1` and runs the
  orphan-cleanup path.
- **`_unhandled_exception_handler` passes `HTTPException` through** to
  FastAPI's normal 4xx handler instead of masking validation errors as 500.
- **PDF extractor closes its file handle** deterministically via `with open()`
  so subsequent purge/rename operations don't hit `WinError 32` on Windows.
- **AI provider exceptions preserve status codes** — `APIStatusError` from
  Anthropic / OpenAI is now caught separately and the upstream status code
  (401, 429, …) is included in the message.
- **Sidecar stdout** is now redirected to the log file alongside stderr —
  prevents OS pipe-buffer fill from blocking the Python interpreter under
  chatty logging.
- **`watch:db:changed` event payload** uses `db_path` (snake_case) to match
  `watch:changed`'s `folder`/`paths` and the rest of the wire format.

### Removed
- **Pro tier and license-key infrastructure** — `SynapseError` remains as a
  backward-compat alias for users who pinned to the old name.
- **`warmup(model_name)`** — unused helper; `warmup_collections` is the public
  surface.
- **Dead `IngestProgressEvent` Pydantic class** — the SSE emitter hand-rolls
  the dict; the unused schema would have silently drifted.
- **Dead `setup://done` Tauri event** — never had a listener on the frontend.

### Security
- **API keys never persist to plaintext localStorage.** Both the built-in
  `aiApiKey` and the custom-provider key map are stored in the OS keyring,
  with the in-memory store acting as a session cache only.
- **`db_path` validators unified** between the Pydantic Request bodies and
  the query-string handler — the `"./remex_db"` sentinel is accepted by both
  paths (previously a `GET` rejected what a `POST` body would accept).

---

## [1.5.3] — 2026-05-21

### Changed
- **Setup screen now streams uv's output live.** The Rust `run_uv` was
  blocking on the full process output before emitting any log events, so the
  first-install setup screen sat at "Installing remex-cli…" with no visible
  progress for the entire 5-15 minutes it took to download + extract the
  ~400 MB of wheels (chromadb, onnxruntime, fastembed, …) — looking hung.
  uv's stdout and stderr are now drained concurrently in tokio tasks, and
  every line is forwarded to the SetupScreen as a `setup://log` event the
  moment it's written. The screen renders a scrolling tail of the last 12
  lines under the progress bar so users can see "Downloading numpy
  (15.6 MiB)…", "Installed 47 packages in 1m 23s", etc.

---

## [1.5.2] — 2026-05-20

### Added
- **Custom AI providers** — Settings → AI → Custom providers card. Configure
  any OpenAI-Chat-Completions-compatible endpoint (corporate AI gateway,
  Azure OpenAI, LiteLLM proxy, vLLM, …) with a name, base URL and API key,
  plus optional auth-header customisation for non-`Authorization: Bearer`
  schemes. A **Test connection** button probes `{base_url}/models` via the
  Python sidecar (so corporate CA bundles and proxies apply), lists the
  discovered models inline, and auto-fills the default model. The provider
  is selectable from the main AI provider dropdown alongside Anthropic /
  OpenAI / Ollama; the QueryPane chat call forwards the full config.
- **`POST /system/test-custom-provider`** sidecar route + supporting
  `list_custom_provider_models()` helper in `remex.core.ai`.

### Security
- Custom-provider API keys are kept **in memory only** — never written to
  disk, re-entered each session. Matches the existing `aiApiKey` policy.

---

## [1.5.1] — 2026-05-20

### Added
- **Recursive chunking mode** — new separator-aware chunking (`\n\n` → `\n` → `". "` → `" "`).
  Now the default for all new ingests; the existing `"word"` and `"sentence"`
  modes still work. *Selecting "Recursive" in 1.5.0 would 422 because the
  PyPI schema didn't include it — this release ships the schema fix.*
- **Watch databases** — new card in Settings → Auto-ingest that re-ingests
  SQLite rows whenever the watched `.sqlite` file (or its `-wal`/`-shm`/`-journal`
  siblings) changes. Mirrors the existing watch-folder workflow.
- **AI personas** — save multiple named system prompts (Researcher, Code Q&A,
  Summariser, …) and switch from a dropdown in the Query pane. Replaces the
  single global system prompt.
- **Per-project defaults** — chunk size, overlap, mode and default embedding
  model can be saved per project; new collections pre-fill from them.
- **Custom embedding-model presets** — add your own model entries that show
  up alongside Light / Balanced / Multilingual in the picker.

### Changed
- **Remex is now fully free.** The Pro tier has been discontinued and every
  previously paid feature (large embedding models, advanced exports,
  watch-folder auto-ingest, searchable query history, extra themes) ships
  enabled in the box for everyone. Existing Pro licenses are no longer
  required or checked.
- **Ingest pane redesign** — two-column layout (Configure left · Run & Monitor
  right) with a sticky action bar. Embedding model picker hides for existing
  collections (the model is locked by ChromaDB) and slides into Advanced for
  new ones. Mode / chunk size / overlap are now on one line.
- **Settings → Auto-ingest** is a dedicated tab housing both Watch folder and
  Watch database cards, each entry targets a specific collection (the old
  "use current collection" fallback is gone).
- **Sidebar** — Settings promoted to a bottom row next to Home; the
  Welcome guide / Shortcuts / Report-a-bug / Check-for-updates actions live
  in the Settings sticky footer.
- **Brand colours** updated to the Settings Indigo → Teal gradient
  (`#324A83 → #00A586`); all icons (ICO, ICNS, Windows tile, iOS, Android,
  desktop PNGs) regenerated.
- **Defaults**: `chunk_size 768`, `overlap 150`, `chunking "recursive"`.

### Fixed
- Pydantic 422 error bodies were rendered as `[object Object]` in the
  frontend; now a shared formatter unwraps the `detail` array and shows
  `field: message` strings.
- Sidecar process is now bound to a Windows Job Object so a force-kill of
  Remex Studio (Task Manager, crash, OS shutdown) terminates the Python
  child instead of orphaning it on port 8000.
- Sidecar startup waits on `/health` instead of a blind 1500 ms sleep —
  faster on the happy path, surfaces real errors instead of a generic
  "Sidecar started but is not responding".
- `reqwest` switched from Schannel (`native-tls`) to `rustls-tls-native-roots`
  so corporate CA bundles (`SSL_CERT_FILE`, `REQUESTS_CA_BUNDLE`) work for
  Rust HTTP calls too — was already working for the Python sidecar.
- Several dead/duplicated code paths and stale tests cleaned up; details in
  the diff.

### Removed
- License activation, validation, and deactivation flows (both UI and the
  Lemon Squeezy backend integration).
- Settings → License tab. Watch folders + databases live in the new
  Auto-ingest tab.
- `UpgradeModal`, `LicenseCard`, `ProBadge` components.
- The `license` slice from the persisted Zustand store.
- Rust `license` module (`license/api.rs`, `license/constants.rs`,
  `license.rs`) and the `wiremock` / `thiserror` dependencies that backed it.

---

## [1.5.0] — 2026-05-08

### ⚠ Breaking change — re-ingest required

The embedding backend has changed from SentenceTransformers (PyTorch) to
ONNX Runtime. Existing collections produce incorrect or empty results until
re-ingested. Delete your collection and run ingest again with the same
source directory.

### Changed

- **Embedding backend replaced:** SentenceTransformers + PyTorch →
  ONNX Runtime. Venv install size drops from ~2 GB to ~300 MB and
  install time is significantly faster.
- **Default model downloads from Chroma S3** (`all-MiniLM-L6-v2`) instead of
  HuggingFace CDN — works on corporate networks that block `huggingface.co`
  under "Generative AI and ML Applications" categories.
- **Default model bundled in installer** — first ingest needs no internet
  connection for the default model.
- **HTTP_PROXY / HTTPS_PROXY / NO_PROXY** env vars are now forwarded to the
  sidecar process — supports corporate proxy environments.
- **Updated model presets:** replaced `intfloat/e5-base-v2` and `intfloat/e5-large-v2`
  (not supported by FastEmbed) with `BAAI/bge-base-en-v1.5` and
  `nomic-ai/nomic-embed-text-v1.5-Q`.

---

## [1.4.1] — 2026-05-05

### Fixed
- **Setup re-ran on every launch** — `EXPECTED_VERSION` was still `1.3.0` after the v1.4.0 Python package bump, causing a full reinstall loop on each app start
- **Installer now explicitly per-user** — NSIS `installMode` set to `currentUser`; installs to `%LOCALAPPDATA%`, no UAC prompt, uninstaller registered under `HKCU` — works on standard (non-admin) Windows accounts

---

## [1.4.0] — 2026-05-01

### Added
- **First-launch bootstrapper** — Studio now auto-installs `remex-cli[api]` on first run; no manual `pip install` step required.
  - `uv.exe` is bundled inside the installer; a self-contained Python 3.11 virtual environment is created in `%APPDATA%\Remex Studio\venv\` on first launch.
  - A full-screen setup UI shows a progress bar and step label while the install runs (~30 s on a typical connection). Requires an internet connection once.
  - Subsequent launches hit a fast path (~1 ms version check) and show no setup screen.
  - If setup fails (no network, disk error) an error screen is shown with a **Retry** button.
  - The sidecar is now launched from the venv's full path instead of relying on `PATH`, fixing the "Could not start remex serve" error when Studio is opened from the Start Menu or taskbar.
- **Embedding model warmup** — Studio pre-loads all embedding models used across collections in the background the moment the sidecar connects. First query after launch no longer waits for model initialisation. Returns HTTP 202 immediately; loading happens asynchronously.
- **`OLLAMA_HOST` support** — Ollama provider now reads the standard `OLLAMA_HOST` environment variable for custom host/port, matching the Ollama ecosystem convention.

### Changed
- **Setup screen no longer shows install logs** during normal progress — logs are retained and shown only on the error screen to aid diagnosis. Reduces visual noise during a routine first-time install.

### Fixed
- **Progress bar disappeared on first-time install** — `setSetupExtras` was called before `invoke("spawn_sidecar")`, causing the `useSidecar` effect to re-run and race `check_needs_setup` against the `setup://started` event. Fixed by moving the call after the invoke completes.
- **Watch-folder auto-ingest did not remove deleted-file chunks** — a `POST /purge` call is now issued after each successful auto-ingest, keeping the collection in sync when files are deleted from a watched directory.
- **`uv.exe` setup process spawns hidden** — the bundled installer runs with `CREATE_NO_WINDOW` on Windows so no terminal flashes during first-launch setup.

### Security / Correctness
- **Host injection prevented** — `spawn_sidecar` and `check_sidecar_health` now reject any host that is not a loopback address (`127.0.0.1`, `::1`, `localhost`).
- **Extras injection prevented** — extras passed to `spawn_sidecar` are validated against an allowlist before being used as pip specifiers.
- **`SpawningGuard` RAII struct** — `spawning` `AtomicBool` is now reset via a drop guard, guaranteeing cleanup even if `do_spawn` panics.
- **Double-check locking race fixed** — `_get_client` in `pipeline.py` always acquires the lock before reading the cache, eliminating a data race under concurrent requests.
- **SSE background task leak fixed** — `asyncio.create_task` for both the run and disconnect-monitor tasks is now created inside the `_stream()` generator, preventing leaked tasks when the ASGI layer raises before iteration begins.
- **`row_template` length capped** — API schema now enforces a 4 096-character limit.

---

## [1.3.1] — 2026-04-29

### Fixed
- **Python console window visible on launch** — `remex serve` now spawns hidden on Windows using `CREATE_NO_WINDOW`, so no terminal window appears when Studio starts the sidecar.

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
