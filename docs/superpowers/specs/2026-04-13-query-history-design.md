# Spec D — Query History

**Date:** 2026-04-13
**Status:** Approved

---

## Summary

Persist recent search queries in the Zustand store and display them as clickable chips below the search input in QueryPane. Clicking a chip immediately re-runs that query.

---

## Decisions

- **Scope:** Global history (not per-collection). The collection selector is adjacent; users can change collection after selecting a history entry.
- **Storage:** Added to the existing `useAppStore` with `persist` middleware — consistent with how `recentProjects` is handled.
- **Cap:** 20 entries, deduplicated (most recent at front).
- **No clear/delete:** Out of scope for now.

---

## State layer — `studio/src/store/app.ts`

Add to `AppState`:

```typescript
queryHistory: string[];
addQueryHistory: (text: string) => void;
```

Default value: `queryHistory: []`

Action implementation — identical pattern to `addRecentProject`:

```typescript
addQueryHistory: (text) => {
  const filtered = get().queryHistory.filter((q) => q !== text);
  set({ queryHistory: [text, ...filtered].slice(0, 20) });
},
```

Add `queryHistory` to the `partialize` list so it persists to localStorage.

---

## UI layer — `studio/src/components/query/QueryPane.tsx`

**On submit:** call `addQueryHistory(text.trim())` in `handleSubmit` after setting `submitted`.

**Chips row:** rendered between the search form and the collection selector, only when `queryHistory.length > 0`:

```tsx
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

Clicking a chip sets both `text` (populates the input) and `submitted` (triggers the query immediately).

---

## Testing

**`studio/src/store/app.test.ts`** (new):
- `addQueryHistory` adds an entry
- `addQueryHistory` deduplicates (re-adding same text moves it to front)
- `addQueryHistory` caps at 20 entries

**`studio/src/components/query/QueryPane.test.tsx`** (modify — add 2 tests):
- After submitting a query, the chip appears with the query text
- Clicking the chip triggers a new query submission (i.e. calls `useQueryResults` with the chip's text)

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/store/app.ts` | Add `queryHistory` state + `addQueryHistory` action + persist |
| `studio/src/store/app.test.ts` | New: 3 unit tests for `addQueryHistory` |
| `studio/src/components/query/QueryPane.tsx` | Call `addQueryHistory` on submit; render history chips |
| `studio/src/components/query/QueryPane.test.tsx` | Add 2 tests for chip render + chip click |

---

## Out of Scope

- Per-collection history
- Delete individual entries
- Clear all history
- History visible outside QueryPane
