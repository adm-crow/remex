import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useSources,
  useDeleteSource,
  usePurgeCollection,
} from "@/hooks/useApi";
import { useAppStore } from "@/store/app";

export function SourcesPane() {
  const { apiUrl, currentDb, currentCollection } = useAppStore();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [purgeResult, setPurgeResult] = useState<{
    deleted: number;
    checked: number;
  } | null>(null);

  const { data: sources = [], isLoading, error } = useSources(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? ""
  );
  const deleteMutation = useDeleteSource(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? ""
  );
  const purgeMutation = usePurgeCollection(
    apiUrl,
    currentDb ?? "",
    currentCollection ?? ""
  );

  async function handlePurge() {
    setPurgeResult(null);
    try {
      const res = await purgeMutation.mutateAsync();
      setPurgeResult({ deleted: res.chunks_deleted, checked: res.chunks_checked });
    } catch {
      // error is surfaced via purgeMutation.error
    }
  }

  if (isLoading)
    return (
      <div className="p-6 text-sm text-muted-foreground">Loading…</div>
    );
  if (error)
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {error.message}
      </div>
    );

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Sources ({sources.length})</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handlePurge}
          disabled={purgeMutation.isPending}
        >
          {purgeMutation.isPending ? "Purging…" : "Purge stale"}
        </Button>
      </div>

      {purgeResult && (
        <p className="text-sm text-muted-foreground">
          Purged {purgeResult.deleted} chunk(s) from {purgeResult.checked}{" "}
          checked.
        </p>
      )}

      {sources.length === 0 && (
        <p className="text-muted-foreground text-sm">
          Nothing ingested yet — go to Ingest.
        </p>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {sources.filter((s) => s !== confirmDelete).map((source) => (
            <div
              key={source}
              className="flex items-center justify-between p-2 rounded hover:bg-muted group"
            >
              <span
                className="text-sm font-mono truncate flex-1"
                title={source}
              >
                {source}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(source)}
                aria-label={`Delete ${source}`}
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove source</DialogTitle>
            <DialogDescription>
              This will remove all ingested chunks for this source from the collection.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Remove all chunks for{" "}
            <span className="font-mono">{confirmDelete}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(confirmDelete!);
                  setConfirmDelete(null);
                } catch {
                  // keep dialog open; error surfaced via deleteMutation.error
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
