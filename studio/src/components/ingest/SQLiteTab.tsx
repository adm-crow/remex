import { useState, useRef, useEffect } from "react";
import { Play, AlertCircle, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { formatDuration } from "@/lib/formatDuration";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/constants";

/** Sentinel value that can never be a real SQLite table name. */
const ALL_TABLES = "\x00__all__";

export function SQLiteTab() {
  const {
    apiUrl, currentDb, currentCollection,
    setCollectionType, setLastIngestResult, setIngestDoneUnread,
    setIncompleteCollection, clearIncompleteCollection,
    sqliteIngestRunning, sqliteIngestRowsDone, sqliteIngestRowsTotal,
    sqliteIngestStreamError,
    resetSqliteIngestSession, setSqliteIngestRunning,
    setSqliteIngestRowsDone, setSqliteIngestRowsTotal,
    setSqliteIngestStreamError,
  } = useAppStore();

  // Reset session state when navigating away after a completed ingest
  useEffect(() => {
    return () => {
      if (!useAppStore.getState().sqliteIngestRunning) {
        resetSqliteIngestSession();
        setLastIngestResult(null);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [sqlitePath,      setSqlitePath]      = useState("");
  const [tables,          setTables]          = useState<string[]>([]);
  const [selectedTable,   setSelectedTable]   = useState("");
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [tableError,      setTableError]      = useState<string | null>(null);
  const [collectionName,  setCollectionName]  = useState(currentCollection ?? "");
  const [appendModel,     setAppendModel]     = useState(false);
  const [columns,         setColumns]         = useState("");
  const [idColumn,        setIdColumn]        = useState("id");
  const [rowTemplate,     setRowTemplate]     = useState("");
  const [embeddingModel,  setEmbeddingModel]  = useState(DEFAULT_EMBEDDING_MODEL);
  const [incremental,     setIncremental]     = useState(false);
  const [result,          setResult]          = useState<IngestResultResponse | null>(null);
  const [duration,        setDuration]        = useState<string | null>(null);
  const [eta,             setEta]             = useState<string | null>(null);
  const [showDoneAlert,   setShowDoneAlert]   = useState(false);
  const [wasCancelled,    setWasCancelled]    = useState(false);

  const loadAbortRef  = useRef<AbortController | null>(null);
  const runAbortRef   = useRef<AbortController | null>(null);
  const abortedRef    = useRef(false);
  const startTimeRef  = useRef<number | null>(null);
  // Tracks live progress outside React state so the cancel handler (a stale closure) reads the correct value.
  const rowsDoneRef   = useRef(0);
  const queryClient  = useQueryClient();

  const effectiveCollection = appendModel
    ? `${collectionName}-${embeddingModel}`.replace(/[^a-zA-Z0-9_-]/g, "-")
    : collectionName;

  // ETA ticker — recalculates every second while running.
  useEffect(() => {
    if (!sqliteIngestRunning || sqliteIngestRowsDone === 0 || sqliteIngestRowsTotal === 0) {
      if (!sqliteIngestRunning) setEta(null);
      return;
    }
    function update() {
      if (!startTimeRef.current) return;
      const elapsed = Date.now() - startTimeRef.current;
      const msPerRow = elapsed / sqliteIngestRowsDone;
      const remainingMs = msPerRow * (sqliteIngestRowsTotal - sqliteIngestRowsDone);
      setEta(remainingMs < 2000 ? "< 2s" : formatDuration(remainingMs));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [sqliteIngestRunning, sqliteIngestRowsDone, sqliteIngestRowsTotal]);

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

  async function ingestOneTable(
    table: string,
    signal: AbortSignal,
    /** Offset added to progress so multi-table totals are cumulative. */
    rowOffset: number,
  ): Promise<IngestResultResponse | null> {
    let tableResult: IngestResultResponse | null = null;
    for await (const event of api.ingestSqliteStream(
      apiUrl, currentDb!, effectiveCollection,
      {
        sqlite_path: sqlitePath,
        table,
        embedding_model: embeddingModel,
        columns: columns
          ? columns.split(",").map((c) => c.trim()).filter(Boolean)
          : undefined,
        id_column: idColumn || "id",
        row_template: rowTemplate || undefined,
        incremental,
      },
      signal,
    )) {
      if (event.type === "progress") {
        setSqliteIngestRowsDone(rowOffset + event.files_done);
        rowsDoneRef.current = rowOffset + event.files_done;
        setSqliteIngestRowsTotal(rowOffset + event.files_total);
      } else if (event.type === "done") {
        tableResult = event.result;
      } else if (event.type === "error") {
        setSqliteIngestStreamError(event.detail);
      }
    }
    return tableResult;
  }

  async function handleRun() {
    if (!sqlitePath || !selectedTable || !effectiveCollection || !currentDb) return;

    const tablesToIngest = selectedTable === ALL_TABLES ? tables : [selectedTable];
    if (tablesToIngest.length === 0) return;

    resetSqliteIngestSession();
    setSqliteIngestRunning(true);
    setResult(null);
    setDuration(null);
    rowsDoneRef.current = 0;
    abortedRef.current = false;
    setEta(null);
    setShowDoneAlert(false);
    setWasCancelled(false);
    startTimeRef.current = Date.now();
    const t0 = startTimeRef.current;
    const startedAt = new Date(t0).toISOString();
    runAbortRef.current = new AbortController();

    // Accumulate results across tables
    let totalFound = 0;
    let totalIngested = 0;
    let totalSkipped = 0;
    let totalChunks = 0;
    const allSkippedReasons: string[] = [];

    try {
      let rowOffset = 0;
      for (const table of tablesToIngest) {
        const tableResult = await ingestOneTable(
          table, runAbortRef.current.signal, rowOffset,
        );
        if (tableResult) {
          totalFound    += tableResult.sources_found;
          totalIngested += tableResult.sources_ingested;
          totalSkipped  += tableResult.sources_skipped;
          totalChunks   += tableResult.chunks_stored;
          allSkippedReasons.push(...tableResult.skipped_reasons);
          rowOffset += tableResult.sources_found;
        }
      }

      // Build merged result
      if (abortedRef.current) return; // guard against late events
      const merged: IngestResultResponse = {
        sources_found: totalFound,
        sources_ingested: totalIngested,
        sources_skipped: totalSkipped,
        chunks_stored: totalChunks,
        skipped_reasons: allSkippedReasons,
      };
      const completedAt = new Date().toISOString();
      setDuration(formatDuration(Date.now() - t0));
      setResult(merged);
      if (totalIngested > 0) {
        setCollectionType(currentDb, effectiveCollection, "sqlite");
        clearIncompleteCollection(currentDb, effectiveCollection);
      }
      queryClient.invalidateQueries({ queryKey: ["sources", apiUrl, currentDb, effectiveCollection] });
      queryClient.invalidateQueries({ queryKey: ["collections", apiUrl, currentDb] });
      if (totalIngested > 0) {
        setLastIngestResult({
          collection: effectiveCollection,
          sourcePath: sqlitePath,
          startedAt,
          completedAt,
          sourcesFound:    totalFound,
          sourcesIngested: totalIngested,
          sourcesSkipped:  totalSkipped,
          chunksStored:    totalChunks,
          skippedReasons:  allSkippedReasons,
        });
        setShowDoneAlert(true);
        setIngestDoneUnread(true);
      }
    } catch (e) {
      abortedRef.current = true;
      if (e instanceof DOMException && e.name === "AbortError") {
        if (rowsDoneRef.current > 0) {
          setWasCancelled(true);
          if (currentDb) setIncompleteCollection(currentDb, effectiveCollection);
        }
      } else {
        setSqliteIngestStreamError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setSqliteIngestRunning(false);
    }
  }

  const canRun = !sqliteIngestRunning && !!sqlitePath && !!selectedTable && !!effectiveCollection;

  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-y-auto">

      {/* Database + Table — two compact rows */}
      <div className="space-y-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">SQLite database</Label>
          <div className="flex gap-2">
            <Input
              value={sqlitePath}
              onChange={(e) => { void handlePathChange(e.target.value); }}
              placeholder="/path/to/database.db"
              className="flex-1 h-8 text-sm"
              aria-label="SQLite database path"
            />
            <Button variant="outline" size="sm" onClick={handleBrowse} aria-label="Browse">
              Browse
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Table</Label>
          <Select
            value={selectedTable}
            onValueChange={setSelectedTable}
            disabled={!sqlitePath || isLoadingTables || !!tableError || tables.length === 0}
          >
            <SelectTrigger className="h-8 text-sm" aria-label="Select table">
              <SelectValue
                placeholder={
                  isLoadingTables   ? "Loading tables…"
                  : tableError      ? "Error loading tables"
                  : !sqlitePath     ? "Select a database first"
                  : tables.length === 0 ? "No tables found"
                  : "Select a table…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {tables.length > 1 && (
                <SelectItem value={ALL_TABLES} className="font-medium">
                  All tables ({tables.length})
                </SelectItem>
              )}
              {tables.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tableError && <p className="text-xs text-destructive">{tableError}</p>}
        </div>
      </div>

      {/* Collection name — append-model toggle merged into label row */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="sqlite-collection" className="text-xs text-muted-foreground">
            Collection name
          </Label>
          <div className="flex items-center gap-1.5">
            <Switch
              id="sqlite-append-model"
              checked={appendModel}
              onCheckedChange={setAppendModel}
              aria-label="Append embedding model to collection name"
            />
            <Label htmlFor="sqlite-append-model" className="text-xs text-muted-foreground cursor-pointer">
              +model suffix
            </Label>
          </div>
        </div>
        <Input
          id="sqlite-collection"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder={currentCollection ?? "collection"}
          className="h-8 text-sm"
          aria-label="SQLite collection"
        />
        {appendModel && (
          <p className="text-xs text-muted-foreground">
            Will ingest into:{" "}
            <span className="font-mono font-medium text-foreground">
              {effectiveCollection || "—"}
            </span>
          </p>
        )}
      </div>

      {/* Embedding model — compact segmented control, promoted out of Advanced */}
      <EmbeddingModelField
        inputId="sqlite-embedding-model"
        value={embeddingModel}
        onChange={setEmbeddingModel}
        compact
      />

      {/* Advanced */}
      <Collapsible>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground px-0 h-7 shrink-0">
              Advanced ▾
            </Button>
          </CollapsibleTrigger>
          <div className="h-px bg-border flex-1" />
        </div>
        <CollapsibleContent className="space-y-3 mt-2 bg-primary/5 rounded-lg p-3">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            <div className="flex-1 min-w-[120px] space-y-1">
              <Label htmlFor="sqlite-columns" className="text-xs">Columns (comma-sep.)</Label>
              <Input
                id="sqlite-columns"
                value={columns}
                onChange={(e) => setColumns(e.target.value)}
                placeholder="title, body, author"
                className="h-8 text-xs"
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="sqlite-id-col" className="text-xs">ID column</Label>
              <Input
                id="sqlite-id-col"
                value={idColumn}
                onChange={(e) => setIdColumn(e.target.value)}
                placeholder="id"
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sqlite-template" className="text-xs">Row template (optional)</Label>
            <Input
              id="sqlite-template"
              value={rowTemplate}
              onChange={(e) => setRowTemplate(e.target.value)}
              placeholder="{title}: {body}"
              className="h-8 text-xs"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-2">
        <Switch
          id="sqlite-incremental"
          checked={incremental}
          onCheckedChange={setIncremental}
          aria-label="Incremental ingest"
        />
        <Label htmlFor="sqlite-incremental" className="text-xs text-muted-foreground whitespace-nowrap">
          Incremental
        </Label>
        <Button onClick={handleRun} disabled={!canRun} aria-label="Start ingest" className="flex-1">
          <Play className="w-4 h-4 mr-2" />
          {sqliteIngestRunning ? "Ingesting…" : "Start ingest"}
        </Button>
        {sqliteIngestRunning && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => runAbortRef.current?.abort()}
            aria-label="Stop"
            className="shrink-0"
          >
            Stop
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {(sqliteIngestRunning || (sqliteIngestRowsTotal > 0 && !sqliteIngestStreamError)) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{sqliteIngestRunning ? "Ingesting…" : "Done"}</span>
            <span className="tabular-nums">
              {sqliteIngestRowsTotal === 0
                ? "Loading model…"
                : `${sqliteIngestRowsDone} / ${sqliteIngestRowsTotal}`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            {sqliteIngestRowsTotal > 0 ? (
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${Math.round((sqliteIngestRowsDone / sqliteIngestRowsTotal) * 100)}%` }}
              />
            ) : (
              <div className="h-full rounded-full bg-primary animate-indeterminate" />
            )}
          </div>
          {sqliteIngestRunning && eta && (
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              ~{eta} remaining
            </p>
          )}
        </div>
      )}

      {/* Error */}
      {sqliteIngestStreamError && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{sqliteIngestStreamError}</span>
        </div>
      )}

      {/* Incomplete — ingestion was stopped early */}
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
                Ingestion was stopped early — {sqliteIngestRowsDone} row{sqliteIngestRowsDone !== 1 ? "s" : ""} ingested.
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

      {/* Done alert — mirrors FilesTab */}
      {showDoneAlert && result && (
        <div
          className="flex items-start justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3"
          role="alert"
        >
          <div className="flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium">Ingest complete</p>
              <p className="text-xs opacity-80">
                {result.sources_ingested} ingested · {result.sources_skipped} skipped ·{" "}
                {result.chunks_stored} chunks stored
              </p>
              {duration && (
                <p className="text-xs opacity-80">
                  Duration: <span className="font-medium">{duration}</span>
                </p>
              )}
              {result.skipped_reasons.length > 0 && (
                <details className="mt-1">
                  <summary className="text-xs text-destructive/80 cursor-pointer select-none">
                    {result.skipped_reasons.length} skip reason{result.skipped_reasons.length !== 1 ? "s" : ""}
                  </summary>
                  <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                    {result.skipped_reasons.map((r, i) => (
                      <li key={i} className="text-xs font-mono text-destructive/80 break-all">{r}</li>
                    ))}
                  </ul>
                </details>
              )}
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

      {/* Skipped-only result (no done alert) */}
      {!showDoneAlert && result && result.sources_ingested === 0 && result.skipped_reasons.length > 0 && (
        <details className="text-xs border rounded-md px-3 py-2">
          <summary className="text-destructive cursor-pointer select-none">
            All {result.sources_skipped} rows skipped — click to see reasons
          </summary>
          <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
            {result.skipped_reasons.map((r, i) => (
              <li key={i} className="font-mono text-destructive/80 break-all">{r}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
