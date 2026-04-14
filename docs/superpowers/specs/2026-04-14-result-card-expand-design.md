# Spec G — Result Card Expand / Full Text

**Date:** 2026-04-14
**Status:** Approved

---

## Summary

Add an inline "Show more / Show less" toggle to `ResultCard` so users can read the complete chunk text without leaving the results list. The full text is already present in `result.text`; this is a purely local-state UI change with no API or store impact.

---

## Decisions

- **Interaction:** A small "Show more ›" button appears below the excerpt when `result.text.length > 300`. Clicking it sets `expanded = true`, revealing the full text. A "‹ Show less" button replaces it to collapse.
- **State:** `const [expanded, setExpanded] = useState(false)` — local to `ResultCard`. Not persisted.
- **Threshold:** 300 characters — consistent with the existing `slice(0, 300)` truncation.
- **Text rendering:** Collapsed → `result.text.slice(0, 300)` + `…` span. Expanded → full `result.text`, no ellipsis.
- **No changes** to store, API, or `QueryPane`.

---

## ResultCard changes — `studio/src/components/query/ResultCard.tsx`

Add `useState` import:

```typescript
import { useState } from "react";
```

Inside `ResultCard`, add state:

```typescript
const [expanded, setExpanded] = useState(false);
```

Replace the existing `<p>` excerpt block:

```tsx
{/* Excerpt */}
<p className="text-sm leading-relaxed text-foreground">
  {expanded ? result.text : result.text.slice(0, 300)}
  {!expanded && result.text.length > 300 && (
    <span className="text-muted-foreground">…</span>
  )}
</p>
{result.text.length > 300 && (
  <button
    type="button"
    onClick={() => setExpanded((v) => !v)}
    className="text-xs text-muted-foreground hover:text-foreground transition-colors self-end"
  >
    {expanded ? "‹ Show less" : "Show more ›"}
  </button>
)}
```

The card's outer `<div>` already has `space-y-2.5` so the button slots in naturally below the text.

---

## ResultCard tests — `studio/src/components/query/ResultCard.test.tsx`

Add `longText` fixture and 4 tests inside the existing `describe("ResultCard", ...)` block:

```typescript
const longText = "A".repeat(400);

it("does not show toggle when text is 300 chars or fewer", () => {
  renderWithProviders(<ResultCard result={mockResult} />);
  expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument();
});

it("shows truncated text and 'Show more' button when text exceeds 300 chars", () => {
  renderWithProviders(<ResultCard result={{ ...mockResult, text: longText }} />);
  expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument();
  // Only first 300 chars rendered
  expect(screen.queryByText(longText)).not.toBeInTheDocument();
});

it("clicking 'Show more' reveals full text and shows 'Show less' button", () => {
  renderWithProviders(<ResultCard result={{ ...mockResult, text: longText }} />);
  fireEvent.click(screen.getByRole("button", { name: /show more/i }));
  expect(screen.getByText(longText)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
});

it("clicking 'Show less' collapses back to truncated text", () => {
  renderWithProviders(<ResultCard result={{ ...mockResult, text: longText }} />);
  fireEvent.click(screen.getByRole("button", { name: /show more/i }));
  fireEvent.click(screen.getByRole("button", { name: /show less/i }));
  expect(screen.queryByText(longText)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
});
```

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/components/query/ResultCard.tsx` | Add `expanded` state, Show more / Show less toggle |
| `studio/src/components/query/ResultCard.test.tsx` | Add 4 tests for expand/collapse behaviour |

---

## Out of Scope

- Persisting expanded state across re-renders or navigation
- Smooth height animation (CSS transition on expand)
- Keyboard shortcut to expand
