# Remex Studio — Tauri v2 GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri v2 desktop GUI in `studio/` that auto-starts the `remex serve` FastAPI sidecar and provides Query, Ingest, Sources, and Settings panes backed by the existing REST API.

**Architecture:** React + TypeScript frontend in a Tauri v2 shell. On launch the app pings `localhost:8000/health`; if unreachable it spawns `remex serve` via a Rust Tauri command holding the child PID in managed state and kills it on exit. All panes are thin clients over the existing `remex/api/` REST endpoints — no business logic in the GUI.

**Tech Stack:** Tauri v2, React 19, TypeScript, Tailwind CSS v4, shadcn/ui, TanStack Query v5, Zustand v5, Vitest, React Testing Library

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `studio/src-tauri/src/lib.rs` | `SidecarState`, `spawn_sidecar`, `kill_sidecar`, `run()` |
| Create | `studio/src-tauri/src/main.rs` | Tauri entry point |
| Create | `studio/src-tauri/Cargo.toml` | Rust dependencies |
| Create | `studio/src-tauri/tauri.conf.json` | App metadata, window config, dialog capability |
| Create | `studio/src/api/client.ts` | Typed `fetch` wrappers for every API endpoint + SSE generator |
| Create | `studio/src/store/app.ts` | Zustand store: `currentDb`, `currentCollection`, `recentProjects`, `apiUrl`, `sidecarStatus` |
| Create | `studio/src/hooks/useSidecar.ts` | Health-check loop + spawn/kill flow |
| Create | `studio/src/hooks/useApi.ts` | TanStack Query wrappers for all endpoints |
| Create | `studio/src/pages/Home.tsx` | Recent projects list + folder picker |
| Create | `studio/src/components/layout/CollectionSwitcher.tsx` | Collection dropdown + new-name input |
| Create | `studio/src/components/layout/Sidebar.tsx` | Nav items, switcher, sidecar status dot |
| Create | `studio/src/components/layout/AppShell.tsx` | Sidebar + content pane, mounts `useSidecar` |
| Create | `studio/src/components/query/QueryPane.tsx` | Query input, result cards, AI chat toggle |
| Create | `studio/src/components/ingest/IngestPane.tsx` | Dir picker, advanced options, SSE progress |
| Create | `studio/src/components/sources/SourcesPane.tsx` | Source table, delete dialog, purge button |
| Create | `studio/src/components/settings/SettingsPane.tsx` | API URL field, change-project link |
| Create | `studio/src/App.tsx` | `QueryClientProvider` + Home ↔ AppShell routing |
| Create | `studio/src/main.tsx` | React entry point |
| Modify | `studio/vite.config.ts` | Add Tailwind v4 plugin + `@` path alias |
| Modify | `studio/tsconfig.json` | Add `baseUrl` + `paths` for `@` alias |
| Create | `studio/vitest.config.ts` | Vitest config (jsdom, globals, setup file) |
| Create | `studio/src/test/setup.ts` | `@testing-library/jest-dom`, Tauri API mocks |
| Create | `studio/src/test/utils.tsx` | `renderWithProviders` helper (wraps RTL `render` in `QueryClientProvider`) |

---

## Task 1: Scaffold Tauri v2 project

**Files:**
- Create: `studio/` (entire scaffold)
- Modify: `studio/vite.config.ts`
- Modify: `studio/tsconfig.json`
- Modify: `studio/package.json`

- [ ] **Step 1: Scaffold from repo root**

```bash
cd C:/Users/JG-PERSONNAL/remex
npm create tauri-app@latest studio
```

When prompted, choose:
- **Project name:** `studio`
- **Identifier:** `com.remex.studio`
- **Frontend language:** TypeScript / JavaScript
- **Package manager:** npm
- **UI template:** React
- **UI flavor:** TypeScript

- [ ] **Step 2: Install frontend dependencies**

```bash
cd studio
npm install @tanstack/react-query zustand
npm install -D tailwindcss @tailwindcss/vite
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

- [ ] **Step 3: Install Tauri plugins (frontend + Rust)**

```bash
npm install @tauri-apps/plugin-dialog
cargo add tauri-plugin-dialog --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 4: Install shadcn/ui**

```bash
npx shadcn@latest init
```

When prompted:
- **Which style?** → Default
- **Which base color?** → Slate
- **CSS variables for theming?** → Yes
- **Where is your global CSS file?** → `src/index.css`
- **Where is your `tailwind.config`?** → (accept default / skip for v4)
- **Configure the import alias for components?** → `@/components`
- **Configure the import alias for utils?** → `@/lib/utils`

Then install the components we need:

```bash
npx shadcn@latest add button input badge card dialog select scroll-area label separator switch collapsible
```

- [ ] **Step 5: Update `studio/vite.config.ts`**

Replace the full file with:

```ts
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
```

- [ ] **Step 6: Update `studio/tsconfig.json`**

Add `baseUrl` and `paths` inside `compilerOptions`. Open the file and add these two lines to the existing `compilerOptions` object:

```json
"baseUrl": ".",
"paths": {
  "@/*": ["./src/*"]
}
```

- [ ] **Step 7: Add test and vitest scripts to `studio/package.json`**

Open `package.json` and add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 8: Create `studio/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 9: Create `studio/src/test/setup.ts`**

```ts
import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));
```

- [ ] **Step 10: Create `studio/src/test/utils.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}
```

- [ ] **Step 11: Verify the scaffold builds**

```bash
npm run build
```

Expected: exit code 0, no TypeScript errors.

- [ ] **Step 12: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/
git commit -m "feat: scaffold Tauri v2 studio — React, Tailwind v4, shadcn/ui, Vitest"
```

---

## Task 2: Rust sidecar management

**Files:**
- Create/Modify: `studio/src-tauri/src/lib.rs`
- Modify: `studio/src-tauri/src/main.rs`
- Modify: `studio/src-tauri/Cargo.toml`
- Modify: `studio/src-tauri/tauri.conf.json`

- [ ] **Step 1: Update `studio/src-tauri/Cargo.toml`**

Add these dependencies in the `[dependencies]` section (the scaffold already has `tauri`):

```toml
tauri-plugin-dialog = "2"
```

Full `[dependencies]` section should look like:

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

- [ ] **Step 2: Replace `studio/src-tauri/src/lib.rs` with**

```rust
use std::process::{Child, Command};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, RunEvent, State};

pub struct SidecarState(pub Mutex<Option<Child>>);

#[tauri::command]
pub fn spawn_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        return Ok(()); // already running
    }
    let child = Command::new("remex")
        .args(["serve"])
        .spawn()
        .map_err(|e| format!("Failed to spawn 'remex serve': {e}"))?;
    *guard = Some(child);
    Ok(())
}

#[tauri::command]
pub fn kill_sidecar(state: State<'_, SidecarState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        child.kill().map_err(|e| format!("Failed to kill sidecar: {e}"))?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![spawn_sidecar, kill_sidecar])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle: &AppHandle, event| {
            if let RunEvent::ExitRequested { .. } = event {
                let state = app_handle.state::<SidecarState>();
                if let Ok(mut guard) = state.0.lock() {
                    if let Some(mut child) = guard.take() {
                        let _ = child.kill();
                    }
                }
            }
        });
}
```

- [ ] **Step 3: Replace `studio/src-tauri/src/main.rs` with**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    remex_studio_lib::run();
}
```

Note: the lib crate name (`remex_studio_lib`) is set by the scaffold in `Cargo.toml` under `[lib] name`. Verify it matches — if the scaffold used a different name, update the `main.rs` call accordingly.

- [ ] **Step 4: Update `studio/src-tauri/tauri.conf.json`**

Ensure the `"app"` section has a `"security"` entry that allows the dialog plugin. The exact format for Tauri v2:

```json
{
  "productName": "Remex Studio",
  "version": "0.1.0",
  "identifier": "com.remex.studio",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "Remex Studio",
        "width": 1200,
        "height": 800,
        "minWidth": 900,
        "minHeight": 600
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.icns", "icons/icon.ico"]
  }
}
```

Keep any icon paths that the scaffold already generated. Only change `productName`, `identifier`, `width`/`height`, and `minWidth`/`minHeight`.

- [ ] **Step 5: Verify the Rust code compiles**

```bash
cd studio
cargo build --manifest-path src-tauri/Cargo.toml
```

Expected: `Compiling remex-studio-lib ...` with no errors.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src-tauri/
git commit -m "feat: Rust sidecar commands — spawn_sidecar, kill_sidecar, ExitRequested cleanup"
```

---

## Task 3: API client

**Files:**
- Create: `studio/src/api/client.ts`
- Create: `studio/src/api/client.test.ts`

- [ ] **Step 1: Write the failing tests — `studio/src/api/client.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { api } from "./client";

const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => mockFetch.mockReset());

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function errResponse(status: number, body = "Error") {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

describe("api.getHealth", () => {
  it("calls /health and returns data", async () => {
    mockFetch.mockReturnValue(okJson({ status: "ok", version: "0.2.0" }));
    const result = await api.getHealth("http://localhost:8000");
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8000/health");
    expect(result).toEqual({ status: "ok", version: "0.2.0" });
  });
});

describe("api.getCollections", () => {
  it("encodes db_path in query string", async () => {
    mockFetch.mockReturnValue(okJson(["col1", "col2"]));
    await api.getCollections("http://localhost:8000", "./remex_db");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/collections?db_path=.%2Fremex_db"
    );
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockReturnValue(errResponse(404, "Not found"));
    await expect(
      api.getCollections("http://localhost:8000", "./remex_db")
    ).rejects.toThrow("404");
  });
});

describe("api.queryCollection", () => {
  it("sends POST with db_path merged into body", async () => {
    mockFetch.mockReturnValue(okJson([]));
    await api.queryCollection("http://localhost:8000", "./remex_db", "myCol", {
      text: "hello",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/collections/myCol/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "hello", db_path: "./remex_db" }),
      })
    );
  });
});

describe("api.purgeCollection", () => {
  it("sends POST to purge endpoint", async () => {
    mockFetch.mockReturnValue(
      okJson({ chunks_deleted: 3, chunks_checked: 10 })
    );
    const result = await api.purgeCollection(
      "http://localhost:8000",
      "./remex_db",
      "myCol"
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:8000/collections/myCol/purge?db_path=.%2Fremex_db",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.chunks_deleted).toBe(3);
  });
});

describe("api.ingestFilesStream", () => {
  it("yields progress and done events from SSE stream", async () => {
    const progressEvent = JSON.stringify({
      type: "progress",
      filename: "a.md",
      files_done: 1,
      files_total: 2,
      status: "ingested",
      chunks_stored: 5,
    });
    const doneEvent = JSON.stringify({
      type: "done",
      result: {
        sources_found: 2,
        sources_ingested: 2,
        sources_skipped: 0,
        chunks_stored: 10,
        skipped_reasons: [],
      },
    });
    const sseBody = `data: ${progressEvent}\n\ndata: ${doneEvent}\n\n`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: true, body: stream })
    );

    const events = [];
    for await (const event of api.ingestFilesStream(
      "http://localhost:8000",
      "./remex_db",
      "myCol",
      { source_dir: "./docs" }
    )) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("progress");
    expect(events[1].type).toBe("done");
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL with import error**

```bash
cd studio
npm test -- src/api/client.test.ts
```

Expected: `Cannot find module './client'`

- [ ] **Step 3: Create `studio/src/api/client.ts`**

```ts
// ---- Types (mirror FastAPI schemas in remex/api/schemas.py) ----

export interface HealthResponse {
  status: string;
  version: string;
}

export interface CollectionStatsResponse {
  name: string;
  total_chunks: number;
  total_sources: number;
  embedding_model: string;
}

export interface PurgeResultResponse {
  chunks_deleted: number;
  chunks_checked: number;
}

export interface DeletedChunksResponse {
  deleted_chunks: number;
}

export interface QueryResultItem {
  text: string;
  source: string;
  source_type: string;
  score: number;
  distance: number;
  chunk: number;
  doc_title: string;
  doc_author: string;
  doc_created: string;
}

export interface ChatResponse {
  answer: string;
  sources: QueryResultItem[];
  provider: string;
  model: string;
}

export interface QueryRequest {
  text: string;
  n_results?: number;
  embedding_model?: string;
  where?: Record<string, unknown>;
  min_score?: number;
}

export interface ChatRequest extends QueryRequest {
  provider?: string;
  model?: string;
}

export interface IngestRequest {
  source_dir: string;
  embedding_model?: string;
  chunk_size?: number;
  overlap?: number;
  min_chunk_size?: number;
  chunking?: "word" | "sentence";
  incremental?: boolean;
  streaming_threshold_mb?: number;
}

export interface IngestResultResponse {
  sources_found: number;
  sources_ingested: number;
  sources_skipped: number;
  chunks_stored: number;
  skipped_reasons: string[];
}

export interface IngestProgressEvent {
  type: "progress";
  filename: string;
  files_done: number;
  files_total: number;
  status: "ingested" | "skipped" | "error";
  chunks_stored: number;
}

export interface IngestDoneEvent {
  type: "done";
  result: IngestResultResponse;
}

export interface IngestErrorEvent {
  type: "error";
  detail: string;
}

export type IngestStreamEvent =
  | IngestProgressEvent
  | IngestDoneEvent
  | IngestErrorEvent;

// ---- Internal fetch helper ----

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ---- Public API ----

export const api = {
  getHealth: (base: string) =>
    apiFetch<HealthResponse>(`${base}/health`),

  getCollections: (base: string, dbPath: string) =>
    apiFetch<string[]>(
      `${base}/collections?db_path=${encodeURIComponent(dbPath)}`
    ),

  getCollectionStats: (base: string, dbPath: string, collection: string) =>
    apiFetch<CollectionStatsResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/stats?db_path=${encodeURIComponent(dbPath)}`
    ),

  getSources: (base: string, dbPath: string, collection: string) =>
    apiFetch<string[]>(
      `${base}/collections/${encodeURIComponent(collection)}/sources?db_path=${encodeURIComponent(dbPath)}`
    ),

  deleteSource: (
    base: string,
    dbPath: string,
    collection: string,
    source: string
  ) =>
    apiFetch<DeletedChunksResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/sources/${encodeURIComponent(source)}?db_path=${encodeURIComponent(dbPath)}`,
      { method: "DELETE" }
    ),

  resetCollection: (base: string, dbPath: string, collection: string) =>
    apiFetch<{ deleted: boolean }>(
      `${base}/collections/${encodeURIComponent(collection)}?db_path=${encodeURIComponent(dbPath)}`,
      { method: "DELETE" }
    ),

  purgeCollection: (base: string, dbPath: string, collection: string) =>
    apiFetch<PurgeResultResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/purge?db_path=${encodeURIComponent(dbPath)}`,
      { method: "POST" }
    ),

  queryCollection: (
    base: string,
    dbPath: string,
    collection: string,
    req: QueryRequest
  ) =>
    apiFetch<QueryResultItem[]>(
      `${base}/collections/${encodeURIComponent(collection)}/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  chat: (
    base: string,
    dbPath: string,
    collection: string,
    req: ChatRequest
  ) =>
    apiFetch<ChatResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  ingestFiles: (
    base: string,
    dbPath: string,
    collection: string,
    req: IngestRequest
  ) =>
    apiFetch<IngestResultResponse>(
      `${base}/collections/${encodeURIComponent(collection)}/ingest`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
      }
    ),

  async *ingestFilesStream(
    base: string,
    dbPath: string,
    collection: string,
    req: IngestRequest,
    signal?: AbortSignal
  ): AsyncGenerator<IngestStreamEvent> {
    const res = await fetch(
      `${base}/collections/${encodeURIComponent(collection)}/ingest/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...req, db_path: dbPath }),
        signal,
      }
    );
    if (!res.ok || !res.body) {
      throw new Error(`${res.status}: ingest stream failed`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.startsWith("data: ")) {
          yield JSON.parse(part.slice(6)) as IngestStreamEvent;
        }
      }
    }
  },
};
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/api/client.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/api/
git commit -m "feat: typed API client with SSE generator"
```

---

## Task 4: Zustand store

**Files:**
- Create: `studio/src/store/app.ts`
- Create: `studio/src/store/app.test.ts`

- [ ] **Step 1: Write the failing tests — `studio/src/store/app.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./app";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
  });
});

describe("useAppStore", () => {
  it("setCurrentDb updates currentDb", () => {
    useAppStore.getState().setCurrentDb("./remex_db");
    expect(useAppStore.getState().currentDb).toBe("./remex_db");
  });

  it("setCurrentCollection updates currentCollection", () => {
    useAppStore.getState().setCurrentCollection("myCol");
    expect(useAppStore.getState().currentCollection).toBe("myCol");
  });

  it("addRecentProject prepends a new entry", () => {
    useAppStore.getState().addRecentProject("/path/a");
    expect(useAppStore.getState().recentProjects[0].path).toBe("/path/a");
    expect(useAppStore.getState().recentProjects[0].lastOpened).toBeTruthy();
  });

  it("addRecentProject keeps most recent at index 0 when adding second", () => {
    useAppStore.getState().addRecentProject("/path/a");
    useAppStore.getState().addRecentProject("/path/b");
    expect(useAppStore.getState().recentProjects[0].path).toBe("/path/b");
    expect(useAppStore.getState().recentProjects[1].path).toBe("/path/a");
  });

  it("addRecentProject deduplicates — re-adding moves to front", () => {
    useAppStore.getState().addRecentProject("/path/a");
    useAppStore.getState().addRecentProject("/path/b");
    useAppStore.getState().addRecentProject("/path/a");
    const { recentProjects } = useAppStore.getState();
    expect(recentProjects).toHaveLength(2);
    expect(recentProjects[0].path).toBe("/path/a");
  });

  it("setApiUrl updates apiUrl", () => {
    useAppStore.getState().setApiUrl("http://localhost:9000");
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:9000");
  });

  it("setSidecarStatus updates sidecarStatus", () => {
    useAppStore.getState().setSidecarStatus("connected");
    expect(useAppStore.getState().sidecarStatus).toBe("connected");
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/store/app.test.ts
```

Expected: `Cannot find module './app'`

- [ ] **Step 3: Create `studio/src/store/app.ts`**

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export interface AppState {
  currentDb: string | null;
  currentCollection: string | null;
  recentProjects: RecentProject[];
  apiUrl: string;
  sidecarStatus: "starting" | "connected" | "error";
  // Actions
  setCurrentDb: (db: string | null) => void;
  setCurrentCollection: (col: string | null) => void;
  addRecentProject: (path: string) => void;
  setApiUrl: (url: string) => void;
  setSidecarStatus: (status: AppState["sidecarStatus"]) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentDb: null,
      currentCollection: null,
      recentProjects: [],
      apiUrl: "http://localhost:8000",
      sidecarStatus: "starting",

      setCurrentDb: (db) => set({ currentDb: db }),
      setCurrentCollection: (col) => set({ currentCollection: col }),

      addRecentProject: (path) => {
        const filtered = get().recentProjects.filter((p) => p.path !== path);
        set({
          recentProjects: [
            { path, lastOpened: new Date().toISOString() },
            ...filtered,
          ].slice(0, 10),
        });
      },

      setApiUrl: (url) => set({ apiUrl: url }),
      setSidecarStatus: (status) => set({ sidecarStatus: status }),
    }),
    {
      name: "remex-studio",
      // Only persist user preferences — runtime state resets each launch
      partialize: (state) => ({
        recentProjects: state.recentProjects,
        apiUrl: state.apiUrl,
      }),
    }
  )
);
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/store/app.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/store/
git commit -m "feat: Zustand store with persisted recentProjects and apiUrl"
```

---

## Task 5: `useSidecar` hook

**Files:**
- Create: `studio/src/hooks/useSidecar.ts`
- Create: `studio/src/hooks/useSidecar.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/hooks/useSidecar.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSidecar } from "./useSidecar";
import * as tauriCore from "@tauri-apps/api/core";
import { useAppStore } from "@/store/app";

// Mock the api module
vi.mock("@/api/client", () => ({
  api: { getHealth: vi.fn() },
}));

import { api } from "@/api/client";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
  });
  vi.mocked(tauriCore.invoke).mockResolvedValue(undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSidecar", () => {
  it("sets status to connected when health returns 200 on first check", async () => {
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      version: "0.2.0",
    });

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
    expect(tauriCore.invoke).not.toHaveBeenCalled();
  });

  it("calls spawn_sidecar when health fails initially", async () => {
    vi.mocked(api.getHealth)
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue({ status: "ok", version: "0.2.0" });

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith("spawn_sidecar");
    });
  });

  it("sets status to connected after spawn + poll succeeds", async () => {
    vi.mocked(api.getHealth)
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("still not ready"))
      .mockResolvedValue({ status: "ok", version: "0.2.0" });

    renderHook(() => useSidecar());

    // Advance past spawn + two poll ticks
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
  });

  it("sets status to error when invoke fails", async () => {
    vi.mocked(api.getHealth).mockRejectedValue(new Error("not ready"));
    vi.mocked(tauriCore.invoke).mockRejectedValue(
      new Error("remex not found")
    );

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("error");
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/hooks/useSidecar.test.tsx
```

Expected: `Cannot find module './useSidecar'`

- [ ] **Step 3: Create `studio/src/hooks/useSidecar.ts`**

```ts
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 15000;

export function useSidecar() {
  const apiUrl = useAppStore((s) => s.apiUrl);
  const setSidecarStatus = useAppStore((s) => s.setSidecarStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth(): Promise<boolean> {
      try {
        await api.getHealth(apiUrl);
        return true;
      } catch {
        return false;
      }
    }

    async function start() {
      setSidecarStatus("starting");

      if (await checkHealth()) {
        if (!cancelled) setSidecarStatus("connected");
        return;
      }

      try {
        await invoke("spawn_sidecar");
      } catch {
        if (!cancelled) setSidecarStatus("error");
        return;
      }

      const deadline = Date.now() + TIMEOUT_MS;
      intervalRef.current = setInterval(async () => {
        if (cancelled) {
          clearInterval(intervalRef.current!);
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(intervalRef.current!);
          setSidecarStatus("error");
          return;
        }
        if (await checkHealth()) {
          clearInterval(intervalRef.current!);
          setSidecarStatus("connected");
        }
      }, POLL_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [apiUrl, setSidecarStatus]);
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/hooks/useSidecar.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/hooks/useSidecar.ts studio/src/hooks/useSidecar.test.tsx
git commit -m "feat: useSidecar — health-check, spawn, poll, timeout"
```

---

## Task 6: `useApi` hooks

**Files:**
- Create: `studio/src/hooks/useApi.ts`
- Create: `studio/src/hooks/useApi.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/hooks/useApi.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCollections,
  useCollectionStats,
  useSources,
  useDeleteSource,
  usePurgeCollection,
} from "./useApi";

vi.mock("@/api/client", () => ({
  api: {
    getCollections: vi.fn(),
    getCollectionStats: vi.fn(),
    getSources: vi.fn(),
    deleteSource: vi.fn(),
    purgeCollection: vi.fn(),
  },
}));

import { api } from "@/api/client";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.resetAllMocks());

describe("useCollections", () => {
  it("returns data from api.getCollections", async () => {
    vi.mocked(api.getCollections).mockResolvedValue(["col1", "col2"]);
    const { result } = renderHook(
      () => useCollections("http://localhost:8000", "./remex_db"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["col1", "col2"]);
  });

  it("is disabled when dbPath is empty", async () => {
    const { result } = renderHook(
      () => useCollections("http://localhost:8000", ""),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.getCollections).not.toHaveBeenCalled();
  });
});

describe("useCollectionStats", () => {
  it("returns stats from api.getCollectionStats", async () => {
    vi.mocked(api.getCollectionStats).mockResolvedValue({
      name: "col1",
      total_chunks: 10,
      total_sources: 2,
      embedding_model: "all-MiniLM-L6-v2",
    });
    const { result } = renderHook(
      () =>
        useCollectionStats("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_chunks).toBe(10);
  });
});

describe("useSources", () => {
  it("returns sources list", async () => {
    vi.mocked(api.getSources).mockResolvedValue(["/path/a.md", "/path/b.md"]);
    const { result } = renderHook(
      () => useSources("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });
});

describe("useDeleteSource", () => {
  it("calls api.deleteSource with correct args", async () => {
    vi.mocked(api.deleteSource).mockResolvedValue({ deleted_chunks: 3 });
    const { result } = renderHook(
      () => useDeleteSource("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    await result.current.mutateAsync("/path/a.md");
    expect(api.deleteSource).toHaveBeenCalledWith(
      "http://localhost:8000",
      "./remex_db",
      "col1",
      "/path/a.md"
    );
  });
});

describe("usePurgeCollection", () => {
  it("calls api.purgeCollection", async () => {
    vi.mocked(api.purgeCollection).mockResolvedValue({
      chunks_deleted: 2,
      chunks_checked: 5,
    });
    const { result } = renderHook(
      () => usePurgeCollection("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    const res = await result.current.mutateAsync();
    expect(res.chunks_deleted).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/hooks/useApi.test.tsx
```

Expected: `Cannot find module './useApi'`

- [ ] **Step 3: Create `studio/src/hooks/useApi.ts`**

```ts
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/api/client";

export function useCollections(apiUrl: string, dbPath: string) {
  return useQuery({
    queryKey: ["collections", apiUrl, dbPath],
    queryFn: () => api.getCollections(apiUrl, dbPath),
    enabled: !!dbPath,
  });
}

export function useCollectionStats(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  return useQuery({
    queryKey: ["collectionStats", apiUrl, dbPath, collection],
    queryFn: () => api.getCollectionStats(apiUrl, dbPath, collection),
    enabled: !!dbPath && !!collection,
  });
}

export function useSources(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  return useQuery({
    queryKey: ["sources", apiUrl, dbPath, collection],
    queryFn: () => api.getSources(apiUrl, dbPath, collection),
    enabled: !!dbPath && !!collection,
  });
}

export function useQueryResults(
  apiUrl: string,
  dbPath: string,
  collection: string,
  text: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["query", apiUrl, dbPath, collection, text],
    queryFn: () => api.queryCollection(apiUrl, dbPath, collection, { text }),
    enabled:
      !!text &&
      !!dbPath &&
      !!collection &&
      (options?.enabled ?? true),
  });
}

export function useChat(
  apiUrl: string,
  dbPath: string,
  collection: string,
  text: string,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ["chat", apiUrl, dbPath, collection, text],
    queryFn: () => api.chat(apiUrl, dbPath, collection, { text }),
    enabled:
      !!text &&
      !!dbPath &&
      !!collection &&
      (options?.enabled ?? true),
  });
}

export function useDeleteSource(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (source: string) =>
      api.deleteSource(apiUrl, dbPath, collection, source),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sources", apiUrl, dbPath, collection],
      });
    },
  });
}

export function usePurgeCollection(
  apiUrl: string,
  dbPath: string,
  collection: string
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.purgeCollection(apiUrl, dbPath, collection),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["sources", apiUrl, dbPath, collection],
      });
    },
  });
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/hooks/useApi.test.tsx
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/hooks/useApi.ts studio/src/hooks/useApi.test.tsx
git commit -m "feat: TanStack Query hooks for collections, sources, query, chat, delete, purge"
```

---

## Task 7: Home page

**Files:**
- Create: `studio/src/pages/Home.tsx`
- Create: `studio/src/pages/Home.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/pages/Home.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Home } from "./Home";
import * as dialog from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/store/app";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
  });
});

describe("Home", () => {
  it("renders the app title and open button", () => {
    render(<Home />);
    expect(screen.getByText("Remex Studio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open remex_db folder/i })
    ).toBeInTheDocument();
  });

  it("does not render recent projects section when list is empty", () => {
    render(<Home />);
    expect(screen.queryByText(/recent projects/i)).not.toBeInTheDocument();
  });

  it("renders recent projects when store has entries", () => {
    useAppStore.setState({
      recentProjects: [
        { path: "/my/db", lastOpened: "2026-04-01T00:00:00.000Z" },
      ],
    } as any);
    render(<Home />);
    expect(screen.getByText(/recent projects/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Open /my/db")).toBeInTheDocument();
  });

  it("clicking a recent project sets currentDb in store", () => {
    useAppStore.setState({
      recentProjects: [
        { path: "/my/db", lastOpened: "2026-04-01T00:00:00.000Z" },
      ],
    } as any);
    render(<Home />);
    fireEvent.click(screen.getByLabelText("Open /my/db"));
    expect(useAppStore.getState().currentDb).toBe("/my/db");
  });

  it("open button calls dialog.open and sets currentDb on selection", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/selected/db");
    render(<Home />);
    fireEvent.click(
      screen.getByRole("button", { name: /open remex_db folder/i })
    );
    await waitFor(() => {
      expect(useAppStore.getState().currentDb).toBe("/selected/db");
    });
  });

  it("open button does nothing when dialog is cancelled (null)", async () => {
    vi.mocked(dialog.open).mockResolvedValue(null);
    render(<Home />);
    fireEvent.click(
      screen.getByRole("button", { name: /open remex_db folder/i })
    );
    await waitFor(() => {
      expect(useAppStore.getState().currentDb).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/pages/Home.test.tsx
```

Expected: `Cannot find module './Home'`

- [ ] **Step 3: Create `studio/src/pages/Home.tsx`**

```tsx
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";

export function Home() {
  const { recentProjects, addRecentProject, setCurrentDb, setCurrentCollection } =
    useAppStore();

  async function handleOpen() {
    const selected = await open({
      directory: true,
      title: "Select remex_db folder",
    });
    if (typeof selected === "string") {
      addRecentProject(selected);
      setCurrentDb(selected);
      setCurrentCollection(null);
    }
  }

  function handleRecent(path: string) {
    addRecentProject(path);
    setCurrentDb(path);
    setCurrentCollection(null);
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Remex Studio</h1>
        <p className="text-muted-foreground mt-1">Local-first RAG interface</p>
      </div>

      <Button onClick={handleOpen} size="lg">
        Open remex_db folder
      </Button>

      {recentProjects.length > 0 && (
        <div className="w-96 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Recent projects
          </p>
          {recentProjects.map((p) => (
            <button
              key={p.path}
              onClick={() => handleRecent(p.path)}
              className="w-full text-left p-3 rounded border hover:bg-accent transition-colors"
              aria-label={`Open ${p.path}`}
            >
              <p className="text-sm font-mono truncate">{p.path}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(p.lastOpened).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/pages/Home.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/pages/
git commit -m "feat: Home page — recent projects list and folder picker"
```

---

## Task 8: Layout components

**Files:**
- Create: `studio/src/components/layout/CollectionSwitcher.tsx`
- Create: `studio/src/components/layout/Sidebar.tsx`
- Create: `studio/src/components/layout/AppShell.tsx`
- Create: `studio/src/components/layout/layout.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/components/layout/layout.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useCollections: vi.fn(),
}));

vi.mock("@/hooks/useSidecar", () => ({
  useSidecar: vi.fn(),
}));

import { useCollections } from "@/hooks/useApi";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  });
});

describe("CollectionSwitcher", () => {
  it("renders available collections in the dropdown", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col1", "col2"],
      isLoading: false,
    } as any);
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    await waitFor(() => {
      expect(screen.getByText("col1")).toBeInTheDocument();
      expect(screen.getByText("col2")).toBeInTheDocument();
    });
  });

  it("selecting a collection updates the store", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col1", "col2"],
      isLoading: false,
    } as any);
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    await waitFor(() => screen.getByText("col1"));
    fireEvent.click(screen.getByText("col1"));
    expect(useAppStore.getState().currentCollection).toBe("col1");
  });
});

describe("Sidebar", () => {
  it("renders all nav items", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    const onViewChange = vi.fn();
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={onViewChange} />
    );
    expect(screen.getByText("Query")).toBeInTheDocument();
    expect(screen.getByText("Ingest")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("clicking a nav item calls onViewChange", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    const onViewChange = vi.fn();
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={onViewChange} />
    );
    fireEvent.click(screen.getByText("Ingest"));
    expect(onViewChange).toHaveBeenCalledWith("ingest");
  });

  it("shows green status dot when sidecar is connected", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={vi.fn()} />
    );
    expect(screen.getByLabelText("Server connected")).toBeInTheDocument();
  });

  it("shows red status dot when sidecar errors", () => {
    useAppStore.setState({ sidecarStatus: "error" } as any);
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={vi.fn()} />
    );
    expect(screen.getByLabelText("Server error")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/components/layout/layout.test.tsx
```

Expected: `Cannot find module './CollectionSwitcher'`

- [ ] **Step 3: Create `studio/src/components/layout/CollectionSwitcher.tsx`**

```tsx
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCollections } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";

export function CollectionSwitcher() {
  const { apiUrl, currentDb, currentCollection, setCurrentCollection } =
    useAppStore();
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const { data: collections = [] } = useCollections(apiUrl, currentDb ?? "");

  if (isNew) {
    return (
      <div className="flex gap-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="collection name"
          className="h-7 text-xs"
          aria-label="New collection name"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              setCurrentCollection(newName.trim());
              setIsNew(false);
              setNewName("");
            }
            if (e.key === "Escape") {
              setIsNew(false);
              setNewName("");
            }
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setIsNew(false);
            setNewName("");
          }}
          className="h-7 px-2 text-xs"
        >
          ✕
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={currentCollection ?? ""}
      onValueChange={(v) => {
        if (v === "__new__") {
          setIsNew(true);
        } else {
          setCurrentCollection(v);
        }
      }}
    >
      <SelectTrigger className="h-7 text-xs" aria-label="Collection">
        <SelectValue placeholder="Select collection…" />
      </SelectTrigger>
      <SelectContent>
        {collections.map((c) => (
          <SelectItem key={c} value={c} className="text-xs">
            {c}
          </SelectItem>
        ))}
        <SelectItem value="__new__" className="text-xs text-muted-foreground">
          Type a new name…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 4: Create `studio/src/components/layout/Sidebar.tsx`**

```tsx
import { cn } from "@/lib/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store/app";

export type View = "query" | "ingest" | "sources" | "settings";

interface SidebarProps {
  activeView: View;
  onViewChange: (v: View) => void;
}

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: "query", label: "Query" },
  { view: "ingest", label: "Ingest" },
  { view: "sources", label: "Sources" },
  { view: "settings", label: "Settings" },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { currentDb, sidecarStatus } = useAppStore();

  const statusColor =
    sidecarStatus === "connected"
      ? "bg-green-500"
      : sidecarStatus === "starting"
      ? "bg-amber-500"
      : "bg-red-500";

  const truncated =
    currentDb && currentDb.length > 30
      ? "…" + currentDb.slice(-27)
      : (currentDb ?? "");

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r bg-muted/30 h-full">
      <div className="p-3 space-y-2">
        <p
          className="text-xs text-muted-foreground truncate"
          title={currentDb ?? ""}
          aria-label="Current database"
        >
          {truncated}
        </p>
        <CollectionSwitcher />
      </div>
      <Separator />
      <nav className="flex flex-col p-2 gap-1 flex-1">
        {NAV_ITEMS.map(({ view, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={cn(
              "text-left text-sm px-3 py-1.5 rounded hover:bg-accent transition-colors",
              activeView === view && "bg-accent font-medium"
            )}
            aria-current={activeView === view ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      <Separator />
      <div className="p-3 flex items-center gap-2">
        <span
          className={cn("w-2 h-2 rounded-full", statusColor)}
          aria-label={`Server ${sidecarStatus}`}
          title={`Server ${sidecarStatus}`}
        />
        <span className="text-xs text-muted-foreground capitalize">
          {sidecarStatus}
        </span>
      </div>
    </aside>
  );
}
```

- [ ] **Step 5: Create `studio/src/components/layout/AppShell.tsx`**

```tsx
import { useState } from "react";
import { Sidebar, type View } from "./Sidebar";
import { QueryPane } from "@/components/query/QueryPane";
import { IngestPane } from "@/components/ingest/IngestPane";
import { SourcesPane } from "@/components/sources/SourcesPane";
import { SettingsPane } from "@/components/settings/SettingsPane";
import { useSidecar } from "@/hooks/useSidecar";
import { useAppStore } from "@/store/app";

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("query");
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  useSidecar();

  const panes: Record<View, React.ReactNode> = {
    query: <QueryPane />,
    ingest: <IngestPane />,
    sources: <SourcesPane />,
    settings: <SettingsPane />,
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-auto flex flex-col">
        {sidecarStatus === "error" && (
          <div
            className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            Could not start remex serve. Is remex installed? (pip install
            remex[api])
          </div>
        )}
        <div className="flex-1">{panes[activeView]}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Run tests — verify they PASS**

```bash
cd studio
npm test -- src/components/layout/layout.test.tsx
```

Expected: 6 tests pass.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/components/layout/
git commit -m "feat: layout components — CollectionSwitcher, Sidebar, AppShell"
```

---

## Task 9: `App.tsx` and `main.tsx`

**Files:**
- Create: `studio/src/App.tsx`
- Modify: `studio/src/main.tsx`
- Create: `studio/src/App.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/App.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";
import { useAppStore } from "@/store/app";

// Stub heavy pane components so they don't need full setup
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: () => <div data-testid="app-shell" />,
}));
vi.mock("@/pages/Home", () => ({
  Home: () => <div data-testid="home" />,
}));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
  });
});

describe("App", () => {
  it("renders Home when currentDb is null", () => {
    render(<App />);
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });

  it("renders AppShell when currentDb is set", () => {
    useAppStore.setState({ currentDb: "./remex_db" } as any);
    render(<App />);
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/App.test.tsx
```

Expected: `Cannot find module './App'`

- [ ] **Step 3: Create `studio/src/App.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAppStore } from "@/store/app";
import { Home } from "@/pages/Home";
import { AppShell } from "@/components/layout/AppShell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export function App() {
  const currentDb = useAppStore((s) => s.currentDb);

  return (
    <QueryClientProvider client={queryClient}>
      {currentDb ? <AppShell /> : <Home />}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Replace `studio/src/main.tsx` with**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 5: Run tests — verify they PASS**

```bash
npm test -- src/App.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/App.tsx studio/src/App.test.tsx studio/src/main.tsx
git commit -m "feat: App.tsx — QueryClientProvider + Home/AppShell routing"
```

---

## Task 10: QueryPane

**Files:**
- Create: `studio/src/components/query/QueryPane.tsx`
- Create: `studio/src/components/query/QueryPane.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/components/query/QueryPane.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { QueryPane } from "./QueryPane";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useQueryResults: vi.fn(),
  useChat: vi.fn(),
}));

import { useQueryResults, useChat } from "@/hooks/useApi";

const mockResults = [
  {
    text: "Sample chunk text",
    source: "/docs/a.md",
    source_type: "file",
    score: 0.9,
    distance: 0.1,
    chunk: 0,
    doc_title: "Doc A",
    doc_author: "",
    doc_created: "",
  },
];

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
  vi.mocked(useQueryResults).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useChat).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as any);
});

describe("QueryPane", () => {
  it("renders the query input and search button", () => {
    renderWithProviders(<QueryPane />);
    expect(screen.getByRole("textbox", { name: /query input/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("renders result cards after submitting a query", async () => {
    vi.mocked(useQueryResults).mockReturnValue({
      data: mockResults,
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Sample chunk text")).toBeInTheDocument();
    });
  });

  it("renders AI answer card in chat mode", async () => {
    vi.mocked(useChat).mockReturnValue({
      data: {
        answer: "Remex is a RAG tool.",
        sources: mockResults,
        provider: "anthropic",
        model: "claude-opus-4-6",
      },
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    // Enable AI toggle
    fireEvent.click(screen.getByRole("switch", { name: /ai answer/i }));
    // Submit a query
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Remex is a RAG tool.")).toBeInTheDocument();
      expect(screen.getByText(/anthropic \/ claude-opus-4-6/i)).toBeInTheDocument();
    });
  });

  it("shows 'No results found' when results are empty after query", async () => {
    vi.mocked(useQueryResults).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "nothing" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });
  });

  it("shows error banner when query fails", async () => {
    vi.mocked(useQueryResults).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Collection not found"),
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "oops" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/components/query/QueryPane.test.tsx
```

Expected: `Cannot find module './QueryPane'`

- [ ] **Step 3: Create `studio/src/components/query/QueryPane.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useQueryResults, useChat } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";

export function QueryPane() {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [useAi, setUseAi] = useState(false);
  const { apiUrl, currentDb, currentCollection } = useAppStore();

  const queryResult = useQueryResults(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? "",
    submitted,
    { enabled: !!submitted && !useAi }
  );
  const chatResult = useChat(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? "",
    submitted,
    { enabled: !!submitted && useAi }
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim()) setSubmitted(text.trim());
  }

  const results = useAi
    ? (chatResult.data?.sources ?? [])
    : (queryResult.data ?? []);
  const isLoading = useAi ? chatResult.isLoading : queryResult.isLoading;
  const error = useAi ? chatResult.error : queryResult.error;

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1"
          aria-label="Query input"
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Searching…" : "Search"}
        </Button>
      </form>

      <div className="flex items-center gap-2">
        <Switch
          id="ai-toggle"
          checked={useAi}
          onCheckedChange={setUseAi}
          aria-label="AI answer toggle"
        />
        <Label htmlFor="ai-toggle">AI answer</Label>
      </div>

      {error && (
        <div
          className="text-destructive text-sm p-3 border border-destructive rounded"
          role="alert"
        >
          {error.message}
        </div>
      )}

      {useAi && chatResult.data && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Answer</CardTitle>
            <Badge variant="secondary" className="w-fit text-xs">
              {chatResult.data.provider} / {chatResult.data.model}
            </Badge>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {chatResult.data.answer}
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && submitted && results.length === 0 && !error && (
        <p className="text-muted-foreground text-sm">No results found.</p>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3">
          {results.map((r, i) => (
            <Card key={i}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {r.score.toFixed(3)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {r.source}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    chunk {r.chunk}
                  </span>
                </div>
                <p className="text-sm">{r.text.slice(0, 200)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/components/query/QueryPane.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/components/query/
git commit -m "feat: QueryPane — search, result cards, AI chat toggle"
```

---

## Task 11: IngestPane

**Files:**
- Create: `studio/src/components/ingest/IngestPane.tsx`
- Create: `studio/src/components/ingest/IngestPane.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/components/ingest/IngestPane.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { IngestPane } from "./IngestPane";
import { useAppStore } from "@/store/app";
import * as dialog from "@tauri-apps/plugin-dialog";

vi.mock("@/api/client", () => ({
  api: {
    ingestFilesStream: vi.fn(),
  },
}));

import { api } from "@/api/client";

async function* makeStream(events: object[]) {
  for (const e of events) yield e;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
});

describe("IngestPane", () => {
  it("renders source path input and start button", () => {
    renderWithProviders(<IngestPane />);
    expect(
      screen.getByRole("textbox", { name: /source directory/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start ingest/i })
    ).toBeInTheDocument();
  });

  it("start button is disabled when source path is empty", () => {
    renderWithProviders(<IngestPane />);
    expect(screen.getByRole("button", { name: /start ingest/i })).toBeDisabled();
  });

  it("browse button calls dialog.open and fills source path", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/my/docs");
    renderWithProviders(<IngestPane />);
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    await waitFor(() => {
      expect(
        (screen.getByRole("textbox", { name: /source directory/i }) as HTMLInputElement).value
      ).toBe("/my/docs");
    });
  });

  it("shows progress items as SSE events arrive", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([
        {
          type: "progress",
          filename: "a.md",
          files_done: 1,
          files_total: 2,
          status: "ingested",
          chunks_stored: 3,
        },
      ]) as any
    );
    renderWithProviders(<IngestPane />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByText("a.md")).toBeInTheDocument();
      expect(screen.getByText("ingested")).toBeInTheDocument();
    });
  });

  it("shows summary card on done event", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([
        {
          type: "done",
          result: {
            sources_found: 3,
            sources_ingested: 3,
            sources_skipped: 0,
            chunks_stored: 12,
            skipped_reasons: [],
          },
        },
      ]) as any
    );
    renderWithProviders(<IngestPane />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByText(/chunks stored: 12/i)).toBeInTheDocument();
    });
  });

  it("shows error card on error event", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([{ type: "error", detail: "Directory not found" }]) as any
    );
    renderWithProviders(<IngestPane />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Directory not found"
      );
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/components/ingest/IngestPane.test.tsx
```

Expected: `Cannot find module './IngestPane'`

- [ ] **Step 3: Create `studio/src/components/ingest/IngestPane.tsx`**

```tsx
import { useState, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";
import type { IngestResultResponse } from "@/api/client";

interface ProgressItem {
  filename: string;
  status: "ingested" | "skipped" | "error";
  chunks_stored: number;
}

const STATUS_VARIANT = {
  ingested: "default" as const,
  skipped: "secondary" as const,
  error: "destructive" as const,
};

export function IngestPane() {
  const { apiUrl, currentDb, currentCollection } = useAppStore();
  const [sourcePath, setSourcePath] = useState("");
  const [chunkSize, setChunkSize] = useState(1000);
  const [overlap, setOverlap] = useState(200);
  const [embeddingModel, setEmbeddingModel] = useState("all-MiniLM-L6-v2");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [result, setResult] = useState<IngestResultResponse | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleBrowse() {
    const selected = await open({
      directory: true,
      title: "Select source directory",
    });
    if (typeof selected === "string") setSourcePath(selected);
  }

  async function handleStart() {
    if (!sourcePath || !currentDb || !currentCollection) return;
    setIsRunning(true);
    setProgress([]);
    setResult(null);
    setStreamError(null);
    abortRef.current = new AbortController();

    try {
      for await (const event of api.ingestFilesStream(
        apiUrl,
        currentDb,
        currentCollection,
        {
          source_dir: sourcePath,
          chunk_size: chunkSize,
          overlap,
          embedding_model: embeddingModel,
        },
        abortRef.current.signal
      )) {
        if (event.type === "progress") {
          setProgress((prev) => [
            ...prev,
            {
              filename: event.filename,
              status: event.status,
              chunks_stored: event.chunks_stored,
            },
          ]);
        } else if (event.type === "done") {
          setResult(event.result);
        } else if (event.type === "error") {
          setStreamError(event.detail);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setStreamError(String(e));
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex gap-2">
        <Input
          value={sourcePath}
          onChange={(e) => setSourcePath(e.target.value)}
          placeholder="/path/to/docs"
          className="flex-1"
          aria-label="Source directory"
        />
        <Button variant="outline" onClick={handleBrowse} aria-label="Browse">
          Browse
        </Button>
      </div>

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground px-0"
          >
            Advanced ▾
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="chunk-size" className="text-xs">
                Chunk size
              </Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="overlap" className="text-xs">
                Overlap
              </Label>
              <Input
                id="overlap"
                type="number"
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="embedding-model" className="text-xs">
              Embedding model
            </Label>
            <Input
              id="embedding-model"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button
        onClick={handleStart}
        disabled={isRunning || !sourcePath}
        aria-label="Start ingest"
      >
        {isRunning ? "Ingesting…" : "Start ingest"}
      </Button>

      {streamError && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive" role="alert">
            {streamError}
          </CardContent>
        </Card>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {progress.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs p-1">
              <Badge variant={STATUS_VARIANT[p.status]} className="text-xs">
                {p.status}
              </Badge>
              <span className="font-mono truncate flex-1">{p.filename}</span>
              <span className="text-muted-foreground">
                {p.chunks_stored} chunks
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>

      {result && (
        <Card>
          <CardContent className="pt-4 text-sm space-y-1">
            <p>
              Found: {result.sources_found} · Ingested:{" "}
              {result.sources_ingested} · Skipped: {result.sources_skipped}
            </p>
            <p>Chunks stored: {result.chunks_stored}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/components/ingest/IngestPane.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/components/ingest/
git commit -m "feat: IngestPane — directory picker, SSE progress, summary card"
```

---

## Task 12: SourcesPane

**Files:**
- Create: `studio/src/components/sources/SourcesPane.tsx`
- Create: `studio/src/components/sources/SourcesPane.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/components/sources/SourcesPane.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SourcesPane } from "./SourcesPane";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useSources: vi.fn(),
  useDeleteSource: vi.fn(),
  usePurgeCollection: vi.fn(),
}));

import { useSources, useDeleteSource, usePurgeCollection } from "@/hooks/useApi";

const mockDeleteMutate = vi.fn().mockResolvedValue({ deleted_chunks: 2 });
const mockPurgeMutate = vi.fn().mockResolvedValue({
  chunks_deleted: 1,
  chunks_checked: 5,
});

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
  vi.mocked(useSources).mockReturnValue({
    data: ["/docs/a.md", "/docs/b.md"],
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useDeleteSource).mockReturnValue({
    mutateAsync: mockDeleteMutate,
    isPending: false,
  } as any);
  vi.mocked(usePurgeCollection).mockReturnValue({
    mutateAsync: mockPurgeMutate,
    isPending: false,
  } as any);
});

describe("SourcesPane", () => {
  it("renders source paths from useSources", () => {
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText("/docs/a.md")).toBeInTheDocument();
    expect(screen.getByText("/docs/b.md")).toBeInTheDocument();
  });

  it("shows empty state when no sources", () => {
    vi.mocked(useSources).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText(/nothing ingested yet/i)).toBeInTheDocument();
  });

  it("clicking delete opens confirmation dialog", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.mouseOver(screen.getByText("/docs/a.md").closest("div")!);
    const deleteBtn = screen.getByRole("button", {
      name: /delete \/docs\/a\.md/i,
    });
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("/docs/a.md")).toBeInTheDocument();
    });
  });

  it("confirming delete calls mutateAsync with source path", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.mouseOver(screen.getByText("/docs/a.md").closest("div")!);
    fireEvent.click(
      screen.getByRole("button", { name: /delete \/docs\/a\.md/i })
    );
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledWith("/docs/a.md");
    });
  });

  it("purge button calls mutateAsync and shows result", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.click(screen.getByRole("button", { name: /purge stale/i }));
    await waitFor(() => {
      expect(mockPurgeMutate).toHaveBeenCalled();
      expect(screen.getByText(/purged 1 chunk/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/components/sources/SourcesPane.test.tsx
```

Expected: `Cannot find module './SourcesPane'`

- [ ] **Step 3: Create `studio/src/components/sources/SourcesPane.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useSources,
  useDeleteSource,
  usePurgeCollection,
} from "@/hooks/useApi";
import { useAppStore } from "@/store/app";

export function SourcesPane() {
  const { apiUrl, currentDb, currentCollection } = useAppStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<{
    deleted: number;
    checked: number;
  } | null>(null);

  const { data: sources = [], isLoading, error } = useSources(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? ""
  );
  const deleteMutation = useDeleteSource(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? ""
  );
  const purgeMutation = usePurgeCollection(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? ""
  );

  async function handlePurge() {
    const res = await purgeMutation.mutateAsync();
    setPurgeResult({ deleted: res.chunks_deleted, checked: res.chunks_checked });
  }

  if (isLoading)
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  if (error)
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {error.message}
      </div>
    );

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Sources ({sources.length})</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePurge}
          disabled={purgeMutation.isPending}
        >
          {purgeMutation.isPending ? "Purging…" : "Purge stale"}
        </Button>
      </div>

      {purgeResult && (
        <p className="text-sm text-muted-foreground">
          Purged {purgeResult.deleted} chunk(s) from {purgeResult.checked}{" "}
          checked.
        </p>
      )}

      {sources.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing ingested yet — go to Ingest.
        </p>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {sources.map((source) => (
            <div
              key={source}
              className="flex items-center justify-between p-2 rounded hover:bg-muted group"
            >
              <span
                className="text-sm font-mono truncate flex-1"
                title={source}
              >
                {source}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(source)}
                aria-label={`Delete ${source}`}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove source</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Remove all chunks for{" "}
            <span className="font-mono">{confirmDelete}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await deleteMutation.mutateAsync(confirmDelete!);
                setConfirmDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/components/sources/SourcesPane.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/components/sources/
git commit -m "feat: SourcesPane — source table, delete dialog, purge button"
```

---

## Task 13: SettingsPane + full test run

**Files:**
- Create: `studio/src/components/settings/SettingsPane.tsx`
- Create: `studio/src/components/settings/SettingsPane.test.tsx`

- [ ] **Step 1: Write the failing tests — `studio/src/components/settings/SettingsPane.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SettingsPane } from "./SettingsPane";
import { useAppStore } from "@/store/app";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
});

describe("SettingsPane", () => {
  it("renders the current API URL in the input", () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", {
      name: /api url/i,
    }) as HTMLInputElement;
    expect(input.value).toBe("http://localhost:8000");
  });

  it("saving updated API URL updates the store", () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "http://localhost:9000" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:9000");
  });

  it("saving empty URL falls back to default", () => {
    renderWithProviders(<SettingsPane />);
    const input = screen.getByRole("textbox", { name: /api url/i });
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:8000");
  });

  it("change project button clears currentDb and currentCollection", () => {
    renderWithProviders(<SettingsPane />);
    fireEvent.click(screen.getByRole("button", { name: /change project/i }));
    expect(useAppStore.getState().currentDb).toBeNull();
    expect(useAppStore.getState().currentCollection).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — verify they FAIL**

```bash
cd studio
npm test -- src/components/settings/SettingsPane.test.tsx
```

Expected: `Cannot find module './SettingsPane'`

- [ ] **Step 3: Create `studio/src/components/settings/SettingsPane.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app";

export function SettingsPane() {
  const { apiUrl, setApiUrl, setCurrentDb, setCurrentCollection } =
    useAppStore();
  const [localApiUrl, setLocalApiUrl] = useState(apiUrl);

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setApiUrl(localApiUrl.trim() || "http://localhost:8000");
  }

  function handleChangeProject() {
    setCurrentDb(null);
    setCurrentCollection(null);
  }

  return (
    <div className="p-6 max-w-md space-y-6">
      <h2 className="font-semibold">Settings</h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-1">
          <Label htmlFor="api-url">API URL</Label>
          <Input
            id="api-url"
            value={localApiUrl}
            onChange={(e) => setLocalApiUrl(e.target.value)}
            placeholder="http://localhost:8000"
            aria-label="API URL"
          />
        </div>
        <Button type="submit" aria-label="Save">
          Save
        </Button>
      </form>
      <div>
        <Button
          variant="outline"
          onClick={handleChangeProject}
          aria-label="Change project"
        >
          Change project
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests — verify they PASS**

```bash
npm test -- src/components/settings/SettingsPane.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Run the full test suite**

```bash
cd studio
npm test
```

Expected: all tests pass (≈ 40 tests across api, store, hooks, pages, components).

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npm run build
```

Expected: exit code 0, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/JG-PERSONNAL/remex
git add studio/src/components/settings/
git commit -m "feat: SettingsPane — API URL field and change-project button"
```
