import { useMemo, useState } from "react";
import { Eye, Plus, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/app";
import { useCollections } from "@/hooks/useApi";
import { basename, errMsg } from "@/lib/utils";

export function WatchFoldersCard() {
  const {
    watchFolders, addWatchFolder, removeWatchFolder, setWatchFolderCollection,
    apiUrl, currentDb, collectionTypes,
  } = useAppStore();

  // Live list of collections in the current project (from the sidecar).
  const { data: allCollections = [] } = useCollections(apiUrl, currentDb ?? "");

  // Only "files"-type collections are eligible targets for a folder watch.
  // `collectionTypes` is keyed `${dbPath}::${collection}`; collections we've
  // never ingested into are missing → exclude them (we don't know their type).
  const eligibleCollections = useMemo(() => {
    if (!currentDb) return [];
    return allCollections.filter(
      (col) => collectionTypes[`${currentDb}::${col}`] === "files"
    );
  }, [allCollections, collectionTypes, currentDb]);

  // ── Inline "Add folder" wizard ────────────────────────────────────────────
  const [wizardOpen,  setWizardOpen]  = useState(false);
  const [pickedPath,  setPickedPath]  = useState("");
  const [collection,  setCollection]  = useState("");
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [busy,        setBusy]        = useState(false);

  function resetWizard() {
    setWizardOpen(false);
    setPickedPath("");
    setCollection("");
    setWizardError(null);
  }

  async function handlePickFolder() {
    setWizardError(null);
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string" && chosen) setPickedPath(chosen);
  }

  async function handleConfirm() {
    if (!pickedPath || !collection) return;
    setBusy(true);
    setWizardError(null);
    try {
      await addWatchFolder(pickedPath, collection);
      resetWizard();
    } catch (err) {
      setWizardError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="size-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Eye className="w-3.5 h-3.5 text-primary" />
        </div>
        <h2 className="font-semibold text-sm">Watch folders</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Studio re-ingests changes automatically (debounced). Each entry targets a specific
        file-type collection — ingest into a file collection first to make it selectable here.
      </p>

      <ul className="space-y-1.5">
        {watchFolders.map((w) => (
          <li key={w.path} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono truncate" title={w.path}>{basename(w.path)}</p>
              <p className="text-[10px] text-muted-foreground truncate" title={w.path}>{w.path}</p>
            </div>
            <Select
              value={w.collection}
              onValueChange={(v) => setWatchFolderCollection(w.path, v)}
            >
              <SelectTrigger className="h-7 text-xs w-44" aria-label={`Target collection for ${w.path}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Keep the current value visible even if it's not in the eligible
                    list (e.g. the collection was deleted). */}
                {!eligibleCollections.includes(w.collection) && (
                  <SelectItem value={w.collection}>{w.collection} (missing)</SelectItem>
                )}
                {eligibleCollections.map((col) => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button
              type="button"
              onClick={() => void removeWatchFolder(w.path)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Stop watching ${w.path}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {wizardOpen ? (
        <div className="rounded-md border border-dashed p-2.5 space-y-2 bg-muted/20">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Folder</label>
            <div className="flex gap-1.5">
              <span
                className="flex-1 truncate text-xs font-mono px-2 py-1 rounded bg-background border"
                title={pickedPath || "No folder selected"}
              >
                {pickedPath || "—"}
              </span>
              <Button size="sm" variant="outline" onClick={() => void handlePickFolder()}>
                {pickedPath ? "Change…" : "Pick folder…"}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Target collection</label>
            <Select
              value={collection}
              onValueChange={setCollection}
              disabled={eligibleCollections.length === 0}
            >
              <SelectTrigger className="h-7 text-xs" aria-label="Target collection">
                <SelectValue
                  placeholder={
                    eligibleCollections.length === 0
                      ? "Ingest a file collection first"
                      : "Select a collection"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {eligibleCollections.map((col) => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {wizardError && <p className="text-xs text-destructive">{wizardError}</p>}

          <div className="flex gap-1.5 justify-end">
            <Button size="sm" variant="ghost" onClick={resetWizard} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleConfirm()}
              disabled={busy || !pickedPath || !collection}
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setWizardOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add folder
        </Button>
      )}
    </div>
  );
}
