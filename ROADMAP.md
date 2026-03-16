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
- [x] Document metadata extraction (title, author, created — PDF/DOCX/HTML/PPTX)
- [x] Beta status on PyPI

---

## Must-have — blockers for v1.0

- [x] **Streaming ingest** — large text files (`.txt`, `.md`, `.csv`, `.jsonl`) are now paged through the chunker without loading the entire file into memory (`streaming_threshold` param, default 50 MB). *(v0.6)*
- [x] **Progress callback** — `ingest()` accepts `on_progress: Callable[[IngestProgress], None]` for tqdm / custom UIs. *(v0.6)*
- [x] **Multi-collection query** — `query(collection_names=[...])` queries multiple collections and merges results ranked by score. *(v0.6)*
- [x] **Metadata filtering** — `query(where={...})` passes a ChromaDB `where` filter so callers can restrict results by source type, date range, etc. *(v0.6)*
- [ ] **Async API** — `async def aingest()` / `async def aquery()` for FastAPI / async frameworks.
- [x] **`ingest()` skip reasons** — `IngestResult.skipped_reasons: list[str]` exposes *why* each file was skipped (`"hash_match"`, `"empty"`, `"extract_error: …"`). *(v0.6.1)*

---

## Should-have — important for a mature v1.0

- [x] **Embedding model mismatch detection** — warns when `embedding_model` differs from the model stored in collection metadata (set on first ingest). *(v0.6.1)*
- [x] **`purge()` returns `PurgeResult`** — typed return with `chunks_deleted` and `chunks_checked`, consistent with `IngestResult`. *(v0.6.1)*
- [x] **`reset()` confirmation guard in API** — `confirm: bool = False` parameter; raises `ValueError` unless `confirm=True`. CLI passes `confirm=True` after prompting. *(v0.6.1)*
- [ ] **EPUB / ODT metadata** — `extract_metadata()` only handles PDF/DOCX/HTML/PPTX; EPUB has rich OPF metadata.
- [ ] **`ingest_sqlite` progress callback** — same `on_progress` pattern as `ingest()`.

---

## Nice-to-have — DX polish

- [ ] **`synapse init`** — CLI command to scaffold a new project (`docs/`, `synapse_db/`, `synapse.toml`).
- [ ] **Config file (`synapse.toml`)** — persist per-project defaults (db path, collection, model) so flags are not repeated on every command.
- [ ] **`query --format json`** — CLI option to emit raw JSON for scripting / piping.
- [ ] **Batch ingest API** — `ingest_many(paths: list[Path])` to ingest a specific list of files instead of scanning a directory.
- [ ] **Real integration tests** — at least one end-to-end test that hits a real `PersistentClient` (the ChromaDB `NotFoundError` bug was invisible with mocked tests).
