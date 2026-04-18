# Remex v1.0 Release Preparation — Design

## Goal

Ship a clean v1.0: bumped version numbers, automated PyPI publishing, polished QueryPane empty states, a screenshot gallery in the README, and updated studio build docs.

## Architecture

Five independent tasks in a single plan. No shared state or cross-task dependencies — each can be read and implemented in isolation.

---

## 1. Version Bump

Bump all package version fields from pre-release to `1.0.0`.

**Files to change:**
- `pyproject.toml`: `version = "0.2.0"` → `version = "1.0.0"`
- `studio/package.json`: `"version": "0.1.0"` → `"version": "1.0.0"`
- `studio/src-tauri/tauri.conf.json`: `"version": "0.1.0"` → `"version": "1.0.0"`
- `studio/src-tauri/Cargo.toml`: `version = "0.1.0"` → `version = "1.0.0"`

The Tauri release workflow reads the version from `tauri.conf.json`; `Cargo.toml` must match or `cargo build` will warn. One commit.

---

## 2. PyPI Trusted Publisher Workflow

New file `.github/workflows/publish.yml`. Triggers on `push: tags: ["v*"]` — same trigger as `release.yml`.

**Steps:**
1. `actions/checkout@v4`
2. `actions/setup-python@v5` with Python 3.12
3. `astral-sh/setup-uv@v4`
4. `uv sync` (installs build deps)
5. `uv build` (produces `dist/`)
6. `pypa/gh-action-pypi-publish@release/v1` — uses OIDC trusted publisher, no stored secrets

**Permissions block** (required for OIDC):
```yaml
permissions:
  id-token: write
```

**One-time manual step** (not automated): on pypi.org → Account Settings → Publishing → Add a new pending publisher:
- Owner: `adm-crow`
- Repository: `remex`
- Workflow: `publish.yml`
- Environment: (leave blank)

**README change:** remove the `[![PyPI](…)]` badge added in the v1.0 README rewrite — the package is not yet on PyPI. It goes back after the first successful publish.

---

## 3. QueryPane Empty States

Two conditional rendering states added to `QueryPane.tsx`. No new component files.

### State 1 — No project open

**Condition:** `!currentDb`

Renders a full-pane centered block (replacing the normal query UI):

```
[FolderOpen icon — w-10 h-10 text-muted-foreground]
No project open
Open a database folder to start searching.
[Button: "Open project" → calls setCurrentDb(null) to re-trigger project picker]
```

### State 2 — Zero results

**Condition:** `submitted && !isLoading && !queryError && results.length === 0`

Renders a centered block inside the results area (below the query input, which stays visible):

```
[SearchX icon — w-8 h-8 text-muted-foreground]
No results for "«submitted query»"
Try broader terms or a different collection.
```

**Testing:** Two new tests in `QueryPane.test.tsx`:
- Renders "No project open" state when `currentDb` is null
- Renders "No results" state when query returns empty array

---

## 4. README Screenshot Gallery

Below the existing hero image (`remex_studio.png`), add an HTML table with 4 screenshots in a 2×2 grid. Each cell: image linked to its file, italic caption beneath.

**Screenshots used (in order):**
1. `remex_query.png` — "Semantic search"
2. `remex_ai_answer.png` — "AI answer"
3. `remex_ingest.png` — "File ingestion"
4. `remex_collection.png` — "Collections manager"

Each image: `width="360"`, wrapped in an `<a href="...">` pointing to the same file. Table has no border (`<table>`), two `<td>` per row, `align="center"` on each cell.

---

## 5. studio/README.md — Prerequisites Section

Add a **Prerequisites** section immediately before the existing **Development** section:

```markdown
## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) stable (required to build the native app)
- Python with `remex[api]` installed — needed in development so the sidecar is available:
  ```bash
  pip install remex[api]
  ```
  In production builds, Remex Studio spawns the sidecar automatically.
```

No other changes to `studio/README.md`.

---

## Testing Summary

| Task | Test approach |
|------|--------------|
| Version bump | `cargo check` in CI catches Cargo.toml mismatches |
| PyPI workflow | Verified by first real `v1.0.0` tag push |
| Empty states | 2 new Vitest tests in `QueryPane.test.tsx` |
| README gallery | Visual check on GitHub after push |
| studio README | No automated test — visual review |
