# Ingest Progress Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift `FilesTab`'s ingest tracking state into Zustand so it survives pane navigation, and persist the last completed ingest result to localStorage for display on the next app launch.

**Architecture:** Session-only fields (`ingestRunning`, `ingestProgress`, `ingestFilesDone`, `ingestFilesTotal`, `ingestStreamError`) go into Zustand without `partialize`. `lastIngestResult` is added to `partialize` so it survives restarts. `FilesTab` replaces 6 `useState` calls with store destructuring; form inputs and `AbortController` stay local.

**Tech Stack:** React 19, TypeScript, Zustand with `persist` middleware, Vitest, Testing Library (`@testing-library/react`)

---

### Task 1: Store — ingest state fields, types, and actions

**Files:**
- Modify: `studio/src/store/app.ts`
- Modify: `studio/src/store/app.test.ts`

---

#### Current state of `studio/src/store/app.ts` (full file, for reference):

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export type Theme = "default" | "blue" | "purple" | "green" | "rose" | "amber" | "teal" | "coral";

export interface AppState {
  currentDb: string | null;
  currentCollection: string | null;
  recentProjects: RecentProject[];
  queryHistory: string[];
  apiUrl: string;
  sidecarStatus: "starting" | "connected" | "error";
  darkMode: boolean;
  theme: Theme;
  aiProvider: string;
  aiModel: string;
  aiApiKey: string;
  // Actions
  setCurrentDb: (db: string | null) => void;
  setCurrentCollection: (col: string | null) => void;
  addRecentProject: (path: string) => void;
  removeRecentProject: (path: string) => void;
  addQueryHistory: (text: string) => void;
  removeQueryHistory: (text: string) => void;
  clearQueryHistory: () => void;
  setApiUrl: (url: string) => void;
  setSidecarStatus: (status: AppState["sidecarStatus"]) => void;
  setDarkMode: (dark: boolean) => void;
  setTheme: (theme: Theme) => void;
  setAiProvider: (provider: string) => void;
  setAiModel: (model: string) => void;
  setAiApiKey: (key: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentDb: null,
      currentCollection: null,
      recentProjects: [],
      queryHistory: [],
      apiUrl: "http://localhost:8000",
      sidecarStatus: "starting",
      darkMode: false,
      theme: "default",
      aiProvider: "",
      aiModel: "",
      aiApiKey: "",

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

      removeRecentProject: (path) => {
        set({
          recentProjects: get().recentProjects.filter((p) => p.path !== path),
        });
      },

      addQueryHistory: (text) => {
        const filtered = get().queryHistory.filter((q) => q !== text);
        set({ queryHistory: [text, ...filtered].slice(0, 20) });
      },

      removeQueryHistory: (text) => {
        set({ queryHistory: get().queryHistory.filter((q) => q !== text) });
      },

      clearQueryHistory: () => {
        set({ queryHistory: [] });
      },

      setApiUrl: (url) => set({ apiUrl: url }),
      setSidecarStatus: (status) => set({ sidecarStatus: status }),
      setDarkMode: (dark) => set({ darkMode: dark }),
      setTheme: (theme) => set({ theme }),
      setAiProvider: (provider) => set({ aiProvider: provider }),
      setAiModel: (model) => set({ aiModel: model }),
      setAiApiKey: (key) => set({ aiApiKey: key }),
    }),
    {
      name: "remex-studio",
      partialize: (state) => ({
        recentProjects: state.recentProjects,
        queryHistory:   state.queryHistory,
        apiUrl:         state.apiUrl,
        darkMode:       state.darkMode,
        theme:          state.theme,
        aiProvider:     state.aiProvider,
        aiModel:        state.aiModel,
        aiApiKey:       state.aiApiKey,
      }),
    }
  )
);
```

---

- [ ] **Step 1: Add 3 failing tests to `studio/src/store/app.test.ts`**

The current `beforeEach` resets a subset of store state. It needs the new fields too, but they don't exist yet — the tests will fail because the actions are missing.

First, update the `beforeEach` to reset the new fields (add after `sidecarStatus: "starting"`):

```typescript
beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    queryHistory: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
    ingestRunning: false,
    ingestProgress: [],
    ingestFilesDone: 0,
    ingestFilesTotal: 0,
    ingestStreamError: null,
    lastIngestResult: null,
  } as any);
});
```

Then add these 3 tests inside the existing `describe("useAppStore", ...)` block, after the existing tests:

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

it("appendIngestProgress appends items in order", () => {
  useAppStore.getState().appendIngestProgress({ filename: "b.md", status: "skipped", chunks_stored: 0 });
  useAppStore.getState().appendIngestProgress({ filename: "c.md", status: "ingested", chunks_stored: 5 });
  const { ingestProgress } = useAppStore.getState();
  expect(ingestProgress).toHaveLength(2);
  expect(ingestProgress[0].filename).toBe("b.md");
  expect(ingestProgress[1].filename).toBe("c.md");
});

it("setLastIngestResult saves the result", () => {
  useAppStore.getState().setLastIngestResult({
    collection:      "docs",
    sourcePath:      "/my/docs",
    completedAt:     "2026-04-14T10:00:00.000Z",
    sourcesFound:    3,
    sourcesIngested: 3,
    sourcesSkipped:  0,
    chunksStored:    12,
  });
  const { lastIngestResult } = useAppStore.getState();
  expect(lastIngestResult?.collection).toBe("docs");
  expect(lastIngestResult?.chunksStored).toBe(12);
});
```

- [ ] **Step 2: Run tests to confirm the 3 new tests fail**

```bash
cd studio && npm test -- --run --reporter=verbose app.test
```

Expected: 3 new tests FAIL (actions don't exist yet), all existing tests PASS.

- [ ] **Step 3: Implement the store changes in `studio/src/store/app.ts`**

Replace the full file with:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentProject {
  path: string;
  lastOpened: string;
}

export type Theme = "default" | "blue" | "purple" | "green" | "rose" | "amber" | "teal" | "coral";

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

export interface AppState {
  currentDb: string | null;
  currentCollection: string | null;
  recentProjects: RecentProject[];
  queryHistory: string[];
  apiUrl: string;
  sidecarStatus: "starting" | "connected" | "error";
  darkMode: boolean;
  theme: Theme;
  aiProvider: string;
  aiModel: string;
  aiApiKey: string;
  // Ingest session state (not persisted)
  ingestRunning: boolean;
  ingestProgress: ProgressItem[];
  ingestFilesDone: number;
  ingestFilesTotal: number;
  ingestStreamError: string | null;
  // Ingest result (persisted)
  lastIngestResult: LastIngestResult | null;
  // Actions
  setCurrentDb: (db: string | null) => void;
  setCurrentCollection: (col: string | null) => void;
  addRecentProject: (path: string) => void;
  removeRecentProject: (path: string) => void;
  addQueryHistory: (text: string) => void;
  removeQueryHistory: (text: string) => void;
  clearQueryHistory: () => void;
  setApiUrl: (url: string) => void;
  setSidecarStatus: (status: AppState["sidecarStatus"]) => void;
  setDarkMode: (dark: boolean) => void;
  setTheme: (theme: Theme) => void;
  setAiProvider: (provider: string) => void;
  setAiModel: (model: string) => void;
  setAiApiKey: (key: string) => void;
  resetIngestSession: () => void;
  appendIngestProgress: (item: ProgressItem) => void;
  setIngestFilesDone: (n: number) => void;
  setIngestFilesTotal: (n: number) => void;
  setIngestRunning: (v: boolean) => void;
  setIngestStreamError: (err: string | null) => void;
  setLastIngestResult: (r: LastIngestResult | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentDb: null,
      currentCollection: null,
      recentProjects: [],
      queryHistory: [],
      apiUrl: "http://localhost:8000",
      sidecarStatus: "starting",
      darkMode: false,
      theme: "default",
      aiProvider: "",
      aiModel: "",
      aiApiKey: "",
      ingestRunning: false,
      ingestProgress: [],
      ingestFilesDone: 0,
      ingestFilesTotal: 0,
      ingestStreamError: null,
      lastIngestResult: null,

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

      removeRecentProject: (path) => {
        set({
          recentProjects: get().recentProjects.filter((p) => p.path !== path),
        });
      },

      addQueryHistory: (text) => {
        const filtered = get().queryHistory.filter((q) => q !== text);
        set({ queryHistory: [text, ...filtered].slice(0, 20) });
      },

      removeQueryHistory: (text) => {
        set({ queryHistory: get().queryHistory.filter((q) => q !== text) });
      },

      clearQueryHistory: () => {
        set({ queryHistory: [] });
      },

      setApiUrl:         (url)    => set({ apiUrl: url }),
      setSidecarStatus:  (status) => set({ sidecarStatus: status }),
      setDarkMode:       (dark)   => set({ darkMode: dark }),
      setTheme:          (theme)  => set({ theme }),
      setAiProvider:     (provider) => set({ aiProvider: provider }),
      setAiModel:        (model)  => set({ aiModel: model }),
      setAiApiKey:       (key)    => set({ aiApiKey: key }),

      resetIngestSession: () => set({
        ingestRunning:    false,
        ingestProgress:   [],
        ingestFilesDone:  0,
        ingestFilesTotal: 0,
        ingestStreamError: null,
      }),

      appendIngestProgress: (item) =>
        set({ ingestProgress: [...get().ingestProgress, item] }),

      setIngestFilesDone:   (n)   => set({ ingestFilesDone: n }),
      setIngestFilesTotal:  (n)   => set({ ingestFilesTotal: n }),
      setIngestRunning:     (v)   => set({ ingestRunning: v }),
      setIngestStreamError: (err) => set({ ingestStreamError: err }),
      setLastIngestResult:  (r)   => set({ lastIngestResult: r }),
    }),
    {
      name: "remex-studio",
      partialize: (state) => ({
        recentProjects:   state.recentProjects,
        queryHistory:     state.queryHistory,
        apiUrl:           state.apiUrl,
        darkMode:         state.darkMode,
        theme:            state.theme,
        aiProvider:       state.aiProvider,
        aiModel:          state.aiModel,
        aiApiKey:         state.aiApiKey,
        lastIngestResult: state.lastIngestResult,
      }),
    }
  )
);
```

- [ ] **Step 4: Run the store tests to confirm all pass**

```bash
cd studio && npm test -- --run --reporter=verbose app.test
```

Expected: all store tests PASS (the 3 new ones + all existing ones).

- [ ] **Step 5: Commit**

```bash
git add studio/src/store/app.ts studio/src/store/app.test.ts
git commit -m "feat(store): add ingest session state and lastIngestResult to app store"
```

---

### Task 2: FilesTab — replace local state with store

**Files:**
- Modify: `studio/src/components/ingest/FilesTab.tsx`
- Modify: `studio/src/components/ingest/FilesTab.test.tsx`

---

#### Current state of `studio/src/components/ingest/FilesTab.tsx` (full file, for reference):

```tsx
import { useState, useRef } from "react";
import { Play, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDragDrop } from "@/hooks/useDragDrop";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
  skipped:  "secondary" as const,
  error:    "destructive" as const,
};

export function FilesTab() {
  const queryClient = useQueryClient();
  const { apiUrl, currentDb, currentCollection } = useAppStore();

  const [sourcePath,       setSourcePath]       = useState("");
  const [collectionName,   setCollectionName]   = useState(currentCollection ?? "");
  const [appendModel,      setAppendModel]      = useState(false);
  const [chunkSize,        setChunkSize]        = useState(1000);
  const [overlap,          setOverlap]          = useState(200);
  const [embeddingModel,   setEmbeddingModel]   = useState("all-MiniLM-L6-v2");
  const [isRunning,        setIsRunning]        = useState(false);
  const [progress,         setProgress]         = useState<ProgressItem[]>([]);
  const [filesDone,        setFilesDone]        = useState(0);
  const [filesTotal,       setFilesTotal]       = useState(0);
  const [result,           setResult]           = useState<IngestResultResponse | null>(null);
  const [streamError,      setStreamError]      = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { isDragging } = useDragDrop((path) => setSourcePath(path));

  const effectiveCollection = appendModel
    ? `${collectionName}-${embeddingModel}`.replace(/[^a-zA-Z0-9_-]/g, "-")
    : collectionName;

  async function handleBrowse() {
    const selected = await open({
      directory: true,
      title: "Select source directory",
    });
    if (typeof selected === "string") setSourcePath(selected);
  }

  async function handleStart() {
    if (!sourcePath || !currentDb || !effectiveCollection) return;
    setIsRunning(true);
    setProgress([]);
    setFilesDone(0);
    setFilesTotal(0);
    setResult(null);
    setStreamError(null);
    abortRef.current = new AbortController();

    try {
      for await (const event of api.ingestFilesStream(
        apiUrl,
        currentDb,
        effectiveCollection,
        {
          source_dir:      sourcePath,
          chunk_size:      chunkSize,
          overlap,
          embedding_model: embeddingModel,
        },
        abortRef.current.signal
      )) {
        if (event.type === "progress") {
          setFilesDone(event.files_done);
          setFilesTotal(event.files_total);
          setProgress((prev) => [
            ...prev,
            {
              filename:      event.filename,
              status:        event.status,
              chunks_stored: event.chunks_stored,
            },
          ]);
        } else if (event.type === "done") {
          setResult(event.result);
          queryClient.invalidateQueries({
            queryKey: ["sources", apiUrl, currentDb, effectiveCollection],
          });
          if (event.result.sources_ingested > 0) {
            sendNotification({
              title: "Remex — Ingest complete",
              body: `${event.result.sources_ingested} files ingested · ${event.result.chunks_stored} chunks stored`,
            });
          }
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
      {/* Directory picker */}
      <div
        className={cn(
          "space-y-1 rounded-lg p-1 -m-1 transition-colors",
          isDragging && "bg-primary/5 ring-2 ring-dashed ring-primary/50"
        )}
      >
        <Label className="text-xs text-muted-foreground">Source directory</Label>
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
      </div>

      {/* Collection name */}
      <div className="space-y-1">
        <Label htmlFor="collection-name" className="text-xs text-muted-foreground">
          Collection name
        </Label>
        <Input
          id="collection-name"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder={currentCollection ?? "collection"}
          className="h-8 text-sm"
        />
      </div>

      {/* Append model toggle */}
      <div className="flex items-center gap-2">
        <Switch
          id="append-model"
          checked={appendModel}
          onCheckedChange={setAppendModel}
          aria-label="Append embedding model to collection name"
        />
        <Label htmlFor="append-model" className="text-sm">
          Append embedding model to name
        </Label>
      </div>

      {appendModel && (
        <p className="text-xs text-muted-foreground -mt-2">
          Will ingest into:{" "}
          <span className="font-mono font-medium text-foreground">
            {effectiveCollection || "—"}
          </span>
        </p>
      )}

      {/* Advanced settings */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground px-0">
            Advanced ▾
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="chunk-size" className="text-xs">Chunk size</Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="overlap" className="text-xs">Overlap</Label>
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
          <div className="space-y-1.5 pt-1">
            <p className="text-xs text-muted-foreground">
              The model used at ingest time <strong className="text-foreground">must match</strong> query time.
            </p>
            {[
              { tag: "Light",        tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", model: "all-MiniLM-L6-v2",                     desc: "22 MB · fast, good for most cases" },
              { tag: "Large",        tagColor: "bg-primary/15 text-primary",                               model: "BAAI/bge-large-en-v1.5",                desc: "1.3 GB · best English accuracy" },
              { tag: "Multilingual", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",       model: "paraphrase-multilingual-MiniLM-L12-v2", desc: "470 MB · 50+ languages" },
            ].map(({ tag, tagColor, model, desc }) => (
              <button
                key={model}
                type="button"
                className="w-full text-left rounded border bg-muted/30 px-2 py-1 hover:bg-muted/60 transition-colors"
                onClick={() => setEmbeddingModel(model)}
                title={`Use ${model}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${tagColor}`}>{tag}</span>
                  <span className="font-mono text-[11px] truncate">{model}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
            <div className="flex flex-col gap-1 pt-0.5">
              {[
                { label: "SBERT pretrained models",         href: "https://www.sbert.net/docs/pretrained_models.html" },
                { label: "HuggingFace sentence-similarity", href: "https://huggingface.co/models?pipeline_tag=sentence-similarity&sort=downloads" },
                { label: "Ollama embedding models",         href: "https://ollama.com/search?c=embedding" },
              ].map(({ label, href }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline w-fit">
                  <ExternalLink className="w-3 h-3 shrink-0" />{label}
                </a>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button
        onClick={handleStart}
        disabled={isRunning || !sourcePath || !effectiveCollection}
        aria-label="Start ingest"
      >
        <Play className="w-4 h-4 mr-2" />
        {isRunning ? "Ingesting…" : "Start ingest"}
      </Button>

      {(isRunning || (filesTotal > 0 && !streamError)) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isRunning ? "Ingesting…" : "Done"}</span>
            <span className="tabular-nums">
              {filesDone} / {filesTotal > 0 ? filesTotal : "?"}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: filesTotal > 0
                  ? `${Math.round((filesDone / filesTotal) * 100)}%`
                  : isRunning ? "5%" : "0%",
              }}
            />
          </div>
        </div>
      )}

      {streamError && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{streamError}</span>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {progress.map((p, i) => (
            <div
              key={`${p.filename}-${i}`}
              className="flex items-center gap-2 text-xs p-1"
            >
              <Badge variant={STATUS_VARIANT[p.status]} className="text-xs shrink-0">
                {p.status}
              </Badge>
              <span className="font-mono truncate flex-1">{p.filename}</span>
              <span className="text-muted-foreground shrink-0">
                {p.chunks_stored} chunks
              </span>
            </div>
          ))}
          {isRunning && (
            <div className="flex items-center gap-2 text-xs p-1 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
              <span className="truncate flex-1">
                {filesTotal > 0
                  ? `Processing file ${filesDone + 1} of ${filesTotal}…`
                  : "Starting ingestion…"}
              </span>
            </div>
          )}
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

---

- [ ] **Step 1: Update `beforeEach` in `studio/src/components/ingest/FilesTab.test.tsx`**

The existing `beforeEach` sets a partial store state. Add the new ingest session fields so they reset cleanly between tests:

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

- [ ] **Step 2: Run existing FilesTab tests to confirm they still pass before changing the component**

```bash
cd studio && npm test -- --run --reporter=verbose FilesTab
```

Expected: all 7 tests PASS.

- [ ] **Step 3: Replace `FilesTab.tsx` with the updated implementation**

Replace the full file with:

```tsx
import { useState, useRef } from "react";
import { Play, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDragDrop } from "@/hooks/useDragDrop";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";
import type { ProgressItem } from "@/store/app";

const STATUS_VARIANT = {
  ingested: "default" as const,
  skipped:  "secondary" as const,
  error:    "destructive" as const,
};

export function FilesTab() {
  const queryClient = useQueryClient();
  const {
    apiUrl, currentDb, currentCollection,
    ingestRunning, ingestProgress, ingestFilesDone, ingestFilesTotal,
    ingestStreamError, lastIngestResult,
    resetIngestSession, appendIngestProgress,
    setIngestFilesDone, setIngestFilesTotal,
    setIngestRunning, setIngestStreamError, setLastIngestResult,
  } = useAppStore();

  const [sourcePath,     setSourcePath]     = useState("");
  const [collectionName, setCollectionName] = useState(currentCollection ?? "");
  const [appendModel,    setAppendModel]    = useState(false);
  const [chunkSize,      setChunkSize]      = useState(1000);
  const [overlap,        setOverlap]        = useState(200);
  const [embeddingModel, setEmbeddingModel] = useState("all-MiniLM-L6-v2");
  const abortRef = useRef<AbortController | null>(null);
  const { isDragging } = useDragDrop((path) => setSourcePath(path));

  const effectiveCollection = appendModel
    ? `${collectionName}-${embeddingModel}`.replace(/[^a-zA-Z0-9_-]/g, "-")
    : collectionName;

  async function handleBrowse() {
    const selected = await open({
      directory: true,
      title: "Select source directory",
    });
    if (typeof selected === "string") setSourcePath(selected);
  }

  async function handleStart() {
    if (!sourcePath || !currentDb || !effectiveCollection) return;
    resetIngestSession();
    setIngestRunning(true);
    abortRef.current = new AbortController();

    try {
      for await (const event of api.ingestFilesStream(
        apiUrl,
        currentDb,
        effectiveCollection,
        {
          source_dir:      sourcePath,
          chunk_size:      chunkSize,
          overlap,
          embedding_model: embeddingModel,
        },
        abortRef.current.signal
      )) {
        if (event.type === "progress") {
          setIngestFilesDone(event.files_done);
          setIngestFilesTotal(event.files_total);
          appendIngestProgress({
            filename:      event.filename,
            status:        event.status,
            chunks_stored: event.chunks_stored,
          });
        } else if (event.type === "done") {
          setLastIngestResult({
            collection:      effectiveCollection,
            sourcePath,
            completedAt:     new Date().toISOString(),
            sourcesFound:    event.result.sources_found,
            sourcesIngested: event.result.sources_ingested,
            sourcesSkipped:  event.result.sources_skipped,
            chunksStored:    event.result.chunks_stored,
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
        } else if (event.type === "error") {
          setIngestStreamError(event.detail);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setIngestStreamError(String(e));
      }
    } finally {
      setIngestRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      {/* Directory picker */}
      <div
        className={cn(
          "space-y-1 rounded-lg p-1 -m-1 transition-colors",
          isDragging && "bg-primary/5 ring-2 ring-dashed ring-primary/50"
        )}
      >
        <Label className="text-xs text-muted-foreground">Source directory</Label>
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
      </div>

      {/* Collection name */}
      <div className="space-y-1">
        <Label htmlFor="collection-name" className="text-xs text-muted-foreground">
          Collection name
        </Label>
        <Input
          id="collection-name"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder={currentCollection ?? "collection"}
          className="h-8 text-sm"
        />
      </div>

      {/* Append model toggle */}
      <div className="flex items-center gap-2">
        <Switch
          id="append-model"
          checked={appendModel}
          onCheckedChange={setAppendModel}
          aria-label="Append embedding model to collection name"
        />
        <Label htmlFor="append-model" className="text-sm">
          Append embedding model to name
        </Label>
      </div>

      {appendModel && (
        <p className="text-xs text-muted-foreground -mt-2">
          Will ingest into:{" "}
          <span className="font-mono font-medium text-foreground">
            {effectiveCollection || "—"}
          </span>
        </p>
      )}

      {/* Advanced settings */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground px-0">
            Advanced ▾
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="chunk-size" className="text-xs">Chunk size</Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="overlap" className="text-xs">Overlap</Label>
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
          <div className="space-y-1.5 pt-1">
            <p className="text-xs text-muted-foreground">
              The model used at ingest time <strong className="text-foreground">must match</strong> query time.
            </p>
            {[
              { tag: "Light",        tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", model: "all-MiniLM-L6-v2",                     desc: "22 MB · fast, good for most cases" },
              { tag: "Large",        tagColor: "bg-primary/15 text-primary",                               model: "BAAI/bge-large-en-v1.5",                desc: "1.3 GB · best English accuracy" },
              { tag: "Multilingual", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",       model: "paraphrase-multilingual-MiniLM-L12-v2", desc: "470 MB · 50+ languages" },
            ].map(({ tag, tagColor, model, desc }) => (
              <button
                key={model}
                type="button"
                className="w-full text-left rounded border bg-muted/30 px-2 py-1 hover:bg-muted/60 transition-colors"
                onClick={() => setEmbeddingModel(model)}
                title={`Use ${model}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${tagColor}`}>{tag}</span>
                  <span className="font-mono text-[11px] truncate">{model}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
            <div className="flex flex-col gap-1 pt-0.5">
              {[
                { label: "SBERT pretrained models",         href: "https://www.sbert.net/docs/pretrained_models.html" },
                { label: "HuggingFace sentence-similarity", href: "https://huggingface.co/models?pipeline_tag=sentence-similarity&sort=downloads" },
                { label: "Ollama embedding models",         href: "https://ollama.com/search?c=embedding" },
              ].map(({ label, href }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline w-fit">
                  <ExternalLink className="w-3 h-3 shrink-0" />{label}
                </a>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button
        onClick={handleStart}
        disabled={ingestRunning || !sourcePath || !effectiveCollection}
        aria-label="Start ingest"
      >
        <Play className="w-4 h-4 mr-2" />
        {ingestRunning ? "Ingesting…" : "Start ingest"}
      </Button>

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

      {ingestStreamError && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{ingestStreamError}</span>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {ingestProgress.map((p, i) => (
            <div
              key={`${p.filename}-${i}`}
              className="flex items-center gap-2 text-xs p-1"
            >
              <Badge variant={STATUS_VARIANT[p.status]} className="text-xs shrink-0">
                {p.status}
              </Badge>
              <span className="font-mono truncate flex-1">{p.filename}</span>
              <span className="text-muted-foreground shrink-0">
                {p.chunks_stored} chunks
              </span>
            </div>
          ))}
          {ingestRunning && (
            <div className="flex items-center gap-2 text-xs p-1 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
              <span className="truncate flex-1">
                {ingestFilesTotal > 0
                  ? `Processing file ${ingestFilesDone + 1} of ${ingestFilesTotal}…`
                  : "Starting ingestion…"}
              </span>
            </div>
          )}
        </div>
      </ScrollArea>

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
    </div>
  );
}
```

- [ ] **Step 4: Run the full test suite**

```bash
cd studio && npm test -- --run
```

Expected:
```
Test Files  15 passed (15)
     Tests  102 passed (102)
```

(99 existing + 3 new store tests = 102 total)

- [ ] **Step 5: Commit**

```bash
git add studio/src/components/ingest/FilesTab.tsx studio/src/components/ingest/FilesTab.test.tsx
git commit -m "feat(ingest): persist ingest progress and last result via app store"
```
