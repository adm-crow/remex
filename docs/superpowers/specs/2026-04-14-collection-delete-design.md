# Spec I — Collection Delete from Sidebar

**Date:** 2026-04-14
**Status:** Approved

---

## Summary

Add a delete action to each collection entry in `CollectionSwitcher` so users can remove collections directly from the sidebar dropdown without touching the CLI or API. Clicking the trash icon opens a confirmation dialog; confirming wipes the collection and removes it from the dropdown.

Rename is out of scope — the backend has no rename endpoint, and re-ingesting into a fresh collection is the correct workflow.

---

## Decisions

- **Placement:** Trash icon inside each `SelectItem` in `CollectionSwitcher`, visible on hover via `group-hover` pattern.
- **Confirmation:** shadcn `Dialog` (AlertDialog is not in the component library). Shows collection name and permanent-deletion warning.
- **Hook:** `useDeleteCollection` already exists in `useApi.ts` — no new hook needed.
- **Post-delete:** If the deleted collection was the active one, `currentCollection` is set to the first remaining collection, or `""` if none remain.
- **Click isolation:** `e.stopPropagation()` + `e.preventDefault()` on the trash button prevents the `Select` from selecting the item when the icon is clicked.
- **`textValue` prop:** Set `textValue={c}` on each `SelectItem` so the `SelectTrigger` shows only the collection name even though children contain a button element.
- **`pendingDelete`:** Local `useState<string | null>(null)` in `CollectionSwitcher`. No store changes.

---

## CollectionSwitcher changes — `studio/src/components/layout/CollectionSwitcher.tsx`

### New imports:

```typescript
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteCollection } from "@/hooks/useApi";
```

### New state:

```typescript
const [pendingDelete, setPendingDelete] = useState<string | null>(null);
```

### New mutation hook (inside the component, after existing hooks):

```typescript
const { mutate: deleteCollection, isPending: isDeleting } =
  useDeleteCollection(apiUrl, currentDb ?? "");
```

### Updated `SelectItem` rendering:

Replace:
```tsx
{collections.map((c) => (
  <SelectItem key={c} value={c} className="text-xs">
    {c}
  </SelectItem>
))}
```

With:
```tsx
{collections.map((c) => (
  <SelectItem key={c} value={c} textValue={c} className="text-xs group/item pr-2">
    <div className="flex items-center justify-between w-full gap-2">
      <span>{c}</span>
      <button
        type="button"
        aria-label={`Delete collection ${c}`}
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
```

### Confirmation dialog (add after `</Select>`, before the closing fragment or return):

```tsx
<Dialog
  open={pendingDelete !== null}
  onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
>
  <DialogContent showCloseButton={false}>
    <DialogHeader>
      <DialogTitle>Delete "{pendingDelete}"?</DialogTitle>
      <DialogDescription>
        All chunks in this collection will be permanently deleted. This cannot be undone.
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
```

### Full updated component structure:

The component returns a fragment `<>...</>` wrapping the existing `Select` (or new-name `Input`) and the `Dialog`. The `isNew` branch is unchanged — the Dialog only renders in the Select branch and uses `pendingDelete !== null` as its open gate, so it's safe to include unconditionally at the bottom of the component.

```tsx
export function CollectionSwitcher() {
  const { apiUrl, currentDb, currentCollection, setCurrentCollection } = useAppStore();
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { data: collections = [] } = useCollections(apiUrl, currentDb ?? "");
  const { mutate: deleteCollection, isPending: isDeleting } =
    useDeleteCollection(apiUrl, currentDb ?? "");

  if (isNew) {
    return ( /* existing Input + cancel Button — no changes */ );
  }

  return (
    <>
      <Select ...>
        ...
      </Select>
      <Dialog open={pendingDelete !== null} onOpenChange={...}>
        ...
      </Dialog>
    </>
  );
}
```

---

## CollectionSwitcher tests — `studio/src/components/layout/CollectionSwitcher.test.tsx`

New file. Mocks `@/hooks/useApi` following the same pattern as `SourcesPane.test.tsx`.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { useAppStore } from "@/store/app";

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
    // Open the dropdown
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    expect(screen.getByRole("button", { name: /delete collection docs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete collection work/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete collection personal/i })).toBeInTheDocument();
  });

  it("clicking a trash button opens the confirmation dialog with the collection name", () => {
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete "work"/i)).toBeInTheDocument();
  });

  it("confirming deletion calls deleteCollection with the correct collection name", async () => {
    mockDeleteMutate.mockImplementation((_col, { onSuccess } = {}) => onSuccess?.());
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(mockDeleteMutate).toHaveBeenCalledWith("work", expect.objectContaining({ onSuccess: expect.any(Function) }));
  });

  it("deleting the active collection switches currentCollection to the next one", async () => {
    mockDeleteMutate.mockImplementation((_col, { onSuccess } = {}) => onSuccess?.());
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
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
    mockDeleteMutate.mockImplementation((_col, { onSuccess } = {}) => onSuccess?.());
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete collection only/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(useAppStore.getState().currentCollection).toBe("")
    );
  });

  it("cancelling the dialog does not call deleteCollection", () => {
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});
```

---

## Files Changed

| File | Change |
|------|--------|
| `studio/src/components/layout/CollectionSwitcher.tsx` | Add `pendingDelete` state, `useDeleteCollection` hook, trash icon per item, `Dialog` confirmation |
| `studio/src/components/layout/CollectionSwitcher.test.tsx` | New — 5 tests covering delete flow |

---

## Out of Scope

- Collection rename (no backend endpoint)
- Persisting form inputs (`sourcePath`, `collectionName`, etc.)
- Undo / soft-delete
- Deleting the collection from the `isNew` branch (user must select it first)
