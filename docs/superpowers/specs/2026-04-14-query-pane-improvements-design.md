# Spec F — Query Pane Improvements

**Date:** 2026-04-14
**Status:** Approved

---

## Summary

Three targeted UX improvements to `QueryPane`: a clear button that resets the search input and results, individual and bulk delete for history chips, and a loading skeleton for vector search results.

---

## Decisions

- **Clear button:** ✕ icon inside the right side of the search input, visible only when `text` is non-empty. Clicking sets both `text` and `submitted` to `""`, which disables the React Query hooks and collapses the results panel.
- **History chip delete:** each chip gets a hover-revealed ✕ button (same `group`/`group-hover` pattern as `ResultCard`). A "Clear all" text link appears at the end of the row when there are 2+ chips.
- **Loading skeleton:** 3 fixed `animate-pulse` placeholder cards, shown in vector mode only while `isLoading && !!submitted`. AI mode already has its own spinner.

---

## Store changes — `studio/src/store/app.ts`

Add to the `AppState` interface (after `addQueryHistory`):

```typescript
removeQueryHistory: (text: string) => void;
clearQueryHistory: () => void;
```

Add to the initial state / action implementations (after `addQueryHistory`):

```typescript
removeQueryHistory: (text) => {
  set({ queryHistory: get().queryHistory.filter((q) => q !== text) });
},

clearQueryHistory: () => {
  set({ queryHistory: [] });
},
```

No changes needed to `partialize` — `queryHistory` is already persisted.

---

## Store tests — `studio/src/store/app.test.ts`

Add 2 tests inside the existing `describe("useAppStore", ...)` block:

```typescript
it("removeQueryHistory removes the matching entry", () => {
  useAppStore.getState().addQueryHistory("first");
  useAppStore.getState().addQueryHistory("second");
  useAppStore.getState().removeQueryHistory("first");
  const { queryHistory } = useAppStore.getState();
  expect(queryHistory).toHaveLength(1);
  expect(queryHistory[0]).toBe("second");
});

it("clearQueryHistory empties the history", () => {
  useAppStore.getState().addQueryHistory("first");
  useAppStore.getState().addQueryHistory("second");
  useAppStore.getState().clearQueryHistory();
  expect(useAppStore.getState().queryHistory).toHaveLength(0);
});
```

---

## QueryPane changes — `studio/src/components/query/QueryPane.tsx`

### Store destructure

Add `removeQueryHistory` and `clearQueryHistory` to the store destructure (alongside existing `queryHistory`, `addQueryHistory`):

```typescript
const { apiUrl, currentDb, currentCollection, aiProvider, aiModel, aiApiKey,
        queryHistory, addQueryHistory, removeQueryHistory, clearQueryHistory } =
  useAppStore();
```

### Clear button

Add `X` to the lucide-react import. Inside the search input wrapper `<div className="relative flex-1">`, add `pr-9` to the `Input` className and append the clear button after the `<Input>`:

```tsx
<Input
  value={text}
  onChange={(e) => setText(e.target.value)}
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
```

### History chips row

Replace the existing chips `<div>` with:

```tsx
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
```

### Loading skeleton

Add inside the scrollable body `<div className="px-6 py-4 space-y-4">`, before the results header, after the AI answer blocks:

```tsx
{/* Vector search loading skeleton */}
{!useAi && isLoading && !!submitted && (
  <div className="flex flex-col gap-2">
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="rounded-lg border bg-card p-4 space-y-2.5 animate-pulse">
        <div className="flex items-center gap-2">
          <div className="h-5 w-10 rounded bg-muted" />
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-4 w-48 rounded bg-muted flex-1" />
        </div>
        <div className="space-y-1.5">
          <div className="h-3 w-full rounded bg-muted" />
          <div className="h-3 w-4/5 rounded bg-muted" />
        </div>
      </div>
    ))}
  </div>
)}
```

---

## QueryPane tests — `studio/src/components/query/QueryPane.test.tsx`

Add 4 new tests inside the existing `describe("QueryPane", ...)` block:

```typescript
it("shows clear button when input has text and hides it when empty", () => {
  renderWithProviders(<QueryPane />);
  expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: /query input/i }), {
    target: { value: "hello" },
  });
  expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
});

it("clear button resets input and results", async () => {
  vi.mocked(useMultiQueryResults).mockReturnValue({
    data: mockResults,
    isLoading: false,
    error: null,
  } as any);
  renderWithProviders(<QueryPane />);
  const input = screen.getByRole("textbox", { name: /query input/i });
  fireEvent.change(input, { target: { value: "what is remex" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(screen.getByText("Sample chunk text")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
  expect(input).toHaveValue("");
  expect(screen.queryByText("Sample chunk text")).not.toBeInTheDocument();
});

it("removing a history chip via ✕ removes only that chip", async () => {
  useAppStore.setState({ queryHistory: ["first", "second"] } as any);
  renderWithProviders(<QueryPane />);
  fireEvent.click(screen.getByRole("button", { name: /remove first/i }));
  expect(screen.queryByRole("button", { name: "first" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "second" })).toBeInTheDocument();
});

it("Clear all removes all history chips", () => {
  useAppStore.setState({ queryHistory: ["first", "second"] } as any);
  renderWithProviders(<QueryPane />);
  fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
  expect(screen.queryByRole("button", { name: "first" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "second" })).not.toBeInTheDocument();
});
```

> Note: the skeleton is not directly testable in jsdom (no CSS animations); its presence is verified implicitly by the loading state tests already in the suite.

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/store/app.ts` | Add `removeQueryHistory` + `clearQueryHistory` actions |
| `studio/src/store/app.test.ts` | Add 2 tests for new store actions |
| `studio/src/components/query/QueryPane.tsx` | Clear button, updated chip row, loading skeleton |
| `studio/src/components/query/QueryPane.test.tsx` | Add 4 tests |

---

## Out of Scope

- Skeleton for AI answer mode (already has a spinner)
- Undo for chip deletion
- Persisting scroll position after clear
