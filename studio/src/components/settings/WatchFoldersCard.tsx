import { useEffect } from "react";
import { Eye, Plus, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { useAppStore, useIsPro } from "@/store/app";
import { ProBadge } from "@/components/license/ProBadge";
import { cn } from "@/lib/utils";

export function WatchFoldersCard() {
  const isPro = useIsPro();
  const { watchFolders, addWatchFolder, removeWatchFolder,
          currentDb, currentCollection, apiUrl, openUpgradeModal } = useAppStore();

  useEffect(() => {
    if (!isPro) return;
    const unsub = listen<{ folder: string; paths: string[] }>("watch:changed", async (evt) => {
      if (!currentDb || !currentCollection) return;
      await fetch(`${apiUrl}/collections/${currentCollection}/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ db_path: currentDb, path: evt.payload.folder, incremental: true }),
      });
    });
    return () => { void unsub.then((fn) => fn()); };
  }, [isPro, currentDb, currentCollection, apiUrl]);

  async function handleAdd() {
    const chosen = await openDialog({ directory: true, multiple: false });
    if (typeof chosen === "string" && chosen) await addWatchFolder(chosen);
  }

  const cardCls = cn(
    "rounded-xl border p-3 space-y-2.5",
    isPro ? "bg-card" : "bg-primary/5 border-primary/25",
  );

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-2">
        <div className="size-5 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Eye className="w-3 h-3 text-muted-foreground" />
        </div>
        <h2 className="font-semibold text-sm">Watch folders</h2>
        {!isPro && <ProBadge className="ml-auto" />}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Studio re-ingests changes automatically (debounced). Uses your current project and collection.
      </p>

      {isPro ? (
        <>
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
          <Button size="sm" variant="outline" className="w-full" onClick={() => void handleAdd()}>
            <Plus className="w-3 h-3 mr-1.5" /> Add folder
          </Button>
        </>
      ) : (
        <Button
          size="sm"
          className="w-full"
          onClick={() => openUpgradeModal("watch-folder")}
        >
          Unlock with Pro
        </Button>
      )}
    </div>
  );
}
