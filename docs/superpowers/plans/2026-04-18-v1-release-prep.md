# Remex v1.0 Release Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump all packages to 1.0.0, add an automated PyPI publish workflow, add a screenshot gallery to the README, and update the studio build docs with prerequisites.

**Architecture:** Four independent tasks in dependency order — version bump first (other tasks may reference it), then PyPI workflow, then the two docs tasks. No shared state between tasks.

**Tech Stack:** Python/uv, Tauri v2 (Rust), React 19, GitHub Actions, Markdown.

> **Note:** QueryPane empty states (originally Task 3 in the spec) are already fully implemented and tested — dropped from this plan.

---

## File Map

| File | Task | Change |
|------|------|--------|
| `pyproject.toml` | 1 | Bump `version` to `1.0.0` |
| `studio/package.json` | 1 | Bump `version` to `1.0.0` |
| `studio/src-tauri/tauri.conf.json` | 1 | Bump `version` to `1.0.0` |
| `studio/src-tauri/Cargo.toml` | 1 | Bump `version` to `1.0.0` |
| `.github/workflows/publish.yml` | 2 | Create PyPI trusted publisher workflow |
| `README.md` | 2, 3 | Remove PyPI badge (Task 2); add screenshot gallery (Task 3) |
| `studio/README.md` | 4 | Add Prerequisites section |

---

## Task 1: Version Bump

**Files:**
- Modify: `pyproject.toml`
- Modify: `studio/package.json`
- Modify: `studio/src-tauri/tauri.conf.json`
- Modify: `studio/src-tauri/Cargo.toml`

- [ ] **Step 1: Update `pyproject.toml`**

Find the line:
```toml
version = "0.2.0"
```
Replace with:
```toml
version = "1.0.0"
```

- [ ] **Step 2: Update `studio/package.json`**

Find the line:
```json
  "version": "0.1.0",
```
Replace with:
```json
  "version": "1.0.0",
```

- [ ] **Step 3: Update `studio/src-tauri/tauri.conf.json`**

Find the line:
```json
  "version": "0.1.0",
```
Replace with:
```json
  "version": "1.0.0",
```

- [ ] **Step 4: Update `studio/src-tauri/Cargo.toml`**

Find the line:
```toml
version = "0.1.0"
```
Replace with:
```toml
version = "1.0.0"
```

> There is only one `version = "0.1.0"` in `Cargo.toml` (the `[package]` block). Do not change dependency version fields.

- [ ] **Step 5: Verify Rust still compiles**

```bash
cd studio/src-tauri && cargo check
```

Expected: no errors. This confirms `Cargo.toml` and `tauri.conf.json` are in sync.

- [ ] **Step 6: Commit**

```bash
git add pyproject.toml studio/package.json studio/src-tauri/tauri.conf.json studio/src-tauri/Cargo.toml
git commit -m "chore: bump all packages to v1.0.0"
```

---

## Task 2: PyPI Trusted Publisher Workflow

**Files:**
- Create: `.github/workflows/publish.yml`
- Modify: `README.md` (remove premature PyPI badge)

- [ ] **Step 1: Create `.github/workflows/publish.yml`**

```yaml
name: Publish to PyPI

on:
  push:
    tags:
      - "v*"

permissions:
  id-token: write

jobs:
  publish:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install uv
        uses: astral-sh/setup-uv@v4

      - name: Build package
        run: uv build

      - name: Publish to PyPI
        uses: pypa/gh-action-pypi-publish@release/v1
```

The `permissions: id-token: write` block is required for OIDC — it lets the action request a short-lived token from GitHub to authenticate to PyPI without storing a secret.

- [ ] **Step 2: Remove the PyPI badge from `README.md`**

The package is not yet on PyPI, so the badge would show as broken. Find and remove this line from `README.md`:

```markdown
  [![PyPI](https://img.shields.io/pypi/v/remex?style=for-the-badge&logo=python&logoColor=white&color=3776AB)](https://pypi.org/project/remex/)
```

The badge row should look like this after removal:

```markdown
  [![License](https://img.shields.io/badge/License-Apache%202.0-5C6BC0?style=for-the-badge)](LICENSE)
  [![CI](https://img.shields.io/github/actions/workflow/status/adm-crow/remex/ci.yml?branch=main&style=for-the-badge&logo=github&logoColor=white&label=CI)](https://github.com/adm-crow/remex/actions)
  [![Windows](https://img.shields.io/badge/Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/adm-crow/remex/releases)
  [![macOS](https://img.shields.io/badge/macOS-000000?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/adm-crow/remex/releases)
  [![Linux](https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black)](https://github.com/adm-crow/remex/releases)
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/publish.yml README.md
git commit -m "ci: add PyPI trusted publisher workflow"
```

> **One-time manual step after merging:** Go to pypi.org → Your account → Publishing → "Add a new pending publisher". Fill in:
> - PyPI project name: `remex`
> - Owner: `adm-crow`
> - Repository name: `remex`
> - Workflow filename: `publish.yml`
> - Environment name: (leave blank)
>
> This only needs to be done once before the first publish. After that, pushing a `v*` tag triggers both this workflow and the Tauri release build automatically.

---

## Task 3: README Screenshot Gallery

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the gallery to `README.md`**

Find the existing hero image block:

```markdown
  <img src="docs/screenshots/remex_studio.png" alt="Remex Studio" width="720" />

</div>
```

Replace it with:

```markdown
  <img src="docs/screenshots/remex_studio.png" alt="Remex Studio" width="720" />

  <br/><br/>

  <table>
    <tr>
      <td align="center">
        <a href="docs/screenshots/remex_query.png">
          <img src="docs/screenshots/remex_query.png" width="360" alt="Semantic search" />
        </a><br/>
        <em>Semantic search</em>
      </td>
      <td align="center">
        <a href="docs/screenshots/remex_ai_answer.png">
          <img src="docs/screenshots/remex_ai_answer.png" width="360" alt="AI answer" />
        </a><br/>
        <em>AI answer</em>
      </td>
    </tr>
    <tr>
      <td align="center">
        <a href="docs/screenshots/remex_ingest.png">
          <img src="docs/screenshots/remex_ingest.png" width="360" alt="File ingestion" />
        </a><br/>
        <em>File ingestion</em>
      </td>
      <td align="center">
        <a href="docs/screenshots/remex_collection.png">
          <img src="docs/screenshots/remex_collection.png" width="360" alt="Collections manager" />
        </a><br/>
        <em>Collections manager</em>
      </td>
    </tr>
  </table>

</div>
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add screenshot gallery to README"
```

---

## Task 4: studio/README.md Prerequisites

**Files:**
- Modify: `studio/README.md`

- [ ] **Step 1: Add Prerequisites section to `studio/README.md`**

Find the existing `## Development` heading:

```markdown
## Development
```

Insert a new section immediately before it:

```markdown
## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) stable (required to build the native app)
- Python with `remex[api]` installed — needed in development so the sidecar is available:
  ```bash
  pip install remex[api]
  ```
  In production builds, Remex Studio spawns the sidecar automatically.

## Development
```

- [ ] **Step 2: Commit**

```bash
git add studio/README.md
git commit -m "docs: add prerequisites section to studio README"
```

---

## Final Verification

After all 4 tasks are committed:

```bash
# Python tests
uv run pytest

# Frontend tests
cd studio && npm test

# Rust check
cd studio/src-tauri && cargo check
```

All three should pass with no errors before tagging `v1.0.0`.
