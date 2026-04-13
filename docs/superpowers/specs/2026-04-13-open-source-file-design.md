# Spec C — Open Source File from Result Cards

**Date:** 2026-04-13
**Status:** Approved

---

## Summary

Add a hover-reveal icon button to each search result card in QueryPane. Clicking it opens the source document in the user's default application via Tauri's `open()`.

---

## Background

Each result card already displays `r.source` (the file path) in the meta row. The `shell:allow-open` Tauri capability is already present in `studio/src-tauri/capabilities/default.json`. No backend changes are needed.

---

## Design

### New component: `ResultCard`

Extract the result card JSX from `QueryPane.tsx` into `studio/src/components/query/ResultCard.tsx`.

**Props:**
```typescript
interface Props {
  result: QueryResultItem;
}
```

**Hover state:** Tailwind `group` on the outer card div; the open button uses `opacity-0 group-hover:opacity-100 transition-opacity` — no React state required.

**Open button:** Small icon button placed right-aligned in the meta row, after the chunk number. Uses the `FolderOpen` icon from `lucide-react`.

```typescript
<button
  onClick={() => open(result.source)}
  aria-label="Open source file"
  className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 text-muted-foreground hover:text-foreground"
>
  <FolderOpen className="w-3.5 h-3.5" />
</button>
```

`open()` is imported from `@tauri-apps/plugin-shell`. It is fire-and-forget — no error handling needed; the OS handles invalid paths silently.

### Modified: `QueryPane.tsx`

Replace the inline card JSX (`<div key={...} className="rounded-lg border ...">...</div>`) with:

```typescript
<ResultCard key={`${r.source}-${r.chunk}`} result={r} />
```

Remove any card-specific imports that move into `ResultCard.tsx` (e.g. `FolderOpen` if added there, `cn` if no longer used in QueryPane).

---

## Testing

**File:** `studio/src/components/query/ResultCard.test.tsx`

Mock at the top of the test file:
```typescript
vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
```

Three tests:

1. **Renders card content** — given a `QueryResultItem`, card shows score, source path, and excerpt text.
2. **Open button has correct aria-label** — `getByRole("button", { name: /open source file/i })` is present.
3. **Clicking the button calls `open()` with the source path** — `fireEvent.click(button)` then `expect(open).toHaveBeenCalledWith(result.source)`.

No changes to `QueryPane.test.tsx`.

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/components/query/ResultCard.tsx` | New: result card component with hover-reveal open button |
| `studio/src/components/query/ResultCard.test.tsx` | New: 3 tests |
| `studio/src/components/query/QueryPane.tsx` | Modify: replace inline card JSX with `<ResultCard>` |

---

## Out of Scope

- Error toasts or notifications when a file can't be opened
- Opening the file's containing folder (instead of the file itself)
- Any backend changes
