# Spec J — Query Pane Empty States

**Date:** 2026-04-14
**Status:** Approved

---

## Summary

Replace the bare scrollable body of `QueryPane` with four contextual empty states that guide the user through every idle scenario: no project open, no collections yet, awaiting a first query, and a search that returned no results. All changes are confined to `QueryPane.tsx` and its test file.

---

## Decisions

- **Scope:** Query pane body only. The search bar area is unchanged — it is already non-functional when there are no collections (`canRun = false` disables the Search button).
- **Architecture:** Inline conditional rendering inside the scrollable body, first-match priority. No store changes, no API changes, no new components.
- **Existing "no results" state** (lines 304–313 in current file) is replaced by an improved version using `SearchX` icon and better copy.

---

## Rendering priority

First condition that matches wins:

| Priority | Condition | State |
|----------|-----------|-------|
| 1 | `!currentDb` | "No project open" |
| 2 | `!submitted && collections.length > 0` | "Ask anything about your documents" |
| 3 | `!submitted && collections.length === 0` | "No collections yet" |
| 4 | `!isLoading && !!submitted && results.length === 0 && !error` | "No results" |

---

## Empty state content

All four states share the same layout:

```tsx
<div className="flex flex-col items-center justify-center py-16 text-center px-6">
  <Icon className="w-8 h-8 text-muted-foreground/40 mb-3" />
  <p className="text-sm font-medium text-muted-foreground">{title}</p>
  <p className="text-xs text-muted-foreground/60 mt-1">{subtitle}</p>
</div>
```

### State 1 — No project open

```tsx
<FolderOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
<p className="text-sm font-medium text-muted-foreground">No project open</p>
<p className="text-xs text-muted-foreground/60 mt-1">
  Open a project from the sidebar to start searching.
</p>
```

### State 2 — Pre-query idle (collections exist)

```tsx
<Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
<p className="text-sm font-medium text-muted-foreground">Ask anything about your documents</p>
<p className="text-xs text-muted-foreground/60 mt-1">
  Type a question above and press Search.
</p>
```

### State 3 — Pre-query idle (no collections)

```tsx
<PackageOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
<p className="text-sm font-medium text-muted-foreground">No collections yet</p>
<p className="text-xs text-muted-foreground/60 mt-1">
  Go to the Ingest tab to add some documents first.
</p>
```

### State 4 — No results (improved)

```tsx
<SearchX className="w-8 h-8 text-muted-foreground/40 mb-3" />
<p className="text-sm font-medium text-muted-foreground">No results</p>
<p className="text-xs text-muted-foreground/60 mt-1">
  Try broader terms, a lower min-score, or check that the collection has been ingested.
</p>
```

---

## QueryPane changes — `studio/src/components/query/QueryPane.tsx`

### Import additions

Add `FolderOpen`, `PackageOpen`, `SearchX` to the existing lucide-react import:

```typescript
import { Search, Sparkles, Info, Loader2, X, FolderOpen, PackageOpen, SearchX } from "lucide-react";
```

### Body replacement

In the scrollable body (`<div className="flex-1 min-h-0 overflow-y-auto">`), replace the entire contents of `<div className="px-6 py-4 space-y-4">` with:

```tsx
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
  {useAi && chatResult.isLoading && ( ... existing ... )}

  {/* AI answer — result */}
  {useAi && chatResult.data && ( ... existing ... )}

  {/* Vector search loading skeleton */}
  {!useAi && isLoading && !!submitted && ( ... existing ... )}

  {/* Results header */}
  {!isLoading && submitted && results.length > 0 && ( ... existing ... )}

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
  {!!submitted && ( ... existing ... )}

</div>
```

Note: the `... existing ...` markers indicate blocks that are already in the file and stay in place without modification. The plan will contain the full file replacement with all blocks expanded.

---

## QueryPane tests — `studio/src/components/query/QueryPane.test.tsx`

Add 4 new tests to the existing `describe("QueryPane")` block. The existing `beforeEach` already sets `currentDb: "./remex_db"` and `useCollections` returns `["myCol"]`.

```typescript
it("shows 'No project open' when currentDb is null", () => {
  useAppStore.setState({ currentDb: null } as any);
  renderWithProviders(<QueryPane />);
  expect(screen.getByText("No project open")).toBeInTheDocument();
});

it("shows idle state before any query when collections exist", () => {
  renderWithProviders(<QueryPane />);
  expect(screen.getByText("Ask anything about your documents")).toBeInTheDocument();
});

it("shows 'No collections yet' when collections list is empty", () => {
  vi.mocked(useCollections).mockReturnValue({ data: [], isLoading: false, error: null } as any);
  renderWithProviders(<QueryPane />);
  expect(screen.getByText("No collections yet")).toBeInTheDocument();
});

it("shows 'No results' after a search that returns nothing", async () => {
  vi.mocked(useMultiQueryResults).mockReturnValue({ data: [], isLoading: false, error: null } as any);
  renderWithProviders(<QueryPane />);
  fireEvent.change(screen.getByRole("textbox", { name: /query input/i }), {
    target: { value: "something" },
  });
  fireEvent.submit(screen.getByRole("textbox", { name: /query input/i }).closest("form")!);
  await waitFor(() => expect(screen.getByText("No results")).toBeInTheDocument());
});
```

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/components/query/QueryPane.tsx` | Add 3 new lucide icons; add 3 empty state blocks; replace existing no-results block |
| `studio/src/components/query/QueryPane.test.tsx` | Add 4 new tests |

---

## Out of Scope

- Empty states for Collections pane or Sources pane
- Animated transitions between states
- Actionable buttons inside empty states (e.g. "Open project" shortcut)
