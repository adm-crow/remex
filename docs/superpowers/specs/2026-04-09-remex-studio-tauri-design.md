# Remex Studio — Tauri v2 GUI Design

**Date:** 2026-04-09
**Status:** Approved
**Scope:** Sub-project 2 of 2 — Tauri v2 desktop GUI

---

## Overview

Build a desktop GUI for remex in `studio/` at the repo root. The app communicates with the existing `remex/api/` FastAPI sidecar over REST/SSE. It auto-starts the sidecar on launch and kills it on close. The Python package is not bundled — users install `remex[api]` via pip separately.

---

## Tech Stack

- **Tauri v2** (Rust shell)
- **React 19 + TypeScript**
- **Tailwind CSS v4**
- **shadcn/ui** components
- **TanStack Query v5** — server state (collections, sources, query results)
- **Zustand** — client state (current db, collection, recents, sidecar status)
- **Vitest + React Testing Library** — unit tests
- **Vite** — frontend bundler

---

## Directory Structure

```
studio/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs          # Tauri entry point
│   │   └── lib.rs           # spawn_sidecar / kill_sidecar commands, CloseRequested handler
│   ├── Cargo.toml
│   └── tauri.conf.json      # shell plugin, app metadata, window config
├── src/
│   ├── main.tsx             # React entry point
│   ├── App.tsx              # Router: Home vs AppShell
│   ├── api/
│   │   └── client.ts        # Typed fetch wrappers for every API endpoint
│   ├── store/
│   │   └── app.ts           # Zustand store + Tauri Store persistence
│   ├── hooks/
│   │   ├── useSidecar.ts    # Health-check + spawn/kill flow
│   │   └── useApi.ts        # TanStack Query wrappers
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         # Sidebar + content area wrapper
│   │   │   ├── Sidebar.tsx          # Nav, collection switcher, status dot
│   │   │   └── CollectionSwitcher.tsx
│   │   ├── query/
│   │   │   └── QueryPane.tsx        # Search input, results, AI chat toggle
│   │   ├── ingest/
│   │   │   └── IngestPane.tsx       # Dir/file picker, options, SSE progress
│   │   ├── sources/
│   │   │   └── SourcesPane.tsx      # Sources table, delete, purge
│   │   └── settings/
│   │       └── SettingsPane.tsx     # API URL, collection, embedding model
│   └── pages/
│       └── Home.tsx                 # Recent projects list + open folder button
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## Sidecar Management

### Flow

1. On app mount, `useSidecar` calls `GET {apiUrl}/health` with a 1 s timeout.
2. **Healthy** → set `sidecarStatus = "connected"`.
3. **Not reachable** → invoke Tauri command `spawn_sidecar()`, then poll `/health` every 2 s.
   - Sidebar shows "Starting server…" while polling.
   - After 15 s without a healthy response → `sidecarStatus = "error"`, show banner:
     `"Could not start remex serve. Is remex installed? (pip install remex[api])"`
4. On window `CloseRequested` → Tauri's `lib.rs` handler calls `kill_sidecar()` before closing.

### Rust side (`lib.rs`)

```rust
// Managed state
struct SidecarState(Mutex<Option<Child>>);

#[tauri::command]
async fn spawn_sidecar(state: State<'_, SidecarState>) -> Result<(), String> { ... }

#[tauri::command]
async fn kill_sidecar(state: State<'_, SidecarState>) -> Result<(), String> { ... }
```

The sidecar PID is held in `Mutex<Option<Child>>` in Tauri's managed state. `spawn_sidecar` runs `remex serve` via `std::process::Command`. `kill_sidecar` calls `child.kill()`.

---

## State Management

### Zustand store (`store/app.ts`)

```ts
interface AppState {
  currentDb: string | null
  currentCollection: string | null
  recentProjects: { path: string; lastOpened: string }[]
  apiUrl: string
  sidecarStatus: "starting" | "connected" | "error"
}
```

Persisted to `app-state.json` in Tauri's app data directory via `@tauri-apps/plugin-store`. On startup the store hydrates from disk before the sidecar check runs.

### TanStack Query

All server state goes through TanStack Query. Collection switching calls `queryClient.invalidateQueries` to clear stale data.

| Hook | Endpoint |
|------|----------|
| `useCollections(dbPath)` | `GET /collections?db_path=` |
| `useCollectionStats(db, col)` | `GET /collections/{col}/stats?db_path=` |
| `useSources(db, col)` | `GET /collections/{col}/sources?db_path=` |
| `useQueryResults` | `POST /collections/{col}/query` |
| `useChat` | `POST /collections/{col}/chat` |
| `useIngestStream` | manual SSE fetch (not TanStack Query) |

### API client (`api/client.ts`)

One typed function per endpoint. All functions accept `apiUrl: string` as first parameter so the configurable base URL flows through cleanly. No global axios instance — plain `fetch`.

---

## UI Views

### Home (no project open)

- Recent projects list: db path + last-opened date per entry
- "Open folder" button → Tauri folder picker → adds to recents, sets `currentDb`
- On first launch (empty recents) the folder picker opens automatically

### Sidebar (project open)

- Top: truncated db path, collection switcher dropdown (all collections + "Type a new name…" option — collections are created implicitly on first ingest, not via a dedicated API call)
- Nav items: Query · Ingest · Sources · Settings
- Bottom: sidecar status dot (green = connected, amber = starting, red = error) + remex version

### Query / Chat pane

- Text input + submit button
- Results as cards: score badge, source path, chunk number, text excerpt
- "AI answer" toggle → sends to `/chat`, renders synthesized answer above source cards
- Provider + model shown as a footer badge on the answer card

### Ingest pane

- Folder picker (file ingest) or file picker (SQLite `.db` / `.sqlite`)
- Collapsible "Advanced" section: chunk size, overlap, min chunk size, chunking strategy, embedding model
- "Start ingest" → SSE stream from `/collections/{col}/ingest/stream`
- Live progress list: filename, status icon (ingested / skipped / error), chunks stored
- Final summary card: sources found / ingested / skipped / chunks stored

### Sources pane

- Table: source path (the API returns `list[str]` — no per-source chunk count is available)
- Per-row delete button with confirmation dialog
- "Purge stale" button at top → `POST /collections/{col}/purge` → shows deleted count

### Settings pane

- Fields: API URL (default `http://localhost:8000`), default collection, default embedding model
- "Change project" link → navigates back to Home

---

## Error Handling

| Scenario | Behaviour |
|----------|-----------|
| API 4xx/5xx | Inline error banner in the affected pane — not a global toast |
| Sidecar unreachable after timeout | Persistent top banner with install hint |
| Empty collection | Per-pane empty state with hint ("Nothing ingested yet — go to Ingest") |
| SSE stream error | Error card in ingest progress list showing the detail message |
| No AI provider detected | Inline message in Query pane with link to Settings |

---

## Testing

**Vitest + React Testing Library** for all panes. `api/client.ts` is mocked in tests.

Key test cases:
- Query pane renders result cards from mocked API response
- Query pane renders AI answer + source cards in chat mode
- Ingest pane shows live progress items as SSE events arrive
- Ingest pane shows summary card on `done` event
- Sources pane renders table rows and opens delete confirmation dialog
- Collection switcher populates from `useCollections` hook
- Home page shows recent projects and triggers folder picker on "Open"
- `useSidecar` sets status to `"connected"` when `/health` returns 200
- `useSidecar` sets status to `"error"` after 15 s without a healthy response

No Rust unit tests — the sidecar commands are thin wrappers around `std::process::Command`.

---

## Out of Scope

- Packaging / code-signing the Tauri binary
- `remex studio` CLI launcher (requires knowing the installed app path — a post-packaging concern)
- Dark/light mode toggle (Tailwind `dark:` classes wired, no toggle UI)
- Multi-collection query (already supported by the API, not exposed in the GUI)
- Tauri updater / auto-update
