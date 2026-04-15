import { useState } from "react";
import { ChevronRight, ChevronDown, Trash2, RefreshCw, AlertTriangle, FileText, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useCollections,
  useCollectionStats,
  useSources,
  useDeleteSource,
  usePurgeCollection,
  useDeleteCollection,
  type SourceItem,
} from "@/hooks/useApi";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";

// ── Per-collection sources list ───────────────────────────────────────────

interface SourcesListProps {
  apiUrl: string;
  dbPath: string;
  collection: string;
}

function SourcesList({ apiUrl, dbPath, collection }: SourcesListProps) {
  const [confirmDelete, setConfirmDelete] = useState<SourceItem | null>(null);
  const { data: sources = [], isLoading } = useSources(apiUrl, dbPath, collection);
  const deleteMutation = useDeleteSource(apiUrl, dbPath, collection);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground px-3 py-2">Loading…</p>;
  }
  if (sources.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-3 py-2">No sources.</p>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-px py-1">
        {sources
          .filter((s) => !confirmDelete || s.source !== confirmDelete.source)
          .map((item) => (
            <div
              key={item.source}
              className="group flex items-center justify-between px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <span
                className="text-xs font-mono truncate flex-1 text-muted-foreground"
                title={item.source}
              >
                {item.source}
              </span>
              {item.chunk_count > 0 && (
                <>
                  <span className="text-xs text-muted-foreground/50 shrink-0 mx-2 select-none">·</span>
                  <span className="text-xs tabular-nums text-muted-foreground/70 shrink-0 mr-1">
                    {item.chunk_count.toLocaleString()}
                  </span>
                </>
              )}
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded transition-all duration-100"
                onClick={() => setConfirmDelete(item)}
                aria-label={`Delete ${item.source}`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
      </div>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove source</DialogTitle>
            <DialogDescription>
              This will remove all ingested chunks for this source.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Remove{" "}
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
              {confirmDelete?.source}
            </span>
            ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(confirmDelete!.source);
                  setConfirmDelete(null);
                } catch {
                  // error visible via deleteMutation.error
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Per-collection card ───────────────────────────────────────────────────

interface CollectionCardProps {
  name: string;
  apiUrl: string;
  dbPath: string;
  isCurrent: boolean;
  collectionType: "files" | "sqlite" | undefined;
}

function CollectionCard({ name, apiUrl, dbPath, isCurrent, collectionType }: CollectionCardProps) {
  const [expanded,      setExpanded]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [purgeResult, setPurgeResult] = useState<{
    deleted: number;
    checked: number;
  } | null>(null);

  const { currentCollection, setCurrentCollection, removeCollectionType } = useAppStore();
  const { data: stats, isLoading: statsLoading } = useCollectionStats(
    apiUrl,
    dbPath,
    name
  );
  const purgeMutation  = usePurgeCollection(apiUrl, dbPath, name);
  const deleteMutation = useDeleteCollection(apiUrl, dbPath);

  async function handlePurge() {
    setPurgeResult(null);
    try {
      const res = await purgeMutation.mutateAsync();
      setPurgeResult({ deleted: res.chunks_deleted, checked: res.chunks_checked });
    } catch {
      // surfaced via purgeMutation.error
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card transition-all duration-150 overflow-hidden",
        "hover:border-border/80",
        isCurrent && "border-primary/30 ring-1 ring-primary/10"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${name}`}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          )}
          {collectionType === "files"  && <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />}
          {collectionType === "sqlite" && <Database className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />}
          <span className="font-medium text-sm truncate">{name}</span>
          {isCurrent && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 shrink-0 bg-primary/10 text-primary border-primary/20"
            >
              active
            </Badge>
          )}
        </button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
          onClick={handlePurge}
          disabled={purgeMutation.isPending}
          title="Purge stale chunks"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", purgeMutation.isPending && "animate-spin")} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
          onClick={() => setConfirmDelete(true)}
          disabled={deleteMutation.isPending}
          title="Delete collection"
          aria-label={`Delete collection ${name}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Delete collection
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all chunks and sources in this collection. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm">
            Delete{" "}
            <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{name}</span>?
          </p>
          {deleteMutation.error && (
            <p className="text-xs text-destructive">
              {deleteMutation.error instanceof Error ? deleteMutation.error.message : String(deleteMutation.error)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={async () => {
                try {
                  await deleteMutation.mutateAsync(name);
                  if (currentCollection === name) setCurrentCollection(null);
                  removeCollectionType(dbPath, name);
                  setConfirmDelete(false);
                } catch {
                  // error surfaced via deleteMutation.error above
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats row */}
      {statsLoading ? (
        <div className="px-4 pb-3 text-xs text-muted-foreground">Loading stats…</div>
      ) : stats ? (
        <div className="px-4 pb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>
            <strong className="text-foreground tabular-nums">{stats.total_chunks.toLocaleString()}</strong>{" "}
            chunks
          </span>
          <span>
            <strong className="text-foreground tabular-nums">{stats.total_sources.toLocaleString()}</strong>{" "}
            {collectionType === "sqlite" ? "tables" : "documents"}
          </span>
          <span className="font-mono text-[11px]">{stats.embedding_model}</span>
        </div>
      ) : null}

      {/* Purge feedback */}
      {purgeResult && (
        <div className="px-4 pb-2 text-xs text-muted-foreground border-t pt-2">
          Purged {purgeResult.deleted} / {purgeResult.checked} chunks
        </div>
      )}
      {purgeMutation.error && (
        <div className="px-4 pb-2 text-xs text-destructive border-t pt-2">
          {purgeMutation.error instanceof Error ? purgeMutation.error.message : String(purgeMutation.error)}
        </div>
      )}

      {/* Sources (lazy) */}
      {expanded && (
        <div className="border-t bg-muted/20 px-1">
          <SourcesList apiUrl={apiUrl} dbPath={dbPath} collection={name} />
        </div>
      )}
    </div>
  );
}

// ── Main pane ─────────────────────────────────────────────────────────────

export function SourcesPane() {
  const { apiUrl, currentDb, currentCollection, collectionTypes } = useAppStore();

  const { data: collections = [], isLoading, error } = useCollections(
    apiUrl,
    currentDb ?? ""
  );

  if (!currentDb) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Open a project first.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive" role="alert">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-semibold text-sm">Collections</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {collections.length} collection{collections.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {collections.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="text-sm font-medium text-foreground">No collections yet</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
            Go to the <strong>Ingest</strong> tab, select a source directory, enter a collection
            name and click <strong>Start ingest</strong> to create your first collection.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-4 flex flex-col gap-3">
            {collections.map((name) => (
              <CollectionCard
                key={name}
                name={name}
                apiUrl={apiUrl}
                dbPath={currentDb}
                isCurrent={name === currentCollection}
                collectionType={collectionTypes[`${currentDb}::${name}`]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
