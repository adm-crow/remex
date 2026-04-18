# Remex Studio

Desktop GUI for [remex](https://github.com/adm-crow/remex) — built with Tauri v2, React 19, and TypeScript.

## Stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript + Vite |
| UI | shadcn/ui + Tailwind CSS v4 |
| State | Zustand v5 |
| Data fetching | TanStack Query v5 |
| Tests | Vitest + React Testing Library |

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Rust](https://rustup.rs/) stable (required to build the native app)
- Python with `remex-cli[api]` installed — needed in development so the sidecar is available:
  ```bash
  pip install remex-cli[api]
  ```
  In production builds, Remex Studio spawns the sidecar automatically.

## Development

Requires the `remex[api]` sidecar to be running, or Remex Studio will spawn it automatically.

```bash
# Install dependencies
npm install

# Run tests
npm test

# Start dev server (hot reload)
npm run dev

# Build for production
npm run build

# Build the native app (requires Rust toolchain)
npm run tauri build
```

## IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
