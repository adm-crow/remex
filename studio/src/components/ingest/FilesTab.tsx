import { useState, useRef } from "react";
import { Play, AlertCircle, Loader2, ExternalLink } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDragDrop } from "@/hooks/useDragDrop";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";
import type { ProgressItem } from "@/store/app";

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
  } = useAppStore();

  const [sourcePath,     setSourcePath]     = useState("");
  const [collectionName, setCollectionName] = useState(currentCollection ?? "");
  const [appendModel,    setAppendModel]    = useState(false);
  const [chunkSize,      setChunkSize]      = useState(1000);
  const [overlap,        setOverlap]        = useState(200);
  const [embeddingModel, setEmbeddingModel] = useState("all-MiniLM-L6-v2");
  const abortRef = useRef<AbortController | null>(null);
  const { isDragging } = useDragDrop((path) => setSourcePath(path));

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
    resetIngestSession();
    setIngestRunning(true);
    abortRef.current = new AbortController();

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
          setLastIngestResult({
            collection:      effectiveCollection,
            sourcePath,
            completedAt:     new Date().toISOString(),
            sourcesFound:    event.result.sources_found,
            sourcesIngested: event.result.sources_ingested,
            sourcesSkipped:  event.result.sources_skipped,
            chunksStored:    event.result.chunks_stored,
          });
          queryClient.invalidateQueries({
            queryKey: ["sources", apiUrl, currentDb, effectiveCollection],
          });
          if (event.result.sources_ingested > 0) {
            sendNotification({
              title: "Remex — Ingest complete",
              body:  `${event.result.sources_ingested} files ingested · ${event.result.chunks_stored} chunks stored`,
            });
          }
        } else if (event.type === "error") {
          setIngestStreamError(event.detail);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setIngestStreamError(String(e));
      }
    } finally {
      setIngestRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
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
          <Button variant="ghost" size="sm" className="text-muted-foreground px-0">
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
          <div className="space-y-1">
            <Label htmlFor="embedding-model" className="text-xs">
              Embedding model
            </Label>
            <Input
              id="embedding-model"
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1.5 pt-1">
            <p className="text-xs text-muted-foreground">
              The model used at ingest time <strong className="text-foreground">must match</strong> query time.
            </p>
            {[
              { tag: "Light",        tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400", model: "all-MiniLM-L6-v2",                     desc: "22 MB · fast, good for most cases" },
              { tag: "Large",        tagColor: "bg-primary/15 text-primary",                               model: "BAAI/bge-large-en-v1.5",                desc: "1.3 GB · best English accuracy" },
              { tag: "Multilingual", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",       model: "paraphrase-multilingual-MiniLM-L12-v2", desc: "470 MB · 50+ languages" },
            ].map(({ tag, tagColor, model, desc }) => (
              <button
                key={model}
                type="button"
                className="w-full text-left rounded border bg-muted/30 px-2 py-1 hover:bg-muted/60 transition-colors"
                onClick={() => setEmbeddingModel(model)}
                title={`Use ${model}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${tagColor}`}>{tag}</span>
                  <span className="font-mono text-[11px] truncate">{model}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
              </button>
            ))}
            <div className="flex flex-col gap-1 pt-0.5">
              {[
                { label: "SBERT pretrained models",         href: "https://www.sbert.net/docs/pretrained_models.html" },
                { label: "HuggingFace sentence-similarity", href: "https://huggingface.co/models?pipeline_tag=sentence-similarity&sort=downloads" },
                { label: "Ollama embedding models",         href: "https://ollama.com/search?c=embedding" },
              ].map(({ label, href }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline w-fit">
                  <ExternalLink className="w-3 h-3 shrink-0" />{label}
                </a>
              ))}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Button
        onClick={handleStart}
        disabled={ingestRunning || !sourcePath || !effectiveCollection}
        aria-label="Start ingest"
      >
        <Play className="w-4 h-4 mr-2" />
        {ingestRunning ? "Ingesting…" : "Start ingest"}
      </Button>

      {(ingestRunning || (ingestFilesTotal > 0 && !ingestStreamError)) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{ingestRunning ? "Ingesting…" : "Done"}</span>
            <span className="tabular-nums">
              {ingestFilesDone} / {ingestFilesTotal > 0 ? ingestFilesTotal : "?"}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: ingestFilesTotal > 0
                  ? `${Math.round((ingestFilesDone / ingestFilesTotal) * 100)}%`
                  : ingestRunning ? "5%" : "0%",
              }}
            />
          </div>
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

      {lastIngestResult && (
        <Card>
          <CardContent className="pt-4 text-sm space-y-1">
            {!ingestRunning && (
              <p className="text-xs text-muted-foreground mb-1">
                Last ingest · {new Date(lastIngestResult.completedAt).toLocaleString()}
              </p>
            )}
            <p>
              Found: {lastIngestResult.sourcesFound} · Ingested:{" "}
              {lastIngestResult.sourcesIngested} · Skipped: {lastIngestResult.sourcesSkipped}
            </p>
            <p>Chunks stored: {lastIngestResult.chunksStored}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
