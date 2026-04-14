# Collection Delete from Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-collection trash icon inside the `CollectionSwitcher` dropdown that deletes a collection after confirmation.

**Architecture:** Local `pendingDelete` state in `CollectionSwitcher` drives a shadcn `Dialog` confirmation. On confirm, calls the existing `useDeleteCollection` hook (already in `useApi.ts`), then switches `currentCollection` to the next remaining collection (or clears it if none remain). No store or API changes required.

**Tech Stack:** React 19, TypeScript, Zustand, shadcn/ui (Select, Dialog, Button), Tailwind `group-hover`, Vitest + Testing Library.

---

### Files

| File | Action |
|------|--------|
| `studio/src/components/layout/CollectionSwitcher.tsx` | Modify — add delete flow |
| `studio/src/components/layout/CollectionSwitcher.test.tsx` | Create — 5 tests |

---

### Task 1: Create CollectionSwitcher tests (all failing)

**Files:**
- Create: `studio/src/components/layout/CollectionSwitcher.test.tsx`

- [ ] **Step 1: Create the test file**

Create `studio/src/components/layout/CollectionSwitcher.test.tsx` with this exact content:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { useAppStore } from "@/store/app";

// Radix Select uses a Portal + open-state gate that makes items invisible in JSDOM.
// Replace with simple pass-through components so trash buttons are always in the DOM.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: any) => (
    <button role="combobox" aria-label="Collection" {...props}>{children}</button>
  ),
  SelectValue: ({ placeholder }: any) => <span>{placeholder ?? ""}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, textValue, ...props }: any) => (
    <div data-value={value} {...props}>{children}</div>
  ),
}));

vi.mock("@/hooks/useApi", () => ({
  useCollections: vi.fn(),
  useDeleteCollection: vi.fn(),
}));

import { useCollections, useDeleteCollection } from "@/hooks/useApi";

const mockDeleteMutate = vi.fn();

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    apiUrl: "http://localhost:8000",
    currentDb: "./remex_db",
    currentCollection: "docs",
  } as any);

  vi.mocked(useCollections).mockReturnValue({
    data: ["docs", "work", "personal"],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(useDeleteCollection).mockReturnValue({
    mutate: mockDeleteMutate,
    isPending: false,
  } as any);

  mockDeleteMutate.mockReset();
});

describe("CollectionSwitcher", () => {
  it("renders a delete button for each collection", () => {
    renderWithProviders(<CollectionSwitcher />);
    expect(screen.getByRole("button", { name: /delete collection docs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete collection work/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete collection personal/i })).toBeInTheDocument();
  });

  it("clicking a trash button opens the confirmation dialog with the collection name", () => {
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete "work"/i)).toBeInTheDocument();
  });

  it("confirming deletion calls deleteCollection with the correct collection name", () => {
    mockDeleteMutate.mockImplementation((_col: string, { onSuccess }: any = {}) =>
      onSuccess?.()
    );
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(mockDeleteMutate).toHaveBeenCalledWith(
      "work",
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("deleting the active collection switches currentCollection to the next one", async () => {
    mockDeleteMutate.mockImplementation((_col: string, { onSuccess }: any = {}) =>
      onSuccess?.()
    );
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection docs/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(useAppStore.getState().currentCollection).toBe("work")
    );
  });

  it("deleting the last collection clears currentCollection", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["only"],
      isLoading: false,
      error: null,
    } as any);
    useAppStore.setState({ currentCollection: "only" } as any);
    mockDeleteMutate.mockImplementation((_col: string, { onSuccess }: any = {}) =>
      onSuccess?.()
    );
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection only/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(useAppStore.getState().currentCollection).toBe("")
    );
  });

  it("cancelling the dialog does not call deleteCollection", () => {
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they all fail**

```bash
cd studio && npm test -- --run --reporter=verbose CollectionSwitcher
```

Expected: 5 FAIL ("Delete collection docs" button not in document, etc.), 0 PASS.

---

### Task 2: Implement the delete feature in CollectionSwitcher

**Files:**
- Modify: `studio/src/components/layout/CollectionSwitcher.tsx`

- [ ] **Step 3: Replace the full file content with the implementation**

Replace `studio/src/components/layout/CollectionSwitcher.tsx` with:

```tsx
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { useCollections, useDeleteCollection } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";

export function CollectionSwitcher() {
  const { apiUrl, currentDb, currentCollection, setCurrentCollection } =
    useAppStore();
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { data: collections = [] } = useCollections(apiUrl, currentDb ?? "");
  const { mutate: deleteCollection, isPending: isDeleting } =
    useDeleteCollection(apiUrl, currentDb ?? "");

  if (isNew) {
    return (
      <div className="flex gap-1">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="collection name"
          className="h-7 text-xs"
          aria-label="New collection name"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              setCurrentCollection(newName.trim());
              setIsNew(false);
              setNewName("");
            }
            if (e.key === "Escape") {
              setIsNew(false);
              setNewName("");
            }
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setIsNew(false);
            setNewName("");
          }}
          className="h-7 px-2 text-xs"
        >
          ✕
        </Button>
      </div>
    );
  }

  return (
    <>
      <Select
        value={currentCollection ?? ""}
        onValueChange={(v) => {
          if (v === "__new__") {
            setIsNew(true);
          } else {
            setCurrentCollection(v);
          }
        }}
      >
        <SelectTrigger className="h-7 text-xs w-full" aria-label="Collection">
          <SelectValue placeholder="Select collection…" />
        </SelectTrigger>
        <SelectContent>
          {collections.map((c) => (
            <SelectItem
              key={c}
              value={c}
              textValue={c}
              className="text-xs group/item pr-2"
            >
              <div className="flex items-center justify-between w-full gap-2">
                <span>{c}</span>
                <button
                  type="button"
                  aria-label={`Delete collection ${c}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setPendingDelete(c);
                  }}
                  className="opacity-0 group-hover/item:opacity-100 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </SelectItem>
          ))}
          <SelectItem value="__new__" className="text-xs text-muted-foreground">
            Type a new name…
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete "{pendingDelete}"?</DialogTitle>
            <DialogDescription>
              All chunks in this collection will be permanently deleted. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={() => {
                if (!pendingDelete) return;
                const target = pendingDelete;
                deleteCollection(target, {
                  onSuccess: () => {
                    if (currentCollection === target) {
                      const remaining = collections.filter((c) => c !== target);
                      setCurrentCollection(remaining[0] ?? "");
                    }
                    setPendingDelete(null);
                  },
                });
              }}
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Run the CollectionSwitcher tests to confirm all 5 pass**

```bash
cd studio && npm test -- --run --reporter=verbose CollectionSwitcher
```

Expected: 5 PASS, 0 FAIL.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
cd studio && npm test -- --run
```

Expected:
```
Test Files  16 passed (16)
     Tests  108 passed (108)
```

(103 existing + 5 new = 108 total)

- [ ] **Step 6: Commit**

```bash
git add studio/src/components/layout/CollectionSwitcher.tsx studio/src/components/layout/CollectionSwitcher.test.tsx
git commit -m "feat(sidebar): delete collection from dropdown with confirmation"
```
