import { useState, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";
import type { IngestResultResponse } from "@/api/client";

interface ProgressItem {
  filename: string;
  status: "ingested" | "skipped" | "error";
  chunks_stored: number;
}

const STATUS_VARIANT = {
  ingested: "default" as const,
  skipped: "secondary" as const,
  error: "destructive" as const,
};

export function IngestPane() {
  const { apiUrl, currentDb, currentCollection } = useAppStore();
  const [sourcePath, setSourcePath] = useState("");
  const [chunkSize, setChunkSize] = useState(1000);
  const [overlap, setOverlap] = useState(200);
  const [embeddingModel, setEmbeddingModel] = useState("all-MiniLM-L6-v2");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [result, setResult] = useState<IngestResultResponse | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleBrowse() {
    const selected = await open({
      directory: true,
      title: "Select source directory",
    });
    if (typeof selected === "string") setSourcePath(selected);
  }

  async function handleStart() {
    if (!sourcePath || !currentDb || !currentCollection) return;
    setIsRunning(true);
    setProgress([]);
    setResult(null);
    setStreamError(null);
    abortRef.current = new AbortController();

    try {
      for await (const event of api.ingestFilesStream(
        apiUrl,
        currentDb,
        currentCollection,
        {
          source_dir: sourcePath,
          chunk_size: chunkSize,
          overlap,
          embedding_model: embeddingModel,
        },
        abortRef.current.signal
      )) {
        if (event.type === "progress") {
          setProgress((prev) => [
            ...prev,
            {
              filename: event.filename,
              status: event.status,
              chunks_stored: event.chunks_stored,
            },
          ]);
        } else if (event.type === "done") {
          setResult(event.result);
        } else if (event.type === "error") {
          setStreamError(event.detail);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setStreamError(String(e));
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col h-full p-6 gap-4">
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

      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground px-0"
          >
            Advanced ▾
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="chunk-size" className="text-xs">
                Chunk size
              </Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="overlap" className="text-xs">
                Overlap
              </Label>
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
        </CollapsibleContent>
      </Collapsible>

      <Button
        onClick={handleStart}
        disabled={isRunning || !sourcePath}
        aria-label="Start ingest"
      >
        {isRunning ? "Ingesting…" : "Start ingest"}
      </Button>

      {streamError && (
        <Card className="border-destructive">
          <CardContent className="pt-4 text-sm text-destructive" role="alert">
            {streamError}
          </CardContent>
        </Card>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {progress.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs p-1">
              <Badge variant={STATUS_VARIANT[p.status]} className="text-xs">
                {p.status}
              </Badge>
              <span className="font-mono truncate flex-1">{p.filename}</span>
              <span className="text-muted-foreground">
                {p.chunks_stored} chunks
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>

      {result && (
        <Card>
          <CardContent className="pt-4 text-sm space-y-1">
            <p>
              Found: {result.sources_found} · Ingested:{" "}
              {result.sources_ingested} · Skipped: {result.sources_skipped}
            </p>
            <p>Chunks stored: {result.chunks_stored}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
