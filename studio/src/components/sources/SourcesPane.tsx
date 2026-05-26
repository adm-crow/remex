import { useState } from "react";
import { ChevronRight, ChevronDown, Trash2, RefreshCw, AlertTriangle, FileText, Database, Pencil, RotateCcw, MessageSquare, MoreVertical } from "lucide-react";

import { errMsg } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
  useRenameCollection,
  useUpdateCollectionDescription,
  type SourceItem,
} from "@/hooks/useApi";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import { RenameCollectionDialog } from "./RenameCollectionDialog";

// ── Per-collection sources list ───────────────────────────────────────────

interface SourcesListProps {
  apiUrl: string;
  dbPath: string;
  collection: string;
}

function SourcesList({ apiUrl, dbPath, collection }: SourcesListProps) {
  const [confirmDelete, setConfirmDelete] = useState<SourceItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkFailCount, setBulkFailCount] = useState(0);
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

  async function handleBulkDelete() {
    setIsBulkDeleting(true);
    setBulkFailCount(0);
    let fails = 0;
    for (const src of selected) {
      try { await deleteMutation.mutateAsync(src); } catch { fails++; }
    }
    setIsBulkDeleting(false);
    setBulkFailCount(fails);
    setSelected(new Set());
    setConfirmBulk(false);
  }

  return (
    <>
      {bulkFailCount > 0 && (
        <div className="px-3 py-1.5 border-b bg-destructive/10 text-xs text-destructive">
          {bulkFailCount} source{bulkFailCount !== 1 ? "s" : ""} could not be deleted.
        </div>
      )}
      {selected.size > 0 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </button>
            <Button
              variant="destructive"
              size="sm"
              className="h-6 text-xs px-2"
              onClick={() => setConfirmBulk(true)}
            >
              Delete {selected.size}
            </Button>
          </div>
        </div>
      )}
      <div className="flex flex-col gap-px py-1">
        {sources
          .filter((s) => !confirmDelete || s.source !== confirmDelete.source)
          .map((item) => (
            <div
              key={item.source}
              className="group flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
            >
              <input
                type="checkbox"
                checked={selected.has(item.source)}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(item.source);
                    else next.delete(item.source);
                    return next;
                  });
                }}
                className="w-3 h-3 accent-primary shrink-0"
                aria-label={`Select ${item.source}`}
              />
              <span
                className="text-xs font-mono truncate flex-1 text-muted-foreground"
                title={item.source}
              >
                {item.source}
              </span>
              {item.chunk_count > 0 && (
                <>
                  <span className="text-xs text-muted-foreground/50 shrink-0 select-none">·</span>
                  <span className="text-xs tabular-nums text-muted-foreground/70 shrink-0">
                    {item.chunk_count.toLocaleString()}
                  </span>
                </>
              )}
              <button
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive p-1 rounded transition-all duration-100"
                onClick={() => setConfirmDelete(item)}
                aria-label={`Delete ${item.source}`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
      </div>

      {/* Single-delete confirmation */}
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

      {/* Bulk-delete confirmation */}
      <Dialog open={confirmBulk} onOpenChange={(open) => !open && setConfirmBulk(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} sources</DialogTitle>
            <DialogDescription>
              This will remove all ingested chunks for the selected sources. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBulk(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={isBulkDeleting}
              onClick={handleBulkDelete}
            >
              {isBulkDeleting ? "Deleting…" : `Delete ${selected.size}`}
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
  isIncomplete: boolean;
}

function CollectionCard({ name, apiUrl, dbPath, isCurrent, collectionType, isIncomplete }: CollectionCardProps) {
  const [expanded,      setExpanded]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renameOpen,    setRenameOpen]    = useState(false);
  const [descOpen,      setDescOpen]      = useState(false);
  const [descDraft,     setDescDraft]     = useState("");
  const [purgeResult, setPurgeResult] = useState<{
    deleted: number;
    checked: number;
  } | null>(null);

  const currentCollection         = useAppStore((s) => s.currentCollection);
  const setCurrentCollection      = useAppStore((s) => s.setCurrentCollection);
  const setCollectionType         = useAppStore((s) => s.setCollectionType);
  const removeCollectionType      = useAppStore((s) => s.removeCollectionType);
  const setIncompleteCollection   = useAppStore((s) => s.setIncompleteCollection);
  const clearIncompleteCollection = useAppStore((s) => s.clearIncompleteCollection);
  const lastIngestParamsMap       = useAppStore((s) => s.lastIngestParamsMap);
  const setIngestPrefill          = useAppStore((s) => s.setIngestPrefill);
  const setRequestedView          = useAppStore((s) => s.setRequestedView);
  const setLastIngestParams       = useAppStore((s) => s.setLastIngestParams);
  const removeLastIngestParams    = useAppStore((s) => s.removeLastIngestParams);

  const { data: stats, isLoading: statsLoading } = useCollectionStats(apiUrl, dbPath, name);
  const purgeMutation  = usePurgeCollection(apiUrl, dbPath, name);
  const deleteMutation = useDeleteCollection(apiUrl, dbPath);
  const renameMutation = useRenameCollection(apiUrl, dbPath);
  const descMutation   = useUpdateCollectionDescription(apiUrl, dbPath, name);

  const lastIngestParams = lastIngestParamsMap[`${dbPath}::${name}`];

  async function handlePurge() {
    setPurgeResult(null);
    try {
      const res = await purgeMutation.mutateAsync();
      setPurgeResult({ deleted: res.chunks_deleted, checked: res.chunks_checked });
    } catch {
      // surfaced via purgeMutation.error
    }
  }

  function handleOpenDesc() {
    setDescDraft(stats?.description ?? "");
    setDescOpen(true);
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
          {isIncomplete && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />}
          <span className="font-medium text-sm truncate">{name}</span>
          {isCurrent && (
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0 shrink-0 bg-primary/10 text-primary border-primary/20"
            >
              active
            </Badge>
          )}
          {isIncomplete && (
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0 shrink-0 bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
            >
              Incomplete
            </Badge>
          )}
        </button>

        {purgeMutation.isPending && (
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" aria-label="Purging" />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-muted shrink-0"
              aria-label={`Actions for ${name}`}
              title="Collection actions"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {lastIngestParams && (
              <DropdownMenuItem
                onSelect={() => {
                  setIngestPrefill(lastIngestParams);
                  setRequestedView("ingest");
                }}
              >
                <RotateCcw />
                Re-ingest with last parameters
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={handleOpenDesc}>
              <MessageSquare />
              Edit description
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={handlePurge}
              disabled={purgeMutation.isPending}
            >
              <RefreshCw />
              Purge stale chunks
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setRenameOpen(true)}
              disabled={renameMutation.isPending}
            >
              <Pencil />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setConfirmDelete(true)}
              disabled={deleteMutation.isPending}
              className="text-destructive focus:text-destructive [&_svg]:text-destructive"
            >
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
              {errMsg(deleteMutation.error)}
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
                  clearIncompleteCollection(dbPath, name);
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

      {/* Rename dialog */}
      <RenameCollectionDialog
        open={renameOpen}
        currentName={name}
        onClose={() => setRenameOpen(false)}
        isLoading={renameMutation.isPending}
        error={renameMutation.error?.message ?? null}
        onRename={(newName) => {
          renameMutation.mutate(
            { collection: name, newName },
            {
              onSuccess: (data) => {
                setRenameOpen(false);
                if (currentCollection === data.old_name) {
                  setCurrentCollection(data.new_name);
                }
                if (collectionType !== undefined) {
                  setCollectionType(dbPath, data.new_name, collectionType);
                }
                removeCollectionType(dbPath, data.old_name);
                if (isIncomplete) {
                  clearIncompleteCollection(dbPath, data.old_name);
                  setIncompleteCollection(dbPath, data.new_name);
                }
                const oldParams = lastIngestParamsMap[`${dbPath}::${data.old_name}`];
                if (oldParams) {
                  setLastIngestParams(dbPath, data.new_name, oldParams);
                  removeLastIngestParams(dbPath, data.old_name);
                }
              },
            }
          );
        }}
      />

      {/* Description dialog */}
      <Dialog open={descOpen} onOpenChange={(open) => !open && setDescOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Collection description</DialogTitle>
            <DialogDescription>
              A short note about what this collection contains.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="desc-input" className="text-xs text-muted-foreground">Description</Label>
            <Input
              id="desc-input"
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder="e.g. Company knowledge base, Q1 2024 documents…"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{descDraft.length}/500</p>
          </div>
          {descMutation.error && (
            <p className="text-xs text-destructive">
              {errMsg(descMutation.error)}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDescOpen(false)}>Cancel</Button>
            <Button
              disabled={descMutation.isPending}
              onClick={async () => {
                try {
                  await descMutation.mutateAsync(descDraft);
                  setDescOpen(false);
                } catch { /* surfaced above */ }
              }}
            >
              {descMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stats row — inline dot-separated, single line */}
      {statsLoading ? (
        <div className="px-4 pb-2 text-xs text-muted-foreground">Loading stats…</div>
      ) : stats ? (
        <div className="px-4 pb-2 space-y-1">
          <p className="text-xs text-muted-foreground truncate" title={`${stats.total_chunks} chunks · ${stats.total_sources} ${collectionType === "sqlite" ? "tables" : "documents"} · ${stats.embedding_model}`}>
            <span className="tabular-nums text-foreground">{stats.total_chunks.toLocaleString()}</span> chunks
            <span className="px-1.5">·</span>
            <span className="tabular-nums text-foreground">{stats.total_sources.toLocaleString()}</span> {collectionType === "sqlite" ? "tables" : "documents"}
            <span className="px-1.5">·</span>
            <span className="font-mono">{stats.embedding_model}</span>
          </p>
          {stats.description && (
            <p className="text-xs text-muted-foreground italic truncate" title={stats.description}>{stats.description}</p>
          )}
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
          {errMsg(purgeMutation.error)}
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
  const { apiUrl, currentDb, currentCollection, collectionTypes, incompleteCollections } = useAppStore();

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
      <div className="px-4 py-2 border-b flex items-center gap-2 shrink-0">
        <h2 className="font-semibold text-sm">Collections</h2>
        <span className="text-xs text-muted-foreground">
          · {collections.length} collection{collections.length !== 1 ? "s" : ""}
        </span>
      </div>

      {collections.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center">
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
                isIncomplete={!!incompleteCollections[`${currentDb}::${name}`]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
