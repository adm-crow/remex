# Result Card Expand / Full Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an inline "Show more / Show less" toggle to `ResultCard` so users can read the full chunk text beyond the current 300-character truncation.

**Architecture:** Local `useState(false)` in `ResultCard` — no store, no API changes. When `expanded` is false, text is sliced to 300 chars with an ellipsis; when true, full text is shown. The toggle button only renders when `result.text.length > 300`.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library (`@testing-library/react`)

---

### Task 1: Expand / collapse toggle in ResultCard

**Files:**
- Modify: `studio/src/components/query/ResultCard.tsx`
- Modify: `studio/src/components/query/ResultCard.test.tsx`

---

#### Current state of the files

**`studio/src/components/query/ResultCard.tsx`** (full file, for reference):

```tsx
import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import type { QueryResultItem } from "@/api/client";

interface Props {
  result: QueryResultItem;
}

export function ResultCard({ result }: Props) {
  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-4 space-y-2.5 transition-all duration-150",
        "hover:border-primary/30 hover:shadow-sm hover:shadow-primary/5"
      )}
    >
      {/* Card meta row */}
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="font-mono text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded bg-primary/12 text-primary shrink-0">
          {result.score.toFixed(3)}
        </span>
        {result.doc_title && (
          <span className="text-xs font-semibold truncate">
            {result.doc_title}
          </span>
        )}
        <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
          {result.source}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          #{result.chunk}
        </span>
        <button
          type="button"
          onClick={() => {
            open(result.source).catch((err) => {
              console.error("[ResultCard] Failed to open file:", err);
            });
          }}
          aria-label="Open source file"
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Excerpt */}
      <p className="text-sm leading-relaxed text-foreground">
        {result.text.slice(0, 300)}
        {result.text.length > 300 && (
          <span className="text-muted-foreground">…</span>
        )}
      </p>
    </div>
  );
}
```

**`studio/src/components/query/ResultCard.test.tsx`** (full file, for reference):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ResultCard } from "./ResultCard";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

import { open } from "@tauri-apps/plugin-shell";

const mockResult = {
  text: "Sample chunk text about the document content",
  source: "/docs/a.md",
  source_type: "file",
  score: 0.9,
  distance: 0.1,
  chunk: 2,
  doc_title: "Doc A",
  doc_author: "",
  doc_created: "",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResultCard", () => {
  it("renders score, source path, and excerpt", () => {
    renderWithProviders(<ResultCard result={mockResult} />);
    expect(screen.getByText("0.900")).toBeInTheDocument();
    expect(screen.getByText("/docs/a.md")).toBeInTheDocument();
    expect(screen.getByText(/Sample chunk text/)).toBeInTheDocument();
  });

  it("renders the open-file button with correct aria-label", () => {
    renderWithProviders(<ResultCard result={mockResult} />);
    expect(
      screen.getByRole("button", { name: /open source file/i })
    ).toBeInTheDocument();
  });

  it("clicking the button calls open() with the source path", () => {
    renderWithProviders(<ResultCard result={mockResult} />);
    fireEvent.click(screen.getByRole("button", { name: /open source file/i }));
    expect(vi.mocked(open)).toHaveBeenCalledWith("/docs/a.md");
  });
});
```

---

- [ ] **Step 1: Add the 4 failing tests to `ResultCard.test.tsx`**

Add `longText` fixture and 4 tests inside the existing `describe("ResultCard", ...)` block, after the existing 3 tests:

```tsx
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
  // Only first 300 chars rendered — the full 400-char string should not be present
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

Note: `longText` goes at the top of the file, alongside `mockResult` (not inside the `describe` block).

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
cd studio && npm test -- --run --reporter=verbose ResultCard
```

Expected: 4 new tests FAIL (no toggle button rendered yet), 3 existing tests PASS.

- [ ] **Step 3: Implement the expand/collapse feature in `ResultCard.tsx`**

Replace the full file content with:

```tsx
import { useState } from "react";
import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import type { QueryResultItem } from "@/api/client";

interface Props {
  result: QueryResultItem;
}

export function ResultCard({ result }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-4 space-y-2.5 transition-all duration-150",
        "hover:border-primary/30 hover:shadow-sm hover:shadow-primary/5"
      )}
    >
      {/* Card meta row */}
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="font-mono text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded bg-primary/12 text-primary shrink-0">
          {result.score.toFixed(3)}
        </span>
        {result.doc_title && (
          <span className="text-xs font-semibold truncate">
            {result.doc_title}
          </span>
        )}
        <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
          {result.source}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          #{result.chunk}
        </span>
        <button
          type="button"
          onClick={() => {
            open(result.source).catch((err) => {
              console.error("[ResultCard] Failed to open file:", err);
            });
          }}
          aria-label="Open source file"
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
      </div>
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
    </div>
  );
}
```

- [ ] **Step 4: Run the full test suite to confirm all tests pass**

```bash
cd studio && npm test -- --run
```

Expected output:
```
Test Files  15 passed (15)
     Tests  99 passed (99)
```

(95 existing + 4 new = 99 total)

- [ ] **Step 5: Commit**

```bash
git add studio/src/components/query/ResultCard.tsx studio/src/components/query/ResultCard.test.tsx
git commit -m "feat(query): expand result card to show full chunk text"
```
