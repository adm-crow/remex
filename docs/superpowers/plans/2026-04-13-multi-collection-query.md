# Multi-Collection Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select multiple collections and search all of them simultaneously in vector mode, with results merged and sorted by score.

**Architecture:** A new `useMultiQueryResults` hook in `useApi.ts` wraps React Query's `useQueries` to run parallel per-collection fetches and returns a unified `{ data, isLoading, error }`. In `QueryPane.tsx`, the existing `<Select>` is replaced with toggle pills backed by `selectedCollections: string[]` state; AI mode uses only the first selected collection (unchanged backend contract). `useMultiQueryResults` is mockable at the `@/hooks/useApi` level, keeping test patterns consistent.

**Tech Stack:** React 19 / TypeScript / Vitest / Testing Library / React Query (`@tanstack/react-query` — `useQueries`)

---

## File Map

| File | Action |
|------|--------|
| `studio/src/hooks/useApi.ts` | Modify: add `useQueries` import; add `useMultiQueryResults` hook |
| `studio/src/hooks/useApi.test.tsx` | Create: 1 test for `useMultiQueryResults` |
| `studio/src/components/query/QueryPane.tsx` | Modify: replace `<Select>` with pills; `selectedCollections` state; `handleCollectionToggle`; use `useMultiQueryResults` |
| `studio/src/components/query/QueryPane.test.tsx` | Modify: swap mock to `useMultiQueryResults`; update affected tests; add 3 new tests |

---

### Task 1: Hook — `useMultiQueryResults`

**Files:**
- Modify: `studio/src/hooks/useApi.ts`
- Create: `studio/src/hooks/useApi.test.tsx`

---

- [ ] **Step 1: Write the failing test**

Create `studio/src/hooks/useApi.test.tsx` with this content:

```typescript
import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useMultiQueryResults } from "./useApi";
import { api } from "@/api/client";

vi.mock("@/api/client", () => ({
  api: { queryCollection: vi.fn() },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useMultiQueryResults", () => {
  it("merges results from multiple collections sorted by score", async () => {
    vi.mocked(api.queryCollection)
      .mockResolvedValueOnce([
        { text: "a", source: "col-a", score: 0.9, source_type: "file", distance: 0.1, chunk: 0, doc_title: "", doc_author: "", doc_created: "" },
      ])
      .mockResolvedValueOnce([
        { text: "b", source: "col-b", score: 0.7, source_type: "file", distance: 0.3, chunk: 0, doc_title: "", doc_author: "", doc_created: "" },
      ]);

    const { result } = renderHook(
      () => useMultiQueryResults("http://localhost:8000", "./db", ["col-a", "col-b"], "test", { enabled: true }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data![0].score).toBe(0.9);
    expect(result.current.data![1].score).toBe(0.7);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd studio && npm test -- --run src/hooks/useApi.test.tsx
```

Expected: FAIL — `useMultiQueryResults` is not exported from `./useApi`.

- [ ] **Step 3: Update `useApi.ts`**

In `studio/src/hooks/useApi.ts`, make two changes:

**Change the React Query import** (line 1–5) from:
```typescript
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
```
to:
```typescript
import {
  useQuery,
  useMutation,
  useQueryClient,
  useQueries,
} from "@tanstack/react-query";
```

**Add `useMultiQueryResults`** after the closing `}` of `useQueryResults` (after line 82), before `export function useChat`:

```typescript
export function useMultiQueryResults(
  apiUrl: string,
  dbPath: string,
  collections: string[],
  text: string,
  options?: QueryOptions
) {
  const results = useQueries({
    queries: collections.map((col) => ({
      queryKey: [
        "query", apiUrl, dbPath, col, text,
        options?.n_results, options?.min_score,
      ],
      queryFn: () =>
        api.queryCollection(apiUrl, dbPath, col, {
          text,
          n_results: options?.n_results,
          min_score: options?.min_score,
        }),
      enabled:
        !!apiUrl && !!text && !!dbPath && !!col && (options?.enabled ?? true),
    })),
  });

  return {
    data: results
      .flatMap((r) => r.data ?? [])
      .sort((a, b) => b.score - a.score),
    isLoading: results.some((r) => r.isLoading),
    error: results.find((r) => r.error)?.error ?? null,
  };
}
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npm test -- --run src/hooks/useApi.test.tsx
```

Expected: PASS — 1 test, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add studio/src/hooks/useApi.ts studio/src/hooks/useApi.test.tsx
git commit -m "feat(query): add useMultiQueryResults hook wrapping useQueries"
```

---

### Task 2: QueryPane — toggle pills + useMultiQueryResults

**Files:**
- Modify: `studio/src/components/query/QueryPane.test.tsx`
- Modify: `studio/src/components/query/QueryPane.tsx`

---

- [ ] **Step 1: Update `QueryPane.test.tsx` — swap mock + add 3 new tests**

Replace the entire content of `studio/src/components/query/QueryPane.test.tsx` with:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { QueryPane } from "./QueryPane";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useMultiQueryResults: vi.fn(),
  useChat: vi.fn(),
  useCollections: vi.fn(),
}));

import { useMultiQueryResults, useChat, useCollections } from "@/hooks/useApi";

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
    queryHistory: [],
  } as any);
  vi.mocked(useCollections).mockReturnValue({
    data: ["myCol"],
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useMultiQueryResults).mockReturnValue({
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
    vi.mocked(useMultiQueryResults).mockReturnValue({
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
    fireEvent.click(screen.getByRole("switch", { name: /ai answer/i }));
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Remex is a RAG tool.")).toBeInTheDocument();
      expect(screen.getByText(/anthropic.*claude-opus-4-6/i)).toBeInTheDocument();
    });
  });

  it("shows 'No results found' when results are empty after query", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
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
    vi.mocked(useMultiQueryResults).mockReturnValue({
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

  it("adds a history chip after submitting a query", async () => {
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "what is remex" })
      ).toBeInTheDocument();
    });
  });

  it("clicking a history chip re-submits the query and shows results", async () => {
    useAppStore.setState({ queryHistory: ["previous search"] } as any);
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: mockResults,
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const chip = screen.getByRole("button", { name: "previous search" });
    fireEvent.click(chip);
    await waitFor(() => {
      expect(screen.getByText("Sample chunk text")).toBeInTheDocument();
    });
  });

  it("clicking a history chip promotes it to front of history", () => {
    useAppStore.setState({
      queryHistory: ["older query", "previous search"],
    } as any);
    renderWithProviders(<QueryPane />);
    const chip = screen.getByRole("button", { name: "older query" });
    fireEvent.click(chip);
    expect(useAppStore.getState().queryHistory[0]).toBe("older query");
  });

  it("renders collection pills for each available collection", () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col-a", "col-b"],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    expect(screen.getByRole("button", { name: "col-a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "col-b" })).toBeInTheDocument();
  });

  it("toggling a second pill adds it to the active selection", () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col-a", "col-b"],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    fireEvent.click(screen.getByRole("button", { name: "col-b" }));
    expect(screen.getByRole("button", { name: "col-b" })).toHaveClass("bg-primary");
  });

  it("shows results from multiple collections merged by score", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col-a", "col-b"],
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: [
        { text: "High score result", source: "col-a", score: 0.9, source_type: "file", distance: 0.1, chunk: 0, doc_title: "", doc_author: "", doc_created: "" },
        { text: "Lower score result", source: "col-b", score: 0.7, source_type: "file", distance: 0.3, chunk: 0, doc_title: "", doc_author: "", doc_created: "" },
      ],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("High score result")).toBeInTheDocument();
      expect(screen.getByText("Lower score result")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm the new ones fail**

```bash
npm test -- --run src/components/query/QueryPane.test.tsx
```

Expected: failures on the 3 new tests (collection pills, second pill toggle, merged results). Existing tests may also fail because `useQueryResults` is gone from the mock — that's expected until QueryPane.tsx is updated.

- [ ] **Step 3: Update `QueryPane.tsx`**

Replace the entire content of `studio/src/components/query/QueryPane.tsx` with:

```typescript
import { useState } from "react";
import type { FormEvent } from "react";
import { Search, Sparkles, Info, Loader2 } from "lucide-react";
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

export function QueryPane() {
  const { apiUrl, currentDb, currentCollection, aiProvider, aiModel, aiApiKey,
          queryHistory, addQueryHistory } =
    useAppStore();

  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [nResults, setNResults] = useState(5);
  const [minScore, setMinScore] = useState(0);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    currentCollection ? [currentCollection] : []
  );

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
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question or search your documents…"
              className="pl-9 h-10"
              aria-label="Query input"
            />
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
          <div className="flex flex-wrap gap-1.5">
            {queryHistory.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setText(q); setSubmitted(q); addQueryHistory(q); }}
                className="text-xs px-2 py-0.5 rounded-full border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {q}
              </button>
            ))}
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
              aria-label="Max results"
            />
          </div>

          {/* Min score */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Min score</span>
            <Input
              id="min-score"
              type="number" min={0} max={1} step={0.05}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="h-7 w-16 text-xs text-center px-1"
            />
          </div>

          <div className="flex-1" />

          {/* AI toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="ai-toggle"
              checked={useAi}
              onCheckedChange={setUseAi}
              aria-label="AI answer toggle"
            />
            <Label
              htmlFor="ai-toggle"
              className="text-xs flex items-center gap-1.5 cursor-pointer select-none"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              AI Answer
            </Label>
          </div>
        </div>

        {/* AI Agent notice — shown below the strip when toggle is on but not configured */}
        {useAi && !aiProvider && !aiModel && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-500 dark:text-amber-400">
            <Info className="w-3.5 h-3.5 shrink-0" />
            AI Answer requires a provider and model — configure them in{" "}
            <strong className="font-medium">Settings → AI Agent</strong>.
          </div>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="mx-6 mt-4 shrink-0 text-destructive text-sm p-3 border border-destructive/30 rounded-md bg-destructive/5"
          role="alert"
        >
          {error.message}
        </div>
      )}

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">

          {/* AI answer — loading */}
          {useAi && chatResult.isLoading && (
            <div className="rounded-lg border border-primary/25 bg-primary/8 p-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />
              <span className="text-sm text-muted-foreground">Generating answer…</span>
            </div>
          )}

          {/* AI answer — result */}
          {useAi && chatResult.data && (
            <div className="rounded-lg border border-primary/25 bg-primary/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold">AI Answer</span>
                <Badge variant="secondary" className="text-xs ml-auto font-mono">
                  {chatResult.data.provider} · {chatResult.data.model}
                </Badge>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
                [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>ul]:pl-4 [&>ol]:pl-4
                [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm
                [&>pre]:bg-muted [&>pre]:p-2 [&>pre]:rounded [&>pre]:overflow-x-auto
                [&>code]:bg-muted [&>code]:px-1 [&>code]:rounded [&>code]:text-xs">
                <ReactMarkdown>{chatResult.data.answer}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Results header */}
          {!isLoading && submitted && results.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {useAi ? "Sources" : "Results"}
              </span>
              <span className="text-xs text-muted-foreground">
                {results.length}
              </span>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && submitted && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No results found.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try different search terms or a lower min-score.
              </p>
            </div>
          )}

          {/* Result cards */}
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <ResultCard key={`${r.source}-${r.chunk}`} result={r} />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run QueryPane tests to confirm they pass**

```bash
npm test -- --run src/components/query/QueryPane.test.tsx
```

Expected: 11/11 passing (8 existing + 3 new).

- [ ] **Step 5: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests pass (0 failures).

- [ ] **Step 6: Commit**

```bash
git add studio/src/components/query/QueryPane.tsx studio/src/components/query/QueryPane.test.tsx
git commit -m "feat(query): replace collection Select with multi-select pills; use useMultiQueryResults"
```
