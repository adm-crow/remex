import { useState, useRef, useEffect } from "react";
import { Play, AlertCircle, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmbeddingModelField } from "./EmbeddingModelField";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";
import { formatDuration } from "@/lib/formatDuration";

const STATUS_VARIANT = {
  ingested: "default" as const,
  skipped:  "secondary" as const,
  error:    "destructive" as const,
};

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

  const [sourcePath,     setSourcePath]     = useState("");
  const [collectionName, setCollectionName] = useState(currentCollection ?? "");
  const [appendModel,    setAppendModel]    = useState(false);
  const [chunkSize,      setChunkSize]      = useState(1000);
  const [overlap,        setOverlap]        = useState(200);
  const [embeddingModel, setEmbeddingModel] = useState("all-MiniLM-L6-v2");
  const [incremental,    setIncremental]    = useState(false);
  const [showDoneAlert,  setShowDoneAlert]  = useState(false);
  const [wasCancelled,   setWasCancelled]   = useState(false);
  const [eta,            setEta]            = useState<string | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const abortedRef  = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const { isDragging } = useDragDrop((path) => setSourcePath(path));

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

  const effectiveCollection = appendModel
    ? `${collectionName}-${embeddingModel}`.replace(/[^a-zA-Z0-9_-]/g, "-")
    : collectionName;

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
    setIngestDoneUnread(false);
    resetIngestSession();
    setIngestRunning(true);
    abortRef.current = new AbortController();
    abortedRef.current = false;
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
          embedding_model: embeddingModel,
          incremental,
        },
        abortRef.current.signal
      )) {
        if (event.type === "progress") {
          setIngestFilesDone(event.files_done);
          setIngestFilesTotal(event.files_total);
          appendIngestProgress({
            filename:      event.filename,
            status:        event.status,
            chunks_stored: event.chunks_stored,
          });
        } else if (event.type === "done") {
          if (abortedRef.current) continue; // ignore late events after abort
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
      abortedRef.current = true;
      if (e instanceof DOMException && e.name === "AbortError") {
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

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      {/* Directory picker */}
      <div
        className={cn(
          "space-y-1 rounded-lg p-1 -m-1 transition-colors",
          isDragging && "bg-primary/5 ring-2 ring-dashed ring-primary/50"
        )}
      >
        <Label className="text-xs text-muted-foreground">Source directory</Label>
        <div className="flex gap-2">
          <Input
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="/path/to/docs"
            className="flex-1"
            aria-label="Source directory"
          />
          <Button variant="outline" onClick={handleBrowse} aria-label="Browse">
            Browse
          </Button>
        </div>
      </div>

      {/* Collection name */}
      <div className="space-y-1">
        <Label htmlFor="collection-name" className="text-xs text-muted-foreground">
          Collection name
        </Label>
        <Input
          id="collection-name"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder={currentCollection ?? "collection"}
          className="h-8 text-sm"
        />
      </div>

      {/* Append model toggle */}
      <div className="flex items-center gap-2">
        <Switch
          id="append-model"
          checked={appendModel}
          onCheckedChange={setAppendModel}
          aria-label="Append embedding model to collection name"
        />
        <Label htmlFor="append-model" className="text-sm">
          Append embedding model to name
        </Label>
      </div>

      {appendModel && (
        <p className="text-xs text-muted-foreground -mt-2">
          Will ingest into:{" "}
          <span className="font-mono font-medium text-foreground">
            {effectiveCollection || "—"}
          </span>
        </p>
      )}

      {/* Advanced settings */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground px-0 h-7">
            Advanced ▾
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="chunk-size" className="text-xs">Chunk size</Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="overlap" className="text-xs">Overlap</Label>
              <Input
                id="overlap"
                type="number"
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="incremental"
              checked={incremental}
              onCheckedChange={setIncremental}
              aria-label="Incremental ingest"
            />
            <Label htmlFor="incremental" className="text-xs">
              Incremental — skip unchanged files
            </Label>
          </div>
          <EmbeddingModelField
            value={embeddingModel}
            onChange={setEmbeddingModel}
          />
        </CollapsibleContent>
      </Collapsible>

      <div className="flex gap-2">
        <Button
          onClick={handleStart}
          disabled={ingestRunning || !sourcePath || !effectiveCollection}
          aria-label="Start ingest"
          className="flex-1"
        >
          <Play className="w-4 h-4 mr-2" />
          {ingestRunning ? "Ingesting…" : "Start ingest"}
        </Button>
        {ingestRunning && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop"
            className="shrink-0"
          >
            Stop
          </Button>
        )}
      </div>

      {(ingestRunning || (ingestFilesTotal > 0 && !ingestStreamError)) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{ingestRunning ? "Ingesting…" : "Done"}</span>
            <span className="tabular-nums">
              {ingestFilesTotal === 0
                ? "Loading model…"
                : `${ingestFilesDone} / ${ingestFilesTotal}`}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={ingestFilesTotal || 1}
            aria-valuenow={ingestFilesDone}
            aria-label="Ingest progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: ingestFilesTotal > 0
                  ? `${Math.round((ingestFilesDone / ingestFilesTotal) * 100)}%`
                  : ingestRunning ? "5%" : "0%",
              }}
            />
          </div>
          {ingestRunning && eta && (
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              ~{eta} remaining
            </p>
          )}
        </div>
      )}

      {ingestStreamError && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{ingestStreamError}</span>
        </div>
      )}

      {wasCancelled && (
        <div
          className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
          role="alert"
        >
          <div className="flex items-start gap-2.5 text-amber-700 dark:text-amber-400 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Incomplete</p>
              <p className="text-xs opacity-80">
                Ingestion was stopped early — {ingestFilesDone} file{ingestFilesDone !== 1 ? "s" : ""} ingested.
                The collection is partially populated.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWasCancelled(false)}
            className="shrink-0 text-amber-700 dark:text-amber-400 hover:opacity-70 transition-opacity mt-0.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ScrollArea className="flex-1">
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
                {ingestFilesTotal > 0
                  ? `Processing file ${ingestFilesDone + 1} of ${ingestFilesTotal}…`
                  : "Starting ingestion…"}
              </span>
            </div>
          )}
        </div>
      </ScrollArea>

      {showDoneAlert && lastIngestResult && (
        <div
          className="flex items-start justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3"
          role="alert"
        >
          <div className="flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium">Ingest complete</p>
              <p className="text-xs opacity-80">
                {lastIngestResult.sourcesIngested} ingested · {lastIngestResult.sourcesSkipped} skipped ·{" "}
                {lastIngestResult.chunksStored} chunks stored
              </p>
              <p className="text-xs opacity-80">
                Duration:{" "}
                <span className="font-medium">
                  {formatDuration(
                    new Date(lastIngestResult.completedAt).getTime() -
                    new Date(lastIngestResult.startedAt).getTime()
                  )}
                </span>
              </p>
              <p className="text-xs opacity-60 font-mono">
                {new Date(lastIngestResult.completedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDoneAlert(false)}
            className="shrink-0 text-emerald-700 dark:text-emerald-400 hover:opacity-70 transition-opacity mt-0.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
