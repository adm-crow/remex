import { useEffect, useRef, useState } from "react";
import { ListPlus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CollectionPickerProps {
  /** Raw collection name — controlled by the parent. */
  value: string;
  onChange: (next: string) => void;
  /** Existing collections in the current project (filtered by type by the caller). */
  existing: string[];
  /** Optional placeholder for "new collection" mode. */
  placeholder?: string;
  /** DOM id forwarded to the active input — for binding to an external <Label>. */
  inputId?: string;
}

/** Sentinel value used in the Select so we can distinguish "+ New collection…"
 *  from a real (selectable) collection name. */
const NEW_SENTINEL = "__remex_new_collection__";

/**
 * Two-mode collection chooser:
 *   • Existing — Select dropdown of project collections
 *   • New     — free text input for a fresh name
 *
 * The mode is local UI state; the source of truth is the parent's `value`. The
 * caller doesn't need to know which mode is active to ingest correctly.
 */
export function CollectionPicker({
  value,
  onChange,
  existing,
  placeholder = "new-collection-name",
  inputId,
}: CollectionPickerProps) {
  const [mode, setMode] = useState<"existing" | "new">(() =>
    existing.length > 0 && value !== "" && existing.includes(value) ? "existing" : "new"
  );

  // Auto-promote to "existing" mode once collections finish loading, IF the
  // current value happens to match one and the user hasn't manually flipped
  // the toggle yet. Without this, a tab opened before useCollections resolves
  // would stay stuck in "new" mode even though the value is a real collection.
  const userTouchedMode = useRef(false);
  useEffect(() => {
    if (userTouchedMode.current) return;
    if (mode === "existing") return;
    if (existing.length === 0) return;
    if (value !== "" && existing.includes(value)) setMode("existing");
  }, [existing, value, mode]);

  // No existing collections at all → force "new" mode and hide the toggle.
  const effectiveMode = existing.length === 0 ? "new" : mode;

  function flipMode() {
    userTouchedMode.current = true;
    setMode((m) => (m === "existing" ? "new" : "existing"));
  }

  return (
    <div className="flex items-center gap-2">
      {effectiveMode === "existing" ? (
        <Select
          value={existing.includes(value) ? value : ""}
          onValueChange={(picked) => {
            if (picked === NEW_SENTINEL) {
              userTouchedMode.current = true;
              setMode("new");
              onChange(""); // clear so the user types a fresh name
              return;
            }
            onChange(picked);
          }}
        >
          <SelectTrigger id={inputId} className="h-8 text-sm flex-1" aria-label="Collection">
            <SelectValue placeholder="Select a collection…" />
          </SelectTrigger>
          <SelectContent>
            {existing.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
            <SelectItem value={NEW_SENTINEL}>
              <span className="flex items-center gap-1.5 text-primary">
                <Plus className="w-3.5 h-3.5" />
                New collection…
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm flex-1"
          aria-label="Collection"
          // Auto-focus only when the user explicitly toggled to new mode,
          // not on initial render where it would steal focus on tab change.
          autoFocus={userTouchedMode.current && mode === "new"}
        />
      )}

      {existing.length > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={flipMode}
          className="shrink-0 text-xs text-muted-foreground px-2"
          aria-label={mode === "existing" ? "Create new collection" : "Pick existing collection"}
          title={mode === "existing" ? "Create new collection" : "Pick existing collection"}
        >
          {mode === "existing" ? (
            <><Plus className="w-3.5 h-3.5 mr-1" />New</>
          ) : (
            <><ListPlus className="w-3.5 h-3.5 mr-1" />Existing</>
          )}
        </Button>
      )}
    </div>
  );
}
