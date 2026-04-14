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
              type="button"
              variant="outline"
              onClick={() => setPendingDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
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
