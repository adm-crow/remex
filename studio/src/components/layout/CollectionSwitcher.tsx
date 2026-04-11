import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCollections } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";

export function CollectionSwitcher() {
  const { apiUrl, currentDb, currentCollection, setCurrentCollection } =
    useAppStore();
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const { data: collections = [] } = useCollections(apiUrl, currentDb ?? "");

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
      <SelectTrigger className="h-7 text-xs" aria-label="Collection">
        <SelectValue placeholder="Select collection…" />
      </SelectTrigger>
      <SelectContent>
        {collections.map((c) => (
          <SelectItem key={c} value={c} className="text-xs">
            {c}
          </SelectItem>
        ))}
        <SelectItem value="__new__" className="text-xs text-muted-foreground">
          Type a new name…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
