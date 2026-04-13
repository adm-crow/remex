# Spec A — Ingest Enhancements

**Date:** 2026-04-13
**Status:** Approved

---

## Summary

Three improvements to the Ingest pane in Remex Studio:

1. **SQLite tab** — ingest SQLite database tables directly from the GUI (alongside the existing Files tab)
2. **Drag-and-drop** — drop a folder onto the Files tab to populate the source path
3. **Ingest finish notification** — OS notification when a file ingest completes

---

## Architecture

`IngestPane.tsx` (337 lines) is split into a thin container + two tab components. This keeps each file focused and independently testable.

### File Structure

| File | Change |
|------|--------|
| `studio/src/components/ingest/IngestPane.tsx` | Refactored: thin container with tab switcher ("Files" \| "SQLite") |
| `studio/src/components/ingest/FilesTab.tsx` | New: extracted from current IngestPane — files ingest UI |
| `studio/src/components/ingest/SQLiteTab.tsx` | New: SQLite ingest UI |
| `studio/src/hooks/useDragDrop.ts` | New: Tauri window drag-drop event hook |
| `studio/src/api/client.ts` | Modified: add `listSqliteTables(apiUrl, dbPath, sqlitePath)` |
| `remex/api/routes/collections.py` | Modified: add `GET /sqlite/tables` endpoint |
| `remex/api/schemas.py` | Modified: add `SQLiteTablesResponse` schema |
| `studio/src-tauri/Cargo.toml` | Modified: add `tauri-plugin-notification = "2"` |
| `studio/src-tauri/src/lib.rs` | Modified: register notification plugin |
| `studio/src-tauri/capabilities/default.json` | Modified: add `notification:default`, `core:window:allow-on-drag-drop-event` |

---

## Feature 1: SQLite Tab

### Backend

New endpoint added to `remex/api/routes/collections.py`:

```
GET /sqlite/tables?path=<sqlite_path>&db_path=<db_path>
```

- Opens the file with Python's built-in `sqlite3` (no new dependency)
- Queries `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
- Returns `SQLiteTablesResponse` — a list of table name strings
- Returns 400 if the file doesn't exist or isn't a valid SQLite file

New schema in `remex/api/schemas.py`:

```python
class SQLiteTablesResponse(BaseModel):
    tables: list[str]
```

### Frontend — SQLiteTab

**Fields (always visible):**
- SQLite file path: text input + Browse button (dialog filtered to `.db`, `.sqlite`, `.sqlite3`)
- Table: dropdown, disabled until path is entered; fires `listSqliteTables()` on path change; shows spinner while loading; shows inline error if file is unreadable
- Collection name: same as FilesTab

**Advanced collapsible (same pattern as FilesTab):**
- Columns: comma-separated text input (maps to `columns: string[]`)
- ID column: text input (default `id`)
- Row template: textarea (optional Jinja-style template)
- Embedding model picker: identical to FilesTab

**Run behaviour:**
- Calls existing `POST /collections/{collection}/ingest/sqlite` (blocking, no SSE)
- Shows spinner while running, result card on completion, error alert on failure
- No streaming — SQLite row ingestion is fast; streaming endpoint would require new backend work (out of scope)

---

## Feature 2: Drag-and-Drop

### Hook — `useDragDrop`

```typescript
// studio/src/hooks/useDragDrop.ts
function useDragDrop(onDrop: (path: string) => void): { isDragging: boolean }
```

- Calls `getCurrentWindow().onDragDropEvent()` from `@tauri-apps/api/window`
- On `"drop"` event: takes `event.payload.paths[0]`, calls `onDrop`
- On `"enter"` / `"leave"` events: toggles `isDragging` state
- Cleanup: unlistens on unmount

### Usage in FilesTab

- `useDragDrop((path) => setSourcePath(path))`
- When `isDragging === true`: source directory input container gets a dashed `border-primary` border + `bg-primary/5` tint
- No separate drop overlay — the existing input area is the drop target

### Capability

Add to `studio/src-tauri/capabilities/default.json`:
```json
"core:window:allow-on-drag-drop-event"
```

---

## Feature 3: Ingest Finish Notification

### Setup

`studio/src-tauri/Cargo.toml`:
```toml
tauri-plugin-notification = "2"
```

`studio/src-tauri/src/lib.rs`:
```rust
tauri_plugin_notification::init()
```
registered alongside existing plugins.

`studio/src-tauri/capabilities/default.json`:
```json
"notification:default"
```

### Trigger (in FilesTab)

After the SSE `done` event:

```typescript
import { sendNotification } from "@tauri-apps/plugin-notification";

if (result.sources_ingested > 0) {
  sendNotification({
    title: "Remex — Ingest complete",
    body: `${result.sources_ingested} files ingested · ${result.chunks_stored} chunks stored`,
  });
}
```

- Only fires on success (`done` event), not on error
- Skipped if `sources_ingested === 0` (nothing new was ingested)

---

## Out of Scope

- SSE streaming for SQLite ingest (the blocking endpoint is sufficient)
- App-wide drag-and-drop (only FilesTab is a drop target)
- Notification for SQLite ingest (fast enough that it's not needed)
- Drag-and-drop on SQLiteTab
