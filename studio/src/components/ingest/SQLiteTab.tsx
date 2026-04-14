import { useState, useRef } from "react";
import { Play, AlertCircle } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { EmbeddingModelField } from "./EmbeddingModelField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";
import type { IngestResultResponse } from "@/api/client";

export function SQLiteTab() {
  const { apiUrl, currentDb, currentCollection, setCollectionType } = useAppStore();

  const [sqlitePath,      setSqlitePath]      = useState("");
  const [tables,          setTables]          = useState<string[]>([]);
  const [selectedTable,   setSelectedTable]   = useState("");
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [tableError,      setTableError]      = useState<string | null>(null);
  const [collectionName,  setCollectionName]  = useState(currentCollection ?? "");
  const [columns,         setColumns]         = useState("");
  const [idColumn,        setIdColumn]        = useState("id");
  const [rowTemplate,     setRowTemplate]     = useState("");
  const [embeddingModel,  setEmbeddingModel]  = useState("all-MiniLM-L6-v2");
  const [isRunning,       setIsRunning]       = useState(false);
  const [result,          setResult]          = useState<IngestResultResponse | null>(null);
  const [runError,        setRunError]        = useState<string | null>(null);

  const loadAbortRef = useRef<AbortController | null>(null);
  const queryClient = useQueryClient();

  async function loadTables(path: string) {
    loadAbortRef.current?.abort();
    const ctrl = new AbortController();
    loadAbortRef.current = ctrl;

    setIsLoadingTables(true);
    setTableError(null);
    setTables([]);
    setSelectedTable("");
    try {
      const resp = await api.listSqliteTables(apiUrl, path);
      if (ctrl.signal.aborted) return;
      setTables(resp.tables);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setTableError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!ctrl.signal.aborted) setIsLoadingTables(false);
    }
  }

  async function handleBrowse() {
    const selected = await open({
      title: "Select SQLite database",
      filters: [{ name: "SQLite", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    if (typeof selected === "string") {
      setSqlitePath(selected);
      await loadTables(selected);
    }
  }

  async function handlePathChange(path: string) {
    setSqlitePath(path);
    if (path) {
      await loadTables(path);
    } else {
      setTables([]);
      setSelectedTable("");
      setTableError(null);
    }
  }

  async function handleRun() {
    if (!sqlitePath || !selectedTable || !collectionName || !currentDb) return;
    setCollectionType(currentDb, collectionName, "sqlite");
    setIsRunning(true);
    setResult(null);
    setRunError(null);
    try {
      const res = await api.ingestSqlite(apiUrl, currentDb, collectionName, {
        sqlite_path: sqlitePath,
        table: selectedTable,
        embedding_model: embeddingModel,
        columns: columns
          ? columns.split(",").map((c) => c.trim()).filter(Boolean)
          : undefined,
        id_column: idColumn || "id",
        row_template: rowTemplate || undefined,
      });
      setResult(res);
      queryClient.invalidateQueries({
        queryKey: ["sources", apiUrl, currentDb, collectionName],
      });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRunning(false);
    }
  }

  const canRun = !isRunning && !!sqlitePath && !!selectedTable && !!collectionName;

  return (
    <div className="flex flex-col h-full p-6 gap-4 overflow-y-auto">

      {/* SQLite file picker */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">SQLite database</Label>
        <div className="flex gap-2">
          <Input
            value={sqlitePath}
            onChange={(e) => handlePathChange(e.target.value)}
            placeholder="/path/to/database.db"
            className="flex-1"
            aria-label="SQLite database path"
          />
          <Button variant="outline" onClick={handleBrowse} aria-label="Browse">
            Browse
          </Button>
        </div>
      </div>

      {/* Table dropdown */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Table</Label>
        <Select
          value={selectedTable}
          onValueChange={setSelectedTable}
          disabled={!sqlitePath || isLoadingTables || !!tableError || tables.length === 0}
        >
          <SelectTrigger aria-label="Select table">
            <SelectValue
              placeholder={
                isLoadingTables
                  ? "Loading tables…"
                  : tableError
                  ? "Error loading tables"
                  : !sqlitePath
                  ? "Select a database first"
                  : tables.length === 0
                  ? "No tables found"
                  : "Select a table…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {tables.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tableError && (
          <p className="text-xs text-destructive">{tableError}</p>
        )}
      </div>

      {/* Collection name */}
      <div className="space-y-1">
        <Label htmlFor="sqlite-collection" className="text-xs text-muted-foreground">
          Collection name
        </Label>
        <Input
          id="sqlite-collection"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder={currentCollection ?? "collection"}
          className="h-8 text-sm"
          aria-label="SQLite collection"
        />
      </div>

      {/* Advanced */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground px-0">
            Advanced ▾
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-2">
          <div className="space-y-1">
            <Label htmlFor="sqlite-columns" className="text-xs">
              Columns (comma-separated, empty = all)
            </Label>
            <Input
              id="sqlite-columns"
              value={columns}
              onChange={(e) => setColumns(e.target.value)}
              placeholder="title, body, author"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sqlite-id-col" className="text-xs">ID column</Label>
            <Input
              id="sqlite-id-col"
              value={idColumn}
              onChange={(e) => setIdColumn(e.target.value)}
              placeholder="id"
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sqlite-template" className="text-xs">
              Row template (optional)
            </Label>
            <Textarea
              id="sqlite-template"
              value={rowTemplate}
              onChange={(e) => setRowTemplate(e.target.value)}
              placeholder="{title}: {body}"
              rows={3}
              className="text-xs resize-none"
            />
          </div>
          <EmbeddingModelField
            inputId="sqlite-embedding-model"
            value={embeddingModel}
            onChange={setEmbeddingModel}
          />
        </CollapsibleContent>
      </Collapsible>

      <Button
        onClick={handleRun}
        disabled={!canRun}
        aria-label="Run ingest"
      >
        <Play className="w-4 h-4 mr-2" />
        {isRunning ? "Ingesting…" : "Start ingest"}
      </Button>

      {runError && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{runError}</span>
        </div>
      )}

      {result && (
        <Card className="px-4 text-sm space-y-1">
          <p>
            Found: {result.sources_found} · Ingested: {result.sources_ingested} · Skipped:{" "}
            {result.sources_skipped}
          </p>
          <p>Chunks stored: {result.chunks_stored}</p>
        </Card>
      )}
    </div>
  );
}
