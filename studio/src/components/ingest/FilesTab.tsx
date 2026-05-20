import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Loader2, FolderOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDragDrop } from "@/hooks/useDragDrop";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { EmbeddingModelField } from "./EmbeddingModelField";
import { CollectionPicker } from "./CollectionPicker";
import {
  IngestLayout,
  IngestEmptyState,
  IngestProgressBar,
  IngestErrorAlert,
  IngestCancelledAlert,
  IngestDoneAlert,
  IngestActionBar,
} from "./IngestLayout";
import { api } from "@/api/client";
import { useCollections, useCollectionStats } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";
import { formatDuration } from "@/lib/formatDuration";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/constants";
import { STATUS_VARIANT } from "./ingestShared";

export function FilesTab() {
  const queryClient = useQueryClient();
  const {
    apiUrl, currentDb, currentCollection,
    ingestRunning, ingestProgress, ingestFilesDone, ingestFilesTotal,
    ingestStreamError, lastIngestResult,
    resetIngestSession, appendIngestProgress,
    setIngestFilesDone, setIngestFilesTotal,
    setIngestRunning, setIngestStreamError, setLastIngestResult,
    setIngestDoneUnread, setCollectionType,
    setIncompleteCollection, clearIncompleteCollection,
    setIngestPrefill, setLastIngestParams,
  } = useAppStore();

  // Reset session state when navigating away after a completed ingest
  useEffect(() => {
    return () => {
      if (!useAppStore.getState().ingestRunning) {
        resetIngestSession();
        setLastIngestResult(null);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — cleanup depends on store actions that are stable singleton refs

  // Seed ingest knobs from the current project's saved defaults (set via
  // Settings → General → Project defaults). Hard-coded fallbacks apply when
  // no defaults are stored. Lazy initial state so this runs once per mount.
  const projectDefaults = useAppStore.getState().projectDefaults[currentDb ?? ""] ?? {};

  const [sourcePath,     setSourcePath]     = useState("");
  const [collectionName, setCollectionName] = useState(currentCollection ?? "");
  const [appendModel,    setAppendModel]    = useState(false);
  const [chunkSize,      setChunkSize]      = useState(() => projectDefaults.chunkSize ?? 768);
  const [overlap,        setOverlap]        = useState(() => projectDefaults.overlap   ?? 150);
  const [chunking,       setChunking]       = useState<"recursive" | "word" | "sentence">(
    () => projectDefaults.chunking ?? "recursive"
  );
  const [embeddingModel, setEmbeddingModel] = useState(
    () => projectDefaults.embeddingModel ?? DEFAULT_EMBEDDING_MODEL
  );
  const [incremental,    setIncremental]    = useState(false);
  const [showDoneAlert,  setShowDoneAlert]  = useState(false);
  const [wasCancelled,   setWasCancelled]   = useState(false);
  const [eta,            setEta]            = useState<string | null>(null);
  const [modelDownload,  setModelDownload]  = useState<{ downloaded: number; total: number } | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const { isDragging } = useDragDrop((path) => setSourcePath(path));

  // Apply prefill from re-ingest button (CollectionCard → IngestPane). Read once on mount.
  useEffect(() => {
    const prefill = useAppStore.getState().ingestPrefill;
    if (!prefill) return;
    setSourcePath(prefill.sourcePath);
    setChunkSize(prefill.chunkSize);
    setOverlap(prefill.overlap);
    setChunking(prefill.chunking ?? "recursive");
    setEmbeddingModel(prefill.embeddingModel);
    setIncremental(prefill.incremental);
    setIngestPrefill(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — intentionally once on mount

  // Tick every second while ingesting to keep ETA display current.
  useEffect(() => {
    if (!ingestRunning || ingestFilesDone === 0 || ingestFilesTotal === 0) {
      if (!ingestRunning) setEta(null);
      return;
    }
    function update() {
      if (!startTimeRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const msPerFile = elapsed / ingestFilesDone;
      const remainingMs = msPerFile * (ingestFilesTotal - ingestFilesDone);
      setEta(remainingMs < 2000 ? "< 2s" : formatDuration(remainingMs));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [ingestRunning, ingestFilesDone, ingestFilesTotal]);

  // Clear download progress once the ingest itself starts reporting file counts.
  useEffect(() => {
    if (ingestFilesTotal > 0) setModelDownload(null);
  }, [ingestFilesTotal]);

  const effectiveCollection = appendModel
    ? `${collectionName}-${embeddingModel}`.replace(/[^a-zA-Z0-9_-]/g, "-")
    : collectionName;

  const { data: existingCollections = [] } = useCollections(apiUrl, currentDb ?? "");
  const collectionExists = !!effectiveCollection && existingCollections.includes(effectiveCollection);

  // When the user targets an existing collection, ChromaDB requires the same
  // embedding model that built it — picking a different one corrupts the
  // vector space. Look up the stored model and lock the picker.
  const isExistingTarget = collectionExists;
  const existingStatsQuery = useCollectionStats(
    apiUrl,
    currentDb ?? "",
    isExistingTarget ? effectiveCollection : "",
  );
  const lockedModel = isExistingTarget ? existingStatsQuery.data?.embedding_model : undefined;
  const effectiveModel = lockedModel ?? embeddingModel;
  const waitingForLockedModel = isExistingTarget && existingStatsQuery.isLoading;

  async function handleBrowse() {
    const selected = await open({
      directory: true,
      title: "Select source directory",
    });
    if (typeof selected === "string") setSourcePath(selected);
  }

  async function handleStart() {
    if (!sourcePath || !currentDb || !effectiveCollection) return;
    setShowDoneAlert(false);
    setWasCancelled(false);
    setModelDownload(null);
    resetIngestSession();
    setIngestRunning(true);
    abortRef.current = new AbortController();
    startTimeRef.current = Date.now();
    const startedAt = new Date().toISOString();

    try {
      for await (const event of api.ingestFilesStream(
        apiUrl,
        currentDb,
        effectiveCollection,
        {
          source_dir:      sourcePath,
          chunk_size:      chunkSize,
          overlap,
          chunking,
          embedding_model: effectiveModel,
          incremental,
        },
        abortRef.current.signal
      )) {
        if (event.type === "model_download") {
          setModelDownload({ downloaded: event.downloaded_bytes, total: event.total_bytes });
        } else if (event.type === "progress") {
          setIngestFilesDone(event.files_done);
          setIngestFilesTotal(event.files_total);
          appendIngestProgress({
            filename:      event.filename,
            status:        event.status,
            chunks_stored: event.chunks_stored,
          });
        } else if (event.type === "done") {
          if (event.result.sources_ingested > 0) {
            setCollectionType(currentDb, effectiveCollection, "files");
            clearIncompleteCollection(currentDb, effectiveCollection);
          }
          setLastIngestResult({
            collection:      effectiveCollection,
            sourcePath,
            startedAt,
            completedAt:     new Date().toISOString(),
            sourcesFound:    event.result.sources_found,
            sourcesIngested: event.result.sources_ingested,
            sourcesSkipped:  event.result.sources_skipped,
            chunksStored:    event.result.chunks_stored,
            skippedReasons:  event.result.skipped_reasons,
          });
          if (event.result.sources_ingested > 0) {
            setLastIngestParams(currentDb, effectiveCollection, {
              sourcePath,
              chunkSize,
              overlap,
              embeddingModel: effectiveModel,
              incremental,
              chunking,
            });
          }
          queryClient.invalidateQueries({
            queryKey: ["sources", apiUrl, currentDb, effectiveCollection],
          });
          queryClient.invalidateQueries({
            queryKey: ["collections", apiUrl, currentDb],
          });
          if (event.result.sources_ingested > 0) {
            setShowDoneAlert(true);
            setIngestDoneUnread(true);
          }
        } else if (event.type === "error") {
          setIngestStreamError(event.detail);
        }
      }
    } catch (e) {
      if (abortRef.current?.signal.aborted === true) {
        if (useAppStore.getState().ingestFilesDone > 0) {
          setWasCancelled(true);
          if (currentDb) setIncompleteCollection(currentDb, effectiveCollection);
        }
      } else {
        setIngestStreamError(String(e));
      }
    } finally {
      setIngestRunning(false);
    }
  }

  const hasActivity =
    ingestRunning ||
    ingestProgress.length > 0 ||
    ingestStreamError !== null ||
    wasCancelled ||
    (showDoneAlert && lastIngestResult !== null);

  const leftColumn = (
    <>
      {/* Directory picker — drop-zone empty state advertises drag-drop;
          once a path is set, collapses to a compact Input + Browse row. */}
      <div className="space-y-1">
        <Label htmlFor="source-directory" className="text-xs text-muted-foreground">Source directory</Label>
        {sourcePath === "" ? (
          <div
            className={cn(
              "rounded-lg border-2 border-dashed px-4 py-5 flex flex-col items-center justify-center gap-2 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/10"
                : "border-border bg-muted/20 hover:bg-muted/30"
            )}
          >
            <FolderOpen className={cn(
              "w-7 h-7 transition-colors",
              isDragging ? "text-primary" : "text-muted-foreground/60"
            )} />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {isDragging ? "Drop to set source" : "Drop a folder here"}
              </p>
              <p className="text-xs text-muted-foreground">or paste a path / click Browse</p>
            </div>
            <div className="flex gap-2 w-full pt-1">
              <Input
                id="source-directory"
                value={sourcePath}
                onChange={(e) => setSourcePath(e.target.value)}
                placeholder="/path/to/docs"
                className="flex-1 h-8 text-sm"
                aria-label="Source directory"
              />
              <Button variant="outline" size="sm" onClick={handleBrowse} aria-label="Browse">
                Browse
              </Button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex gap-2 rounded-lg p-1 -m-1 transition-colors",
              isDragging && "bg-primary/5 ring-2 ring-dashed ring-primary/50"
            )}
          >
            <Input
              id="source-directory"
              value={sourcePath}
              onChange={(e) => setSourcePath(e.target.value)}
              placeholder="/path/to/docs"
              className="flex-1 h-8 text-sm"
              aria-label="Source directory"
            />
            <Button variant="outline" size="sm" onClick={handleBrowse} aria-label="Browse">
              Browse
            </Button>
          </div>
        )}
      </div>

      {/* Collection — picker (existing or new) */}
      <div className="space-y-1">
        <Label htmlFor="collection-name" className="text-xs text-muted-foreground">
          Collection
        </Label>
        <CollectionPicker
          inputId="collection-name"
          value={collectionName}
          onChange={setCollectionName}
          existing={existingCollections}
          placeholder={currentCollection ?? "new-collection-name"}
        />
        {collectionExists && !ingestRunning && !existingCollections.includes(collectionName) && (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            <span className="font-mono">{effectiveCollection}</span> already exists — ingesting will append.
          </p>
        )}
        {/* Existing-collection lock — embedding model is fixed by ChromaDB. */}
        {isExistingTarget && (
          <p className="text-xs text-muted-foreground">
            Using <span className="font-mono text-foreground">{lockedModel ?? "…"}</span>
            {" "}<span className="opacity-70">(locked to this collection)</span>
          </p>
        )}
      </div>

      {/* Advanced — chunking knobs + collection-name suffix */}
      <Collapsible>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground px-0 h-7 shrink-0">
              Advanced ▾
            </Button>
          </CollapsibleTrigger>
          <div className="h-px bg-border flex-1" />
        </div>
        <CollapsibleContent className="mt-2 bg-primary/5 rounded-lg p-3 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="chunk-size" className="text-xs whitespace-nowrap">Chunk size</Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="h-8 w-20 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="overlap" className="text-xs whitespace-nowrap">Overlap</Label>
              <Input
                id="overlap"
                type="number"
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value))}
                className="h-8 w-20 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label className="text-xs whitespace-nowrap">Mode</Label>
              <div className="flex rounded-md border overflow-hidden text-xs">
                {([
                  { value: "recursive", label: "Recursive" },
                  { value: "sentence",  label: "Sentence"  },
                  { value: "word",      label: "Word"      },
                ] as const).map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setChunking(value)}
                    className={cn(
                      "px-2.5 py-1 transition-colors",
                      chunking === value
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Embedding model — only meaningful when creating a new collection.
              For existing targets the model is locked, shown above the Advanced section. */}
          {!isExistingTarget && (
            <>
              <div className="h-px bg-border/60" />
              <EmbeddingModelField
                value={embeddingModel}
                onChange={setEmbeddingModel}
                compact
              />
            </>
          )}

          {/* Collection-name suffix — power-user knob for A/B testing embeddings */}
          <div className="h-px bg-border/60" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Switch
                id="append-model"
                checked={appendModel}
                onCheckedChange={setAppendModel}
                aria-label="Append embedding model to collection name"
              />
              <Label htmlFor="append-model" className="text-xs cursor-pointer">
                +model suffix
              </Label>
            </div>
            {appendModel && (
              <p className="text-[11px] text-muted-foreground pl-10">
                → <span className="font-mono font-medium text-foreground">{effectiveCollection || "—"}</span>
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </>
  );

  const rightColumn = !hasActivity ? (
    <IngestEmptyState icon={FolderOpen} />
  ) : (
    <>
      {(ingestRunning || (ingestFilesTotal > 0 && !ingestStreamError)) && (
        <IngestProgressBar
          running={ingestRunning}
          done={ingestFilesDone}
          total={ingestFilesTotal}
          modelDownload={modelDownload}
          eta={eta}
        />
      )}

      {ingestStreamError && <IngestErrorAlert message={ingestStreamError} />}

      {wasCancelled && (
        <IngestCancelledAlert
          doneCount={ingestFilesDone}
          unit="file"
          onDismiss={() => setWasCancelled(false)}
        />
      )}

      {showDoneAlert && lastIngestResult && (
        <IngestDoneAlert
          sourcesIngested={lastIngestResult.sourcesIngested}
          sourcesSkipped={lastIngestResult.sourcesSkipped}
          chunksStored={lastIngestResult.chunksStored}
          duration={formatDuration(
            new Date(lastIngestResult.completedAt).getTime() -
            new Date(lastIngestResult.startedAt).getTime()
          )}
          completedAt={lastIngestResult.completedAt}
          onDismiss={() => setShowDoneAlert(false)}
        />
      )}

      {(ingestProgress.length > 0 || ingestRunning) && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Files</p>
          <div className="flex flex-col gap-1">
            {ingestProgress.map((p, i) => (
              <div
                key={`${p.filename}-${i}`}
                className="flex items-center gap-2 text-xs p-1"
              >
                <Badge variant={STATUS_VARIANT[p.status]} className="text-xs shrink-0">
                  {p.status}
                </Badge>
                <span className="font-mono truncate flex-1">{p.filename}</span>
                <span className="text-muted-foreground shrink-0">
                  {p.chunks_stored} chunks
                </span>
              </div>
            ))}
            {ingestRunning && (
              <div className="flex items-center gap-2 text-xs p-1 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
                <span className="truncate flex-1">
                  {ingestFilesTotal === 0
                    ? modelDownload
                      ? "Downloading embedding model… (first use only)"
                      : "Starting ingestion…"
                    : ingestFilesDone >= ingestFilesTotal
                      ? "Storing embeddings…"
                      : `Processing file ${ingestFilesDone} of ${ingestFilesTotal}…`}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const actionBar = (
    <IngestActionBar
      incremental={incremental}
      onIncrementalChange={setIncremental}
      running={ingestRunning}
      startDisabled={ingestRunning || !sourcePath || !effectiveCollection || waitingForLockedModel}
      onStart={handleStart}
      onStop={() => abortRef.current?.abort()}
      incrementalId="incremental"
    />
  );

  return <IngestLayout leftColumn={leftColumn} rightColumn={rightColumn} actionBar={actionBar} />;
}
