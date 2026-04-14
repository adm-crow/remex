# Keyboard Shortcuts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard shortcuts for pane navigation (`Ctrl+Shift+Q/I/C/S`), search focus (`Ctrl+K`), and query clearing (`Escape`) to Remex Studio.

**Architecture:** A new `useKeyboardShortcuts` hook registered in `AppShell` handles all global shortcuts. `AppShell` holds a `focusSearchRef` and passes an `onFocusReady` prop to `QueryPane`, which registers its input focus function on mount. `Escape` is handled locally in `QueryPane` via `onKeyDown` on the search input.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (`renderHook`, `fireEvent`).

---

### Files

| File | Action |
|------|--------|
| `studio/src/hooks/useKeyboardShortcuts.ts` | Create — global shortcut hook |
| `studio/src/hooks/useKeyboardShortcuts.test.ts` | Create — 7 unit tests |
| `studio/src/components/layout/AppShell.tsx` | Modify — wire hook + focusSearchRef + onFocusReady |
| `studio/src/components/query/QueryPane.tsx` | Modify — onFocusReady prop + inputRef + Escape handler |
| `studio/src/components/query/QueryPane.test.tsx` | Modify — add Escape test |

---

### Task 1: Create `useKeyboardShortcuts` hook (TDD)

**Files:**
- Create: `studio/src/hooks/useKeyboardShortcuts.ts`
- Create: `studio/src/hooks/useKeyboardShortcuts.test.ts`

- [ ] **Step 1: Create the test file**

Create `studio/src/hooks/useKeyboardShortcuts.test.ts` with this exact content:

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function fire(key: string, ctrlKey = false, shiftKey = false) {
  fireEvent.keyDown(window, { key, ctrlKey, shiftKey });
}

describe("useKeyboardShortcuts", () => {
  it("Ctrl+Shift+Q calls onViewChange('query')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("Q", true, true);
    expect(onViewChange).toHaveBeenCalledWith("query");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+I calls onViewChange('ingest')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("I", true, true);
    expect(onViewChange).toHaveBeenCalledWith("ingest");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+C calls onViewChange('collections')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("C", true, true);
    expect(onViewChange).toHaveBeenCalledWith("collections");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+S calls onViewChange('settings')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("S", true, true);
    expect(onViewChange).toHaveBeenCalledWith("settings");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+K calls onViewChange('query') and focusSearch()", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("k", true, false);
    expect(onViewChange).toHaveBeenCalledWith("query");
    expect(focusSearch).toHaveBeenCalled();
  });

  it("unrelated keys do not call any callback", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("a", false, false);
    fire("Enter", false, false);
    fire("Q", false, false); // no ctrl
    expect(onViewChange).not.toHaveBeenCalled();
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("cleans up the event listener on unmount", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onViewChange, focusSearch })
    );
    unmount();
    fire("Q", true, true);
    expect(onViewChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they all fail**

```bash
cd studio && npm test -- --run --reporter=verbose useKeyboardShortcuts
```

Expected: 7 FAIL (module not found or similar), 0 PASS.

- [ ] **Step 3: Create the hook implementation**

Create `studio/src/hooks/useKeyboardShortcuts.ts` with this exact content:

```typescript
import { useEffect } from "react";
import type { View } from "@/components/layout/Sidebar";

interface UseKeyboardShortcutsOptions {
  onViewChange: (v: View) => void;
  focusSearch: () => void;
}

export function useKeyboardShortcuts({
  onViewChange,
  focusSearch,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && e.key === "k") {
        e.preventDefault();
        onViewChange("query");
        focusSearch();
        return;
      }
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key) {
          case "Q":
          case "q":
            e.preventDefault();
            onViewChange("query");
            break;
          case "I":
          case "i":
            e.preventDefault();
            onViewChange("ingest");
            break;
          case "C":
          case "c":
            e.preventDefault();
            onViewChange("collections");
            break;
          case "S":
          case "s":
            e.preventDefault();
            onViewChange("settings");
            break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onViewChange, focusSearch]);
}
```

- [ ] **Step 4: Run the tests to confirm all 7 pass**

```bash
cd studio && npm test -- --run --reporter=verbose useKeyboardShortcuts
```

Expected: 7 PASS, 0 FAIL.

- [ ] **Step 5: Commit**

```bash
git add studio/src/hooks/useKeyboardShortcuts.ts studio/src/hooks/useKeyboardShortcuts.test.ts
git commit -m "feat(shortcuts): add useKeyboardShortcuts hook"
```

---

### Task 2: Wire AppShell + QueryPane + Escape

**Files:**
- Modify: `studio/src/components/layout/AppShell.tsx`
- Modify: `studio/src/components/query/QueryPane.tsx`
- Modify: `studio/src/components/query/QueryPane.test.tsx`

- [ ] **Step 6: Add the Escape test to `QueryPane.test.tsx`**

At the end of the `describe("QueryPane")` block (after the last `it(...)` — currently after the "shows 'No collections yet'" test at the bottom), add:

```typescript
  it("Escape on the input clears text and dismisses results", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: mockResults,
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("Sample chunk text")).toBeInTheDocument()
    );
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(
      screen.getByText("Ask anything about your documents")
    ).toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the Escape test to confirm it fails**

```bash
cd studio && npm test -- --run --reporter=verbose QueryPane
```

Expected: the new Escape test FAILS (no Escape handler yet), all other QueryPane tests PASS.

- [ ] **Step 8: Replace `QueryPane.tsx` with the updated implementation**

Replace the full content of `studio/src/components/query/QueryPane.tsx`. The changes from the current file are:

1. Add `useEffect, useRef` to the React import
2. Add a `QueryPaneProps` interface
3. Accept `{ onFocusReady }` prop in the function signature
4. Add `inputRef = useRef<HTMLInputElement>(null)`
5. Add a `useEffect` that registers the focus function
6. Add `ref={inputRef}` and `onKeyDown` (Escape handler) to the `<Input>`

Here is the complete updated file:

```tsx
import { useState, useEffect, useRef } from "react";
import type { FormEvent } from "react";
import { Search, Sparkles, Info, Loader2, X, FolderOpen, PackageOpen, SearchX } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMultiQueryResults, useChat, useCollections } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";
import { ResultCard } from "./ResultCard";

interface QueryPaneProps {
  onFocusReady?: (fn: () => void) => void;
}

export function QueryPane({ onFocusReady }: QueryPaneProps = {}) {
  const { apiUrl, currentDb, currentCollection, aiProvider, aiModel, aiApiKey,
          queryHistory, addQueryHistory, removeQueryHistory, clearQueryHistory } =
    useAppStore();

  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [nResults, setNResults] = useState(5);
  const [minScore, setMinScore] = useState(0);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    currentCollection ? [currentCollection] : []
  );

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    onFocusReady?.(() => inputRef.current?.focus());
  }, [onFocusReady]);

  const { data: collections = [] } = useCollections(apiUrl, currentDb ?? "");
  // For AI mode (single-collection): use first selected or fall back to currentCollection
  const activeCollection = selectedCollections[0] ?? currentCollection ?? "";

  const multiResult = useMultiQueryResults(
    apiUrl, currentDb ?? "", selectedCollections, submitted,
    { enabled: !!submitted && !useAi, n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined }
  );
  const chatResult = useChat(
    apiUrl, currentDb ?? "", activeCollection, submitted,
    { enabled: !!submitted && useAi, n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined,
      provider: aiProvider || undefined, model: aiModel || undefined,
      api_key: aiApiKey || undefined }
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) {
      setSubmitted(text.trim());
      addQueryHistory(text.trim());
    }
  }

  function handleCollectionToggle(col: string) {
    if (useAi) {
      setSelectedCollections([col]);
    } else {
      setSelectedCollections((prev) => {
        if (prev.includes(col)) {
          if (prev.length === 1) return prev; // never deselect last
          return prev.filter((c) => c !== col);
        }
        return [...prev, col];
      });
    }
  }

  const results = useAi ? (chatResult.data?.sources ?? []) : (multiResult.data ?? []);
  const isLoading = useAi ? chatResult.isLoading : multiResult.isLoading;
  const error = useAi ? chatResult.error : multiResult.error;
  const canRun = !isLoading && selectedCollections.length > 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Search area ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 border-b shrink-0 space-y-3">

        {/* Search input — dominant, full width */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setText("");
                  setSubmitted("");
                }
              }}
              placeholder="Ask a question or search your documents…"
              className="pl-9 pr-9 h-10"
              aria-label="Query input"
            />
            {text && (
              <button
                type="button"
                onClick={() => { setText(""); setSubmitted(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            disabled={!canRun}
            className="h-10 px-5 shrink-0"
          >
            {isLoading ? "Searching…" : "Search"}
          </Button>
        </form>

        {/* Query history chips */}
        {queryHistory.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {queryHistory.map((q) => (
              <span
                key={q}
                className="group flex items-center gap-0.5 text-xs pl-2 pr-1 py-0.5 rounded-full border bg-muted/50 hover:bg-muted transition-colors"
              >
                <button
                  type="button"
                  onClick={() => { setText(q); setSubmitted(q); addQueryHistory(q); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
                <button
                  type="button"
                  onClick={() => removeQueryHistory(q)}
                  aria-label={`Remove ${q}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {queryHistory.length > 1 && (
              <button
                type="button"
                onClick={clearQueryHistory}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Collection pills */}
        <div className="flex flex-wrap gap-1.5">
          {collections.map((col) => {
            const isSelected = selectedCollections.includes(col);
            return (
              <button
                key={col}
                type="button"
                onClick={() => handleCollectionToggle(col)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
              >
                {col}
              </button>
            );
          })}
        </div>

        {/* Options strip — compact, secondary */}
        <div className="flex items-center gap-3">

          {/* Results count */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Results</span>
            <Input
              type="number" min={1} max={50}
              value={nResults}
              onChange={(e) => setNResults(Math.max(1, Number(e.target.value)))}
              className="h-7 w-14 text-xs text-center px-1"
              aria-label="Number of results"
            />
          </div>

          {/* Min score */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Min score</span>
            <Input
              type="number" min={0} max={1} step={0.05}
              value={minScore}
              onChange={(e) => setMinScore(Math.min(1, Math.max(0, Number(e.target.value))))}
              className="h-7 w-16 text-xs text-center px-1"
              aria-label="Minimum score"
            />
          </div>

          {/* AI mode */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Switch
              id="ai-mode"
              checked={useAi}
              onCheckedChange={(checked) => {
                setUseAi(checked);
                if (checked && selectedCollections.length > 1) {
                  setSelectedCollections([selectedCollections[0]]);
                }
              }}
            />
            <Label htmlFor="ai-mode" className="text-xs text-muted-foreground flex items-center gap-1 cursor-pointer">
              <Sparkles className="w-3 h-3" />
              AI Answer
            </Label>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">

          {/* ── Empty state: no project open ──────────────────────────────── */}
          {!currentDb && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <FolderOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No project open</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Open a project from the sidebar to start searching.
              </p>
            </div>
          )}

          {/* ── Empty state: pre-query idle (has collections) ─────────────── */}
          {!!currentDb && !submitted && collections.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Ask anything about your documents
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Type a question above and press Search.
              </p>
            </div>
          )}

          {/* ── Empty state: pre-query idle (no collections) ──────────────── */}
          {!!currentDb && !submitted && collections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <PackageOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No collections yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Go to the Ingest tab to add some documents first.
              </p>
            </div>
          )}

          {/* AI answer — loading */}
          {useAi && chatResult.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating answer…
            </div>
          )}

          {/* AI answer — result */}
          {useAi && chatResult.data && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5" />
                AI Answer
              </div>
              <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{chatResult.data.answer}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Vector search loading skeleton */}
          {!useAi && isLoading && !!submitted && (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border p-4 space-y-2 animate-pulse">
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              ))}
            </div>
          )}

          {/* Results header */}
          {!isLoading && submitted && results.length > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {results.length} result{results.length !== 1 ? "s" : ""} for{" "}
                <span className="font-medium text-foreground">"{submitted}"</span>
              </p>
              <button
                type="button"
                onClick={() => {}}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Info className="w-3 h-3" />
                Scores
              </button>
            </div>
          )}

          {/* ── Empty state: no results ───────────────────────────────────── */}
          {!isLoading && !!submitted && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <SearchX className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No results</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try broader terms, a lower min-score, or check that the collection has been ingested.
              </p>
            </div>
          )}

          {/* Result cards */}
          {!!submitted && (
            results.map((r, i) => (
              <ResultCard key={`${r.source}-${r.chunk}-${i}`} result={r} />
            ))
          )}

        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Replace `AppShell.tsx` with the updated implementation**

Replace the full content of `studio/src/components/layout/AppShell.tsx`:

```tsx
import { useState, useRef, useCallback } from "react";
import type { ComponentType } from "react";
import { Sidebar, type View } from "./Sidebar";
import { QueryPane } from "@/components/query/QueryPane";
import { IngestPane } from "@/components/ingest/IngestPane";
import { SourcesPane } from "@/components/sources/SourcesPane";
import { SettingsPane } from "@/components/settings/SettingsPane";
import { useAppStore } from "@/store/app";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

const PANE_MAP: Record<View, ComponentType> = {
  query:       QueryPane,
  ingest:      IngestPane,
  collections: SourcesPane,
  settings:    SettingsPane,
};

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 380;
const DEFAULT_SIDEBAR = 208; // 52 * 4

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("query");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  const isDragging = useRef(false);
  const focusSearchRef = useRef<(() => void) | null>(null);

  const handleFocusReady = useCallback((fn: () => void) => {
    focusSearchRef.current = fn;
  }, []);

  useKeyboardShortcuts({
    onViewChange: setActiveView,
    focusSearch: () => focusSearchRef.current?.(),
  });

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setSidebarWidth(Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, ev.clientX)));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const ActivePane = PANE_MAP[activeView];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        style={{ width: sidebarWidth }}
      />

      {/* Drag handle */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
        onMouseDown={onDragStart}
        aria-hidden
      />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {sidecarStatus === "error" && (
          <div
            className="shrink-0 bg-destructive/8 border-b border-destructive/20 px-4 py-2.5 text-sm text-destructive flex items-center gap-2"
            role="alert"
          >
            <span className="size-1.5 rounded-full bg-destructive shrink-0" />
            Could not start remex serve — is remex installed?{" "}
            <code className="font-mono text-xs opacity-80">pip install remex[api]</code>
          </div>
        )}
        <div key={activeView} className="flex-1 min-h-0 flex flex-col animate-pane-in">
          {activeView === "query" ? (
            <QueryPane onFocusReady={handleFocusReady} />
          ) : (
            <ActivePane />
          )}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 10: Run the full test suite to confirm all tests pass**

```bash
cd studio && npm test -- --run
```

Expected:
```
Test Files  16 passed (16)
     Tests  114 passed (114)
```

(106 existing + 7 hook tests + 1 Escape test = 114 total)

- [ ] **Step 11: Commit**

```bash
git add studio/src/components/layout/AppShell.tsx \
        studio/src/components/query/QueryPane.tsx \
        studio/src/components/query/QueryPane.test.tsx
git commit -m "feat(shortcuts): wire keyboard shortcuts into AppShell and QueryPane"
```
