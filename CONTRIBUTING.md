# Contributing to Remex

Thanks for your interest in contributing. This document covers both the Python library and Remex Studio (the desktop app).

---

## Repository layout

```
remex/               Python library + CLI (remex, remex[api])
  remex/core/        Core ingest/query pipeline
  remex/api/         FastAPI sidecar (served by remex serve)
  remex/cli.py       Click CLI entry point
  tests/             pytest test suite

studio/              Desktop app (Tauri v2 + React 19 + TypeScript)
  src/               React frontend
  src-tauri/         Rust shell (Tauri)
  src/components/    UI components
  src/hooks/         React Query hooks + keyboard shortcuts
  src/store/         Zustand global state
```

---

## Development setup

### Python library

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/adm-crow/remex
cd remex
uv sync --group dev
uv run pytest          # run the test suite
```

### Studio (desktop app)

Requires [Node.js 22+](https://nodejs.org), [Rust stable](https://rustup.rs), and [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS.

```bash
cd studio
npm install
npm run tauri dev      # start dev server + Tauri shell
npx vitest run         # run frontend tests
cd src-tauri && cargo test  # run Rust tests
```

---

## Making changes

1. Fork the repository and create a branch: `git checkout -b feat/my-change`
2. Follow the existing code style — no `any` in TypeScript, type-annotated Python
3. Write tests for new behaviour (pytest for Python, Vitest for TypeScript)
4. Keep commits atomic and use [Conventional Commits](https://www.conventionalcommits.org/) prefixes: `feat:`, `fix:`, `perf:`, `docs:`, `chore:`
5. Run the full test suite before opening a PR

### Python tests

```bash
uv run pytest
```

### Frontend tests

```bash
cd studio && npx vitest run
```

### Rust checks

```bash
cd studio/src-tauri
cargo check
cargo clippy -- -D warnings
cargo test
```

---

## Pull requests

- PRs should target `main`
- Add an entry to `CHANGELOG.md` under `[Unreleased]`
- Keep PRs focused — one feature or fix per PR
- Draft PRs are welcome for early feedback

---

## Reporting issues

Open a GitHub Issue. For bugs, include:
- OS and version
- Steps to reproduce
- Expected vs actual behaviour
- Relevant log output (Studio logs can be found via the Tauri dev console)

---

## License

By contributing you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
