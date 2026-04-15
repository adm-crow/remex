import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface RenameCollectionDialogProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
  onRename: (newName: string) => void;
  isLoading?: boolean;
}

export function RenameCollectionDialog({
  open, currentName, onClose, onRename, isLoading,
}: RenameCollectionDialogProps) {
  const [value, setValue] = useState(currentName);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed && trimmed !== currentName) {
      onRename(trimmed);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename collection</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label htmlFor="new-name" className="text-xs text-muted-foreground">
              New name
            </Label>
            <Input
              id="new-name"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
              className="h-8 text-sm font-mono"
              aria-label="New collection name"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!value.trim() || value.trim() === currentName || !!isLoading}
            >
              {isLoading ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
