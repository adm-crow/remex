import { useMemo, useState } from "react";
import { Database, Plus, X } from "lucide-react";
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
import { api } from "@/api/client";
import { errMsg, basename } from "@/lib/utils";

export function WatchDatabasesCard() {
  const {
    watchDatabases, addWatchDatabase, removeWatchDatabase, setWatchDatabaseCollection,
    apiUrl, currentDb, collectionTypes,
  } = useAppStore();

  const { data: allCollections = [] } = useCollections(apiUrl, currentDb ?? "");

  // Only "sqlite"-type collections are eligible targets for a database watch.
  const eligibleCollections = useMemo(() => {
    if (!currentDb) return [];
    return allCollections.filter(
      (col) => collectionTypes[`${currentDb}::${col}`] === "sqlite"
    );
  }, [allCollections, collectionTypes, currentDb]);

  // ── Inline "Add database" wizard state ────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pickedPath, setPickedPath] = useState<string>("");
  const [tables, setTables] = useState<string[]>([]);
  const [table, setTable] = useState<string>("");
  const [collection, setCollection] = useState<string>("");
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetWizard() {
    setWizardOpen(false);
    setPickedPath("");
    setTables([]);
    setTable("");
    setCollection("");
    setWizardError(null);
  }

  async function handlePickFile() {
    setWizardError(null);
    const chosen = await openDialog({
      multiple: false,
      filters: [{ name: "SQLite", extensions: ["sqlite", "db", "sqlite3"] }],
    });
    if (typeof chosen !== "string" || !chosen) return;
    setPickedPath(chosen);
    setTables([]);
    setTable("");
    try {
      const resp = await api.listSqliteTables(apiUrl, chosen);
      setTables(resp.tables);
    } catch (err) {
      setWizardError(`Could not read tables: ${errMsg(err)}`);
    }
  }

  async function handleConfirm() {
    if (!pickedPath || !table || !collection) return;
    setBusy(true);
    setWizardError(null);
    try {
      await addWatchDatabase({ dbPath: pickedPath, table, collection });
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
          <Database className="w-3.5 h-3.5 text-primary" />
        </div>
        <h2 className="font-semibold text-sm">Watch databases</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Studio re-ingests SQLite rows automatically (debounced) when the file changes.
        Each entry targets a specific SQLite-type collection.
      </p>

      <ul className="space-y-1.5">
        {watchDatabases.map((w) => (
          <li key={w.dbPath} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-mono truncate" title={w.dbPath}>{basename(w.dbPath)}</p>
              <p className="text-[10px] text-muted-foreground truncate">{w.table}</p>
            </div>
            <Select
              value={w.collection}
              onValueChange={(v) => setWatchDatabaseCollection(w.dbPath, v)}
            >
              <SelectTrigger className="h-7 text-xs w-44" aria-label={`Target collection for ${w.dbPath}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Keep the current value visible even if it's not in the eligible list
                    (e.g. collection was deleted). */}
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
              onClick={() => void removeWatchDatabase(w.dbPath)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Stop watching ${w.dbPath}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </li>
        ))}
      </ul>

      {wizardOpen ? (
        <div className="rounded-md border border-dashed p-2.5 space-y-2 bg-muted/20">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">SQLite file</label>
            <div className="flex gap-1.5">
              <span
                className="flex-1 truncate text-xs font-mono px-2 py-1 rounded bg-background border"
                title={pickedPath || "No file selected"}
              >
                {pickedPath ? basename(pickedPath) : "—"}
              </span>
              <Button size="sm" variant="outline" onClick={() => void handlePickFile()}>
                {pickedPath ? "Change…" : "Pick file…"}
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Table</label>
            <Select value={table} onValueChange={setTable} disabled={tables.length === 0}>
              <SelectTrigger className="h-7 text-xs" aria-label="Table">
                <SelectValue placeholder={tables.length === 0 ? "Pick a file first" : "Select a table"} />
              </SelectTrigger>
              <SelectContent>
                {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
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
                      ? "Ingest a SQLite collection first"
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
              disabled={busy || !pickedPath || !table || !collection}
            >
              Add
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full" onClick={() => setWizardOpen(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add database
        </Button>
      )}
    </div>
  );
}
