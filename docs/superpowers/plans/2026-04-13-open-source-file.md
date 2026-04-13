# Open Source File from Result Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hover-reveal icon button to each search result card that opens the source document in the user's default application.

**Architecture:** Extract the result card JSX from `QueryPane.tsx` into a focused `ResultCard` component. `ResultCard` owns its own hover state via Tailwind `group` utilities and calls `open()` from `@tauri-apps/plugin-shell` on button click. `QueryPane` delegates card rendering to `ResultCard`.

**Tech Stack:** React 19 / TypeScript / Vitest / Testing Library / Tauri v2 (`@tauri-apps/plugin-shell`) / lucide-react / shadcn/ui

---

## File Map

| File | Action |
|------|--------|
| `studio/src/components/query/ResultCard.tsx` | Create: result card component with hover-reveal open button |
| `studio/src/components/query/ResultCard.test.tsx` | Create: 3 tests |
| `studio/src/components/query/QueryPane.tsx` | Modify: replace inline card JSX with `<ResultCard>`, remove unused `cn` import |

---

### Task 1: ResultCard component

**Files:**
- Create: `studio/src/components/query/ResultCard.tsx`
- Create: `studio/src/components/query/ResultCard.test.tsx`

---

- [ ] **Step 1: Write the failing tests**

Create `studio/src/components/query/ResultCard.test.tsx`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ResultCard } from "./ResultCard";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));

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

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd studio
npm test -- --run src/components/query/ResultCard.test.tsx
```

Expected: 3 failures — `ResultCard` not found.

- [ ] **Step 3: Create the ResultCard component**

Create `studio/src/components/query/ResultCard.tsx`:

```typescript
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
          onClick={() => open(result.source)}
          aria-label="Open source file"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
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

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --run src/components/query/ResultCard.test.tsx
```

Expected: 3/3 passing.

- [ ] **Step 5: Commit**

```bash
git add studio/src/components/query/ResultCard.tsx studio/src/components/query/ResultCard.test.tsx
git commit -m "feat(query): add ResultCard component with hover-reveal open-file button"
```

---

### Task 2: Update QueryPane to use ResultCard

**Files:**
- Modify: `studio/src/components/query/QueryPane.tsx`

---

- [ ] **Step 1: Run the existing QueryPane tests as a baseline**

```bash
cd studio
npm test -- --run src/components/query/QueryPane.test.tsx
```

Expected: 5/5 passing.

- [ ] **Step 2: Update QueryPane.tsx**

In `studio/src/components/query/QueryPane.tsx`, make these changes:

**Add the ResultCard import** after the existing imports (around line 20):

```typescript
import { ResultCard } from "./ResultCard";
```

**Remove the `cn` import** — it is only used by the result card, which moves to `ResultCard.tsx`. Delete this line:

```typescript
import { cn } from "@/lib/utils";
```

**Replace the result cards block** (lines 221–257). Find:

```typescript
          {/* Result cards */}
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <div
                key={`${r.source}-${r.chunk}`}
                className={cn(
                  "rounded-lg border bg-card p-4 space-y-2.5 transition-all duration-150",
                  "hover:border-primary/30 hover:shadow-sm hover:shadow-primary/5"
                )}
              >
                {/* Card meta row */}
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-mono text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded bg-primary/12 text-primary shrink-0">
                    {r.score.toFixed(3)}
                  </span>
                  {r.doc_title && (
                    <span className="text-xs font-semibold truncate">
                      {r.doc_title}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
                    {r.source}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    #{r.chunk}
                  </span>
                </div>
                {/* Excerpt */}
                <p className="text-sm leading-relaxed text-foreground">
                  {r.text.slice(0, 300)}
                  {r.text.length > 300 && (
                    <span className="text-muted-foreground">…</span>
                  )}
                </p>
              </div>
            ))}
          </div>
```

Replace with:

```typescript
          {/* Result cards */}
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <ResultCard key={`${r.source}-${r.chunk}`} result={r} />
            ))}
          </div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd studio
npx tsc --noEmit
```

Expected: no new errors (2 pre-existing errors in unrelated test files are acceptable).

- [ ] **Step 4: Run QueryPane tests to confirm they still pass**

```bash
npm test -- --run src/components/query/QueryPane.test.tsx
```

Expected: 5/5 passing. The existing test "renders result cards after submitting a query" checks for `"Sample chunk text"` — `ResultCard` renders this in the excerpt, so it continues to pass.

- [ ] **Step 5: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests pass (0 failures).

- [ ] **Step 6: Commit**

```bash
git add studio/src/components/query/QueryPane.tsx
git commit -m "refactor(query): replace inline card JSX with ResultCard component"
```
