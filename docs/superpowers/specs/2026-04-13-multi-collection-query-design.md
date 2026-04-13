# Spec E — Multi-Collection Query

**Date:** 2026-04-13
**Status:** Approved

---

## Summary

Allow users to query multiple collections simultaneously in vector search mode. Results from each collection are fetched in parallel and merged, sorted by score. AI Answer mode remains single-collection only.

---

## Decisions

- **Scope:** Vector search only. AI mode stays single-collection (combining chunks from multiple collections for LLM context is a separate, larger feature).
- **UI pattern:** Toggle pills replace the existing `<Select>`. Pills are scannable and appropriate for the typical 2–5 collections per database.
- **Parallel fetch:** A new `useMultiQueryResults` hook in `useApi.ts` wraps React Query's `useQueries` and returns a unified `{ data, isLoading, error }` — same shape as `useQueryResults`, easy to mock in tests.
- **n_results:** Per-collection (3 collections × 5 results = up to 15 results, sorted by score).
- **At least one:** Guard prevents deselecting the last selected collection.

---

## New hook — `studio/src/hooks/useApi.ts`

Add `useMultiQueryResults` after the existing `useQueryResults`:

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

Also add the `useQueries` import to the existing React Query import at the top of `useApi.ts`:
```typescript
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
```

---

## State changes — `QueryPane.tsx`

Replace:
```typescript
const [selectedCollection, setSelectedCollection] = useState(currentCollection ?? "");
```

With:
```typescript
const [selectedCollections, setSelectedCollections] = useState<string[]>(
  currentCollection ? [currentCollection] : []
);
```

Replace the `activeCollection` derivation:
```typescript
// For AI mode (single-collection): use first selected or fall back to currentCollection
const activeCollection = selectedCollections[0] ?? currentCollection ?? "";
```

---

## Data fetching — `QueryPane.tsx`

Replace the `useQueryResults` call with `useMultiQueryResults`:

```typescript
const multiResult = useMultiQueryResults(
  apiUrl, currentDb ?? "", selectedCollections, submitted,
  { enabled: !!submitted && !useAi, n_results: nResults,
    min_score: minScore > 0 ? minScore : undefined }
);
```

Update derived values:
```typescript
const results = useAi ? (chatResult.data?.sources ?? []) : (multiResult.data ?? []);
const isLoading = useAi ? chatResult.isLoading : multiResult.isLoading;
const error = useAi ? chatResult.error : multiResult.error;
```

---

## Toggle handler — `QueryPane.tsx`

```typescript
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
```

---

## UI — Collection pills

Replace the entire `<Select>` block (collection selector) with:

```tsx
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
```

Update `canRun`:
```typescript
const canRun = !isLoading && selectedCollections.length > 0;
```

---

## Error handling

- `multiResult.error` is the first error across all collection queries (or `null`). The existing error banner renders it unchanged.
- Zero collections selected: `canRun` is false, Search button stays disabled.

---

## Testing

### `studio/src/hooks/useApi.test.tsx` (new file)

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

### `studio/src/components/query/QueryPane.test.tsx` (add 3 tests)

Update the top mock to replace `useQueryResults` with `useMultiQueryResults`:

```typescript
vi.mock("@/hooks/useApi", () => ({
  useMultiQueryResults: vi.fn(),
  useChat: vi.fn(),
  useCollections: vi.fn(),
}));
import { useMultiQueryResults, useChat, useCollections } from "@/hooks/useApi";
```

Update `beforeEach` to reset `useMultiQueryResults` instead of `useQueryResults`:
```typescript
vi.mocked(useMultiQueryResults).mockReturnValue({
  data: undefined,
  isLoading: false,
  error: null,
} as any);
```

Update the existing test "renders result cards after submitting a query" to use `useMultiQueryResults`:
```typescript
vi.mocked(useMultiQueryResults).mockReturnValue({
  data: mockResults,
  isLoading: false,
  error: null,
} as any);
```

Add 3 new tests:
```typescript
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
  // col-a is selected by default (from beforeEach store state)
  // clicking col-b adds it
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
```

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/hooks/useApi.ts` | Add `useMultiQueryResults` + `useQueries` import |
| `studio/src/hooks/useApi.test.tsx` | New: 1 test for `useMultiQueryResults` |
| `studio/src/components/query/QueryPane.tsx` | Replace `<Select>` with pills, use `useMultiQueryResults`, add `handleCollectionToggle` |
| `studio/src/components/query/QueryPane.test.tsx` | Update mock to `useMultiQueryResults`; add 3 tests; update existing tests |

---

## Out of Scope

- Multi-collection AI Answer mode
- Backend multi-query endpoint
- Persisting selected collections across sessions
- "Select all" / "deselect all" controls
