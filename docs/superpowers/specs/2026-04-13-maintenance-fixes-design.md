# Spec B — Maintenance Fixes

**Date:** 2026-04-13
**Status:** Approved

---

## Summary

Four small fixes to remove pre-existing test failures and improve the row template field UX in SQLiteTab.

---

## Fix 1: `useSidecar.test.tsx` — stale spawn_sidecar assertions

### Problem

`useSidecar.ts` calls `invoke("spawn_sidecar", { host, port })` (added when configurable API URL support was introduced), but two tests were never updated:

- **Test "calls spawn_sidecar when health fails initially"** asserts `toHaveBeenCalledWith("spawn_sidecar")` with no second argument — fails because the real call now passes `{ host, port }`.
- **Test "sets status to connected after spawn + poll succeeds"** fails because the `invoke` mock returns `undefined` for all calls, including `is_sidecar_alive`. The hook treats `undefined` (falsy) as "process not alive" and sets status to `"error"` instead of polling to `"connected"`.

### Fix

**Test 1** — update the assertion to match the current signature:
```typescript
expect(tauriCore.invoke).toHaveBeenCalledWith("spawn_sidecar", {
  host: "localhost",
  port: 8000,
});
```

**Test 2** — make `invoke` return `undefined` once (for `spawn_sidecar`) then `true` for subsequent calls (for `is_sidecar_alive`):
```typescript
vi.mocked(tauriCore.invoke)
  .mockResolvedValueOnce(undefined)  // spawn_sidecar
  .mockResolvedValue(true);          // is_sidecar_alive → process alive
```

No changes to `useSidecar.ts`.

---

## Fix 2: `Home.test.tsx` — stale "recent projects" text matcher

### Problem

`Home.tsx` renders the heading as `"Recent"` (line 108), but the test uses `/recent projects/i` which doesn't match.

### Fix

In `Home.test.tsx`, update two matchers:

```typescript
// "does not render recent projects section when list is empty"
expect(screen.queryByText(/^recent$/i)).not.toBeInTheDocument();

// "renders recent projects when store has entries"
expect(screen.getByText(/^recent$/i)).toBeInTheDocument();
```

No changes to `Home.tsx`.

---

## Fix 3: `SQLiteTab.tsx` — row template field → Textarea

### Problem

The row template field uses a single-line `<Input>`. Row templates are Jinja-style strings (e.g. `{{ title }}: {{ body }}\n{{ date }}`) that users may want to write across multiple lines. A single-line input is awkward for this.

### Fix

**New file:** `studio/src/components/ui/textarea.tsx` — shadcn-style Textarea component:

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

**In `SQLiteTab.tsx`**, replace the `<Input>` for `sqlite-template` with:

```typescript
import { Textarea } from "@/components/ui/textarea";

<Textarea
  id="sqlite-template"
  value={rowTemplate}
  onChange={(e) => setRowTemplate(e.target.value)}
  placeholder="{title}: {body}"
  rows={3}
  className="text-xs resize-none"
/>
```

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/hooks/useSidecar.test.tsx` | Update 2 test assertions |
| `studio/src/pages/Home.test.tsx` | Update 2 text matchers |
| `studio/src/components/ui/textarea.tsx` | New: Textarea UI component |
| `studio/src/components/ingest/SQLiteTab.tsx` | Replace `<Input>` with `<Textarea>` for row template |

---

## Out of Scope

- Changes to `useSidecar.ts` logic
- Changes to `Home.tsx` heading text
- Other SQLiteTab fields (columns, id column, embedding model) — these are short single-value inputs
