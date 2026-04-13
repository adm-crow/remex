# Query History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist recent search queries and display them as clickable chips in QueryPane so users can re-run past searches without retyping.

**Architecture:** Add `queryHistory: string[]` and `addQueryHistory` to the existing Zustand store (`app.ts`) with persistence. QueryPane calls `addQueryHistory` on submit and renders chips between the search form and the collection selector. Clicking a chip sets the input text and immediately re-submits the query.

**Tech Stack:** React 19 / TypeScript / Vitest / Testing Library / Zustand + persist middleware

---

## File Map

| File | Action |
|------|--------|
| `studio/src/store/app.ts` | Modify: add `queryHistory` state, `addQueryHistory` action, persist |
| `studio/src/store/app.test.ts` | Modify: add 3 tests for `addQueryHistory`; add `queryHistory: []` to `beforeEach` |
| `studio/src/components/query/QueryPane.tsx` | Modify: call `addQueryHistory` on submit; render history chips |
| `studio/src/components/query/QueryPane.test.tsx` | Modify: add 2 tests for chip render + chip click |

---

### Task 1: Store — queryHistory state + addQueryHistory action

**Files:**
- Modify: `studio/src/store/app.ts`
- Modify: `studio/src/store/app.test.ts`

---

- [ ] **Step 1: Add failing tests to `app.test.ts`**

In `studio/src/store/app.test.ts`:

**Update the `beforeEach`** to include `queryHistory: []` so new tests start from a clean slate:

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
  });
});
```

**Add 3 new tests** inside the existing `describe("useAppStore", ...)` block, after the last existing test:

```typescript
  it("addQueryHistory adds an entry", () => {
    useAppStore.getState().addQueryHistory("what is remex");
    expect(useAppStore.getState().queryHistory[0]).toBe("what is remex");
  });

  it("addQueryHistory deduplicates — re-adding moves to front", () => {
    useAppStore.getState().addQueryHistory("first query");
    useAppStore.getState().addQueryHistory("second query");
    useAppStore.getState().addQueryHistory("first query");
    const { queryHistory } = useAppStore.getState();
    expect(queryHistory).toHaveLength(2);
    expect(queryHistory[0]).toBe("first query");
  });

  it("addQueryHistory caps at 20 entries", () => {
    for (let i = 0; i < 25; i++) {
      useAppStore.getState().addQueryHistory(`query ${i}`);
    }
    expect(useAppStore.getState().queryHistory).toHaveLength(20);
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd studio
npm test -- --run src/store/app.test.ts
```

Expected: 3 new failures — `addQueryHistory` is not a function / `queryHistory` is undefined.

- [ ] **Step 3: Update `app.ts`**

In `studio/src/store/app.ts`, make the following changes:

**Add to the `AppState` interface** (after `removeRecentProject`):

```typescript
  queryHistory: string[];
  addQueryHistory: (text: string) => void;
```

**Add to the initial state object** (after `recentProjects: []`):

```typescript
      queryHistory: [],
```

**Add the action implementation** (after `removeRecentProject`):

```typescript
      addQueryHistory: (text) => {
        const filtered = get().queryHistory.filter((q) => q !== text);
        set({ queryHistory: [text, ...filtered].slice(0, 20) });
      },
```

**Add `queryHistory` to the `partialize` list** (alongside `recentProjects`):

```typescript
        partialize: (state) => ({
          recentProjects: state.recentProjects,
          queryHistory: state.queryHistory,
          apiUrl: state.apiUrl,
          darkMode: state.darkMode,
          theme: state.theme,
          aiProvider: state.aiProvider,
          aiModel: state.aiModel,
          aiApiKey: state.aiApiKey,
        }),
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --run src/store/app.test.ts
```

Expected: all 10 tests passing (7 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add studio/src/store/app.ts studio/src/store/app.test.ts
git commit -m "feat(store): add queryHistory state and addQueryHistory action"
```

---

### Task 2: QueryPane — call addQueryHistory + render chips

**Files:**
- Modify: `studio/src/components/query/QueryPane.tsx`
- Modify: `studio/src/components/query/QueryPane.test.tsx`

---

- [ ] **Step 1: Add failing tests to `QueryPane.test.tsx`**

In `studio/src/components/query/QueryPane.test.tsx`, add these 2 tests inside the existing `describe("QueryPane", ...)` block:

```typescript
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
    vi.mocked(useQueryResults).mockReturnValue({
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
```

> Note: `mockResults` is already defined at the top of `QueryPane.test.tsx`.

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --run src/components/query/QueryPane.test.tsx
```

Expected: 2 new failures — chips don't exist yet.

- [ ] **Step 3: Update `QueryPane.tsx`**

In `studio/src/components/query/QueryPane.tsx`:

**Add `queryHistory` and `addQueryHistory` to the store destructure** (around line 23):

```typescript
  const { apiUrl, currentDb, currentCollection, aiProvider, aiModel, aiApiKey,
          queryHistory, addQueryHistory } =
    useAppStore();
```

**Update `handleSubmit`** to call `addQueryHistory` after setting `submitted`:

```typescript
  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) {
      setSubmitted(text.trim());
      addQueryHistory(text.trim());
    }
  }
```

**Add the history chips row** inside the search area `<div>`, between the closing `</form>` tag and the collection `<Select>`. Find the comment `{/* Collection — full width, prominent */}` and insert before it:

```typescript
        {/* Query history chips */}
        {queryHistory.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {queryHistory.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setText(q); setSubmitted(q); }}
                className="text-xs px-2 py-0.5 rounded-full border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}
```

- [ ] **Step 4: Run QueryPane tests to confirm they pass**

```bash
npm test -- --run src/components/query/QueryPane.test.tsx
```

Expected: 7/7 passing (5 existing + 2 new).

- [ ] **Step 5: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests pass (0 failures).

- [ ] **Step 6: Commit**

```bash
git add studio/src/components/query/QueryPane.tsx studio/src/components/query/QueryPane.test.tsx
git commit -m "feat(query): render history chips and call addQueryHistory on submit"
```
