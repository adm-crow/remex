# Maintenance Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 pre-existing test failures and replace the row template single-line input with a textarea in SQLiteTab.

**Architecture:** All changes are surgical — two test files updated to match current implementation, one new UI component added, one component field swapped. No logic changes to production code (except the textarea swap in SQLiteTab).

**Tech Stack:** React 19 / TypeScript / Vitest / Testing Library — frontend only.

---

## File Map

| File | Action |
|------|--------|
| `studio/src/hooks/useSidecar.test.tsx` | Modify: fix 2 stale test assertions |
| `studio/src/pages/Home.test.tsx` | Modify: fix 2 stale text matchers |
| `studio/src/components/ui/textarea.tsx` | Create: shadcn-style Textarea component |
| `studio/src/components/ingest/SQLiteTab.tsx` | Modify: replace `<Input>` with `<Textarea>` for row template |

---

### Task 1: Fix `useSidecar.test.tsx`

**Files:**
- Modify: `studio/src/hooks/useSidecar.test.tsx`

- [ ] **Step 1: Run the failing tests to see current output**

```bash
cd studio
npm test -- --run src/hooks/useSidecar.test.tsx
```

Expected: 2 failures — "calls spawn_sidecar when health fails initially" and "sets status to connected after spawn + poll succeeds".

- [ ] **Step 2: Fix test 1 — update spawn_sidecar assertion**

In `studio/src/hooks/useSidecar.test.tsx`, find the test "calls spawn_sidecar when health fails initially" (around line 51). Replace:

```typescript
    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith("spawn_sidecar");
    });
```

With:

```typescript
    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith("spawn_sidecar", {
        host: "localhost",
        port: 8000,
      });
    });
```

> Why: `useSidecar.ts` calls `invoke("spawn_sidecar", { host, port })`. The store sets `apiUrl: "http://localhost:8000"` in `beforeEach`, so `parseUrl` returns `{ host: "localhost", port: 8000 }`.

- [ ] **Step 3: Fix test 2 — make is_sidecar_alive return true**

In the same file, find the test "sets status to connected after spawn + poll succeeds" (around line 63). It currently has no per-test `invoke` mock setup, so it inherits the `beforeEach` mock which returns `undefined` for all invocations. `useSidecar.ts` calls `invoke("is_sidecar_alive")` in the poll loop and treats falsy results as "process dead" → sets status to `"error"`.

Add a mock override at the start of that test:

```typescript
  it("sets status to connected after spawn + poll succeeds", async () => {
    vi.mocked(tauriCore.invoke)
      .mockResolvedValueOnce(undefined)  // spawn_sidecar succeeds
      .mockResolvedValue(true);          // is_sidecar_alive → process alive

    vi.mocked(api.getHealth)
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("still not ready"))
      .mockResolvedValue({ status: "ok", version: "0.2.0" });

    renderHook(() => useSidecar());

    // Advance past spawn + two poll ticks
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
  });
```

- [ ] **Step 4: Run tests to verify both pass**

```bash
npm test -- --run src/hooks/useSidecar.test.tsx
```

Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add studio/src/hooks/useSidecar.test.tsx
git commit -m "fix(tests): update useSidecar tests to match spawn_sidecar({host,port}) signature"
```

---

### Task 2: Fix `Home.test.tsx`

**Files:**
- Modify: `studio/src/pages/Home.test.tsx`

- [ ] **Step 1: Run the failing test**

```bash
cd studio
npm test -- --run src/pages/Home.test.tsx
```

Expected: 1 failure — "renders recent projects when store has entries".

- [ ] **Step 2: Update the two text matchers**

In `studio/src/pages/Home.test.tsx`, find the test "does not render recent projects section when list is empty". Replace:

```typescript
    expect(screen.queryByText(/recent projects/i)).not.toBeInTheDocument();
```

With:

```typescript
    expect(screen.queryByText(/^recent$/i)).not.toBeInTheDocument();
```

Then find the test "renders recent projects when store has entries". Replace:

```typescript
    expect(screen.getByText(/recent projects/i)).toBeInTheDocument();
```

With:

```typescript
    expect(screen.getByText(/^recent$/i)).toBeInTheDocument();
```

> Why: `Home.tsx` renders the heading as `"Recent"` (a single word), not `"Recent projects"`. The `^...$` anchors prevent accidentally matching longer strings.

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm test -- --run src/pages/Home.test.tsx
```

Expected: 7/7 passing.

- [ ] **Step 4: Commit**

```bash
git add studio/src/pages/Home.test.tsx
git commit -m "fix(tests): update Home test matcher to match 'Recent' heading"
```

---

### Task 3: Textarea component + SQLiteTab row template field

**Files:**
- Create: `studio/src/components/ui/textarea.tsx`
- Modify: `studio/src/components/ingest/SQLiteTab.tsx`

- [ ] **Step 1: Create the Textarea component**

Create `studio/src/components/ui/textarea.tsx`:

```typescript
import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
```

> Pattern: identical to `studio/src/components/ui/input.tsx` but uses `<textarea>` instead of `<input>`. No height constraint (`h-8`) since textareas grow by row count.

- [ ] **Step 2: Update SQLiteTab to use Textarea**

In `studio/src/components/ingest/SQLiteTab.tsx`:

Add the import at the top alongside the other UI imports:

```typescript
import { Textarea } from "@/components/ui/textarea";
```

Find the row template field (look for `id="sqlite-template"`). Replace the entire `<Input ... />` element:

```typescript
            <Input
              id="sqlite-template"
              value={rowTemplate}
              onChange={(e) => setRowTemplate(e.target.value)}
              placeholder="{title}: {body}"
              className="h-7 text-xs"
            />
```

With:

```typescript
            <Textarea
              id="sqlite-template"
              value={rowTemplate}
              onChange={(e) => setRowTemplate(e.target.value)}
              placeholder="{title}: {body}"
              rows={3}
              className="text-xs resize-none"
            />
```

Also remove the `Input` import if it is no longer used elsewhere in `SQLiteTab.tsx`. Check if `Input` appears anywhere else in the file — if it does, leave the import; if the row template field was its only use, remove it.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd studio
npx tsc --noEmit
```

Expected: no new errors (there are 2 pre-existing errors in unrelated test files — ignore those).

- [ ] **Step 4: Run the full test suite**

```bash
npm test -- --run
```

Expected: all tests pass (0 failures after Tasks 1 and 2 fixed the pre-existing 3).

- [ ] **Step 5: Commit**

```bash
git add studio/src/components/ui/textarea.tsx studio/src/components/ingest/SQLiteTab.tsx
git commit -m "feat(ui): add Textarea component; use it for SQLiteTab row template field"
```
