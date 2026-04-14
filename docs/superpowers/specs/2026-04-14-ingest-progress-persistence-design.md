# Spec H — Ingest Progress Persistence

**Date:** 2026-04-14
**Status:** Approved

---

## Summary

Lift `FilesTab`'s ingest tracking state from local `useState` into the Zustand store so it survives navigation within a session. Add a `lastIngestResult` field to `partialize` so the final result of the last completed ingest is shown on the next app launch.

SQLiteTab is out of scope (different flow, no SSE streaming).

---

## Decisions

- **Session state** (`ingestRunning`, `ingestProgress`, `ingestFilesDone`, `ingestFilesTotal`, `ingestStreamError`) — moved to Zustand, NOT in `partialize`. Survives pane navigation; resets on app restart.
- **Persisted state** (`lastIngestResult`) — added to `partialize`. Shows last completed ingest result on next app launch.
- **`AbortController`** — stays as `useRef` in `FilesTab` (cannot be serialized).
- **Form inputs** (`sourcePath`, `collectionName`, etc.) — stay as `useState` in `FilesTab`. No need to persist.
- **`ProgressItem` type** — moved from `FilesTab` to `store/app.ts` and exported. `FilesTab` imports it from there.

---

## Store changes — `studio/src/store/app.ts`

### New exported types (add above `AppState`):

```typescript
export interface ProgressItem {
  filename: string;
  status: "ingested" | "skipped" | "error";
  chunks_stored: number;
}

export interface LastIngestResult {
  collection: string;
  sourcePath: string;
  completedAt: string; // ISO string
  sourcesFound: number;
  sourcesIngested: number;
  sourcesSkipped: number;
  chunksStored: number;
}
```

### New fields in `AppState` (add after `aiApiKey`):

```typescript
// Ingest session state (not persisted)
ingestRunning: boolean;
ingestProgress: ProgressItem[];
ingestFilesDone: number;
ingestFilesTotal: number;
ingestStreamError: string | null;
// Ingest result (persisted)
lastIngestResult: LastIngestResult | null;
```

### New actions in `AppState` (add after `setAiApiKey`):

```typescript
resetIngestSession: () => void;
appendIngestProgress: (item: ProgressItem) => void;
setIngestFilesDone: (n: number) => void;
setIngestFilesTotal: (n: number) => void;
setIngestRunning: (v: boolean) => void;
setIngestStreamError: (err: string | null) => void;
setLastIngestResult: (r: LastIngestResult | null) => void;
```

### Initial values (add after `aiApiKey: ""`):

```typescript
ingestRunning: false,
ingestProgress: [],
ingestFilesDone: 0,
ingestFilesTotal: 0,
ingestStreamError: null,
lastIngestResult: null,
```

### Action implementations (add after `setAiApiKey`):

```typescript
resetIngestSession: () => set({
  ingestRunning: false,
  ingestProgress: [],
  ingestFilesDone: 0,
  ingestFilesTotal: 0,
  ingestStreamError: null,
}),

appendIngestProgress: (item) =>
  set({ ingestProgress: [...get().ingestProgress, item] }),

setIngestFilesDone:    (n)   => set({ ingestFilesDone: n }),
setIngestFilesTotal:   (n)   => set({ ingestFilesTotal: n }),
setIngestRunning:      (v)   => set({ ingestRunning: v }),
setIngestStreamError:  (err) => set({ ingestStreamError: err }),
setLastIngestResult:   (r)   => set({ lastIngestResult: r }),
```

### `partialize` — add `lastIngestResult`:

```typescript
partialize: (state) => ({
  recentProjects:    state.recentProjects,
  queryHistory:      state.queryHistory,
  apiUrl:            state.apiUrl,
  darkMode:          state.darkMode,
  theme:             state.theme,
  aiProvider:        state.aiProvider,
  aiModel:           state.aiModel,
  aiApiKey:          state.aiApiKey,
  lastIngestResult:  state.lastIngestResult,
}),
```

---

## Store tests — `studio/src/store/app.test.ts`

Add these 3 tests and reset ingest session state in `beforeEach`:

### `beforeEach` addition:

Add to the existing `useAppStore.setState({...})` call:

```typescript
ingestRunning: false,
ingestProgress: [],
ingestFilesDone: 0,
ingestFilesTotal: 0,
ingestStreamError: null,
lastIngestResult: null,
```

### New tests:

```typescript
it("resetIngestSession zeroes all session ingest fields", () => {
  useAppStore.setState({
    ingestRunning: true,
    ingestProgress: [{ filename: "a.md", status: "ingested", chunks_stored: 3 }],
    ingestFilesDone: 1,
    ingestFilesTotal: 2,
    ingestStreamError: "oops",
  } as any);
  useAppStore.getState().resetIngestSession();
  const s = useAppStore.getState();
  expect(s.ingestRunning).toBe(false);
  expect(s.ingestProgress).toHaveLength(0);
  expect(s.ingestFilesDone).toBe(0);
  expect(s.ingestFilesTotal).toBe(0);
  expect(s.ingestStreamError).toBeNull();
});

it("appendIngestProgress appends an item", () => {
  useAppStore.getState().appendIngestProgress({ filename: "b.md", status: "skipped", chunks_stored: 0 });
  useAppStore.getState().appendIngestProgress({ filename: "c.md", status: "ingested", chunks_stored: 5 });
  const { ingestProgress } = useAppStore.getState();
  expect(ingestProgress).toHaveLength(2);
  expect(ingestProgress[1].filename).toBe("c.md");
});

it("setLastIngestResult persists the result", () => {
  useAppStore.getState().setLastIngestResult({
    collection: "docs",
    sourcePath: "/my/docs",
    completedAt: "2026-04-14T10:00:00.000Z",
    sourcesFound: 3,
    sourcesIngested: 3,
    sourcesSkipped: 0,
    chunksStored: 12,
  });
  const { lastIngestResult } = useAppStore.getState();
  expect(lastIngestResult?.collection).toBe("docs");
  expect(lastIngestResult?.chunksStored).toBe(12);
});
```

---

## FilesTab changes — `studio/src/components/ingest/FilesTab.tsx`

### Type import change:

Remove the local `ProgressItem` interface definition. Import it from the store instead:

```typescript
import { useAppStore } from "@/store/app";
import type { ProgressItem } from "@/store/app";
```

### State changes:

Remove these 6 `useState` calls:

```typescript
// REMOVE:
const [isRunning,   setIsRunning]   = useState(false);
const [progress,    setProgress]    = useState<ProgressItem[]>([]);
const [filesDone,   setFilesDone]   = useState(0);
const [filesTotal,  setFilesTotal]  = useState(0);
const [result,      setResult]      = useState<IngestResultResponse | null>(null);
const [streamError, setStreamError] = useState<string | null>(null);
```

Replace store destructure with:

```typescript
const {
  apiUrl, currentDb, currentCollection,
  ingestRunning, ingestProgress, ingestFilesDone, ingestFilesTotal,
  ingestStreamError, lastIngestResult,
  resetIngestSession, appendIngestProgress,
  setIngestFilesDone, setIngestFilesTotal,
  setIngestRunning, setIngestStreamError, setLastIngestResult,
} = useAppStore();
```

Replace all references to old local state variables:
- `isRunning` → `ingestRunning`
- `progress` → `ingestProgress`
- `filesDone` → `ingestFilesDone`
- `filesTotal` → `ingestFilesTotal`
- `streamError` → `ingestStreamError`
- `result` → remove (use `lastIngestResult` for display)

### `handleStart` changes:

Replace the 5 individual `setState` calls at the top of `handleStart` with `resetIngestSession()`:

```typescript
async function handleStart() {
  if (!sourcePath || !currentDb || !effectiveCollection) return;
  resetIngestSession();
  setIngestRunning(true);
  abortRef.current = new AbortController();
  // ...
}
```

In the `progress` event handler:
```typescript
if (event.type === "progress") {
  setIngestFilesDone(event.files_done);
  setIngestFilesTotal(event.files_total);
  appendIngestProgress({
    filename:      event.filename,
    status:        event.status,
    chunks_stored: event.chunks_stored,
  });
}
```

In the `done` event handler, add the `setLastIngestResult` call alongside existing logic:
```typescript
} else if (event.type === "done") {
  setLastIngestResult({
    collection:       effectiveCollection,
    sourcePath,
    completedAt:      new Date().toISOString(),
    sourcesFound:     event.result.sources_found,
    sourcesIngested:  event.result.sources_ingested,
    sourcesSkipped:   event.result.sources_skipped,
    chunksStored:     event.result.chunks_stored,
  });
  queryClient.invalidateQueries({
    queryKey: ["sources", apiUrl, currentDb, effectiveCollection],
  });
  if (event.result.sources_ingested > 0) {
    sendNotification({
      title: "Remex — Ingest complete",
      body:  `${event.result.sources_ingested} files ingested · ${event.result.chunks_stored} chunks stored`,
    });
  }
}
```

In the `error` handler:
```typescript
} else if (event.type === "error") {
  setIngestStreamError(event.detail);
}
```

In `finally`:
```typescript
} finally {
  setIngestRunning(false);
}
```

### `IngestResultResponse` import:

The local `result` state is removed. The `IngestResultResponse` type import from `@/api/client` is no longer needed — remove it.

### Progress bar display:

Replace `isRunning` / `filesTotal` / `filesDone` references:

```tsx
{(ingestRunning || (ingestFilesTotal > 0 && !ingestStreamError)) && (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>{ingestRunning ? "Ingesting…" : "Done"}</span>
      <span className="tabular-nums">
        {ingestFilesDone} / {ingestFilesTotal > 0 ? ingestFilesTotal : "?"}
      </span>
    </div>
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{
          width: ingestFilesTotal > 0
            ? `${Math.round((ingestFilesDone / ingestFilesTotal) * 100)}%`
            : ingestRunning ? "5%" : "0%",
        }}
      />
    </div>
  </div>
)}
```

### Result display:

Replace the existing `{result && <Card>...}` block with:

```tsx
{lastIngestResult && (
  <Card>
    <CardContent className="pt-4 text-sm space-y-1">
      {!ingestRunning && (
        <p className="text-xs text-muted-foreground mb-1">
          Last ingest · {new Date(lastIngestResult.completedAt).toLocaleString()}
        </p>
      )}
      <p>
        Found: {lastIngestResult.sourcesFound} · Ingested:{" "}
        {lastIngestResult.sourcesIngested} · Skipped: {lastIngestResult.sourcesSkipped}
      </p>
      <p>Chunks stored: {lastIngestResult.chunksStored}</p>
    </CardContent>
  </Card>
)}
```

### Start button and scroll area:

Replace `isRunning` with `ingestRunning` and `progress` with `ingestProgress`:

```tsx
<Button
  onClick={handleStart}
  disabled={ingestRunning || !sourcePath || !effectiveCollection}
  aria-label="Start ingest"
>
  <Play className="w-4 h-4 mr-2" />
  {ingestRunning ? "Ingesting…" : "Start ingest"}
</Button>
```

```tsx
{ingestProgress.map((p, i) => ( ... ))}
{ingestRunning && ( <Loader2 spinner row> )}
```

---

## FilesTab tests — `studio/src/components/ingest/FilesTab.test.tsx`

The 7 existing tests continue to work without changes. The `useAppStore.setState` call in `beforeEach` already covers `apiUrl`, `currentDb`, `currentCollection`. The mock stream events drive state through the store actions now instead of local `useState`, but the rendered output is identical. No new test cases needed.

The only change: add the new ingest session fields to the `beforeEach` reset:

```typescript
beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
    ingestRunning: false,
    ingestProgress: [],
    ingestFilesDone: 0,
    ingestFilesTotal: 0,
    ingestStreamError: null,
    lastIngestResult: null,
  } as any);
  vi.mocked(sendNotification).mockClear();
});
```

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/store/app.ts` | Add `ProgressItem`, `LastIngestResult` types; 6 new state fields; 7 new actions; `lastIngestResult` in `partialize` |
| `studio/src/store/app.test.ts` | Update `beforeEach`; add 3 new tests |
| `studio/src/components/ingest/FilesTab.tsx` | Replace 6 `useState` with store; update `handleStart`; update result display; remove `IngestResultResponse` import |
| `studio/src/components/ingest/FilesTab.test.tsx` | Update `beforeEach` to reset new store fields |

---

## Out of Scope

- SQLiteTab persistence (different flow, no SSE)
- Persisting form inputs (`sourcePath`, `collectionName`, etc.)
- Resuming an interrupted ingest after app restart
- Per-tab (Files vs SQLite) last result display
