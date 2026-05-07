import { useEffect, useState } from "react";
import { Eye, Plus, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { fetch } from "@tauri-apps/plugin-http";
import { Button } from "@/components/ui/button";
import { useAppStore, useIsPro } from "@/store/app";
import { ProBadge } from "@/components/license/ProBadge";

export function WatchFoldersCard() {
  const isPro = useIsPro();
  const { watchFolders, addWatchFolder, removeWatchFolder,
          currentDb, currentCollection, apiUrl, openUpgradeModal,
          setLastIngestResult, setIngestDoneUnread } = useAppStore();
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPro) return;
    const unsub = listen<{ folder: string; paths: string[] }>("watch:changed", async (evt) => {
      // Capture project state at event time — these can change while the async
      // ingest is in-flight and using the closure values would attribute results
      // to the wrong collection.
      const db = currentDb;
      const col = currentCollection;
      if (!db || !col) return;
      const startedAt = new Date().toISOString();
      const ingestResp = await fetch(
        `${apiUrl}/collections/${encodeURIComponent(col)}/ingest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ db_path: db, source_dir: evt.payload.folder, incremental: true }),
        }
      ).catch((err) => { console.error("[watch] auto-ingest failed:", err); return null; });
      if (!ingestResp) return;
      if (!ingestResp.ok) { console.error("[watch] auto-ingest failed: HTTP", ingestResp.status); return; }
      const result = await ingestResp.json().catch(() => null);
      if (result) {
        setLastIngestResult({
          collection: col,
          sourcePath: evt.payload.folder,
          startedAt,
          completedAt: new Date().toISOString(),
          sourcesFound: result.sources_found ?? 0,
          sourcesIngested: result.sources_ingested ?? 0,
          sourcesSkipped: result.sources_skipped ?? 0,
          chunksStored: result.chunks_stored ?? 0,
          skippedReasons: result.skipped_reasons ?? [],
        });
        setIngestDoneUnread(true);
      }
      await fetch(
        `${apiUrl}/collections/${encodeURIComponent(col)}/purge?db_path=${encodeURIComponent(db)}`,
        { method: "POST" }
      ).catch((err) => console.error("[watch] purge failed:", err));
    });
    return () => { void unsub.then((fn) => fn()); };
  }, [isPro, currentDb, currentCollection, apiUrl, setLastIngestResult, setIngestDoneUnread]);

  async function handleAdd() {
    setAddError(null);
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string" && chosen) {
      try {
        await addWatchFolder(chosen);
      } catch (err) {
        setAddError(String(err));
      }
    }
  }

  if (!isPro) {
    return (
      <button
        type="button"
        onClick={() => openUpgradeModal("watch-folder")}
        aria-label="Unlock watch folders with Pro"
        className="w-full text-left rounded-xl border p-3 space-y-2.5 transition-colors bg-primary/5 border-primary/25 hover:bg-primary/10 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="size-5 rounded-md bg-muted flex items-center justify-center shrink-0">
            <Eye className="w-3 h-3 text-muted-foreground" />
          </div>
          <h2 className="font-semibold text-sm">Watch folders</h2>
          <ProBadge className="ml-auto" />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Studio re-ingests changes automatically (debounced). Uses your current project and collection.
        </p>
      </button>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="size-5 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Eye className="w-3 h-3 text-muted-foreground" />
        </div>
        <h2 className="font-semibold text-sm">Watch folders</h2>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Studio re-ingests changes automatically (debounced). Uses your current project and collection.
      </p>
      <ul className="space-y-1">
        {watchFolders.map((p) => (
          <li key={p} className="flex items-center gap-2 text-xs font-mono">
            <span className="truncate flex-1" title={p}>{p}</span>
            <button
              type="button"
              onClick={() => void removeWatchFolder(p)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={`Stop watching ${p}`}
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      {addError && (
        <p className="text-xs text-destructive">{addError}</p>
      )}
      <Button size="sm" variant="outline" className="w-full" onClick={() => void handleAdd()}>
        <Plus className="w-3 h-3 mr-1.5" /> Add folder
      </Button>
    </div>
  );
}
