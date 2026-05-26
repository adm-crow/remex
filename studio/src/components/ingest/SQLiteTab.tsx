import { useState, useRef, useEffect } from "react";
import { AlertTriangle, Loader2, Database } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errMsg } from "@/lib/utils";
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
import { Badge } from "@/components/ui/badge";
import { api } from "@/api/client";
import { useCollections, useCollectionStats } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";
import type { IngestResultResponse } from "@/api/client";
import { formatDuration } from "@/lib/formatDuration";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/constants";
import { STATUS_VARIANT } from "./ingestShared";
import { SegmentedControl } from "@/components/ui/segmented-control";

type TableProgress = {
  table: string;
  status: keyof typeof STATUS_VARIANT;
  rowsIngested: number;
  chunksStored: number;
};

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

  // Seed ingest knobs from the current project's saved defaults (set via
  // Settings → General → Project defaults). Lazy initial state.
  const projectDefaults = useAppStore.getState().projectDefaults[currentDb ?? ""] ?? {};

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
  // Source mode — "table" picks a single table from the DB; "sql" lets the user
  // write an arbitrary SELECT/WITH (e.g. JOINs across multiple tables).
  const [sourceMode,      setSourceMode]      = useState<"table" | "sql">("table");
  const [sqlQuery,        setSqlQuery]        = useState("");
  const [embeddingModel,  setEmbeddingModel]  = useState(
    () => projectDefaults.embeddingModel ?? DEFAULT_EMBEDDING_MODEL
  );
  const [incremental,        setIncremental]        = useState(false);
  const [result,             setResult]             = useState<IngestResultResponse | null>(null);
  const [duration,           setDuration]           = useState<string | null>(null);
  const [eta,                setEta]                = useState<string | null>(null);
  const [showDoneAlert,      setShowDoneAlert]      = useState(false);
  const [wasCancelled,       setWasCancelled]       = useState(false);
  const [currentIngestTable, setCurrentIngestTable] = useState<string | null>(null);
  const [tableProgress,      setTableProgress]      = useState<TableProgress[]>([]);
  const [modelDownload,      setModelDownload]      = useState<{ downloaded: number; total: number } | null>(null);

  const loadAbortRef  = useRef<AbortController | null>(null);
  const runAbortRef   = useRef<AbortController | null>(null);
  const startTimeRef  = useRef<number | null>(null);
  // Tracks live progress outside React state so the cancel handler (a stale closure) reads the correct value.
  const rowsDoneRef   = useRef(0);
  const queryClient  = useQueryClient();

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
      setTableError(errMsg(e));
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
    const requestBody: Parameters<typeof api.ingestSqliteStream>[3] = {
      sqlite_path: sqlitePath,
      embedding_model: effectiveModel,
      columns: columns
        ? columns.split(",").map((c) => c.trim()).filter(Boolean)
        : undefined,
      id_column: idColumn || "id",
      row_template: rowTemplate || undefined,
      incremental,
    };
    if (sourceMode === "sql") {
      requestBody.sql_query = sqlQuery;
    } else {
      requestBody.table = table;
    }
    for await (const event of api.ingestSqliteStream(
      apiUrl, currentDb!, effectiveCollection,
      requestBody,
      signal,
    )) {
      if (event.type === "model_download") {
        setModelDownload({ downloaded: event.downloaded_bytes, total: event.total_bytes });
      } else if (event.type === "progress") {
        setModelDownload(null);
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
    if (!sqlitePath || !effectiveCollection || !currentDb) return;
    if (sourceMode === "table" && !selectedTable) return;
    if (sourceMode === "sql" && !sqlQuery.trim()) return;

    resetSqliteIngestSession();
    setModelDownload(null);
    setSqliteIngestRunning(true);
    setResult(null);
    setDuration(null);
    rowsDoneRef.current = 0;
    setEta(null);
    setShowDoneAlert(false);
    setWasCancelled(false);
    setCurrentIngestTable(null);
    setTableProgress([]);
    startTimeRef.current = Date.now();
    const t0 = startTimeRef.current;
    const startedAt = new Date(t0).toISOString();
    runAbortRef.current = new AbortController();

    try {
      const sourceLabel = sourceMode === "sql"
        ? `SQL (${sqlQuery.length} chars)`
        : selectedTable;
      setCurrentIngestTable(sourceLabel);
      const tableResult = await ingestOneTable(
        selectedTable, runAbortRef.current.signal, 0,
      );

      const merged: IngestResultResponse = tableResult ?? {
        sources_found: 0, sources_ingested: 0,
        sources_skipped: 0, chunks_stored: 0, skipped_reasons: [],
      };
      if (tableResult) {
        setTableProgress([{
          table: sourceLabel,
          status: tableResult.sources_ingested > 0 ? "ingested"
                : tableResult.sources_skipped  > 0 ? "skipped"
                : "error",
          rowsIngested: tableResult.sources_ingested,
          chunksStored: tableResult.chunks_stored,
        }]);
      }
      const completedAt = new Date().toISOString();
      setDuration(formatDuration(Date.now() - t0));
      setResult(merged);
      if (merged.sources_ingested > 0) {
        setCollectionType(currentDb, effectiveCollection, "sqlite");
        clearIncompleteCollection(currentDb, effectiveCollection);
      }
      queryClient.invalidateQueries({ queryKey: ["sources", apiUrl, currentDb, effectiveCollection] });
      queryClient.invalidateQueries({ queryKey: ["collections", apiUrl, currentDb] });
      if (merged.sources_ingested > 0) {
        setLastIngestResult({
          collection: effectiveCollection,
          sourcePath: sqlitePath,
          startedAt,
          completedAt,
          sourcesFound:    merged.sources_found,
          sourcesIngested: merged.sources_ingested,
          sourcesSkipped:  merged.sources_skipped,
          chunksStored:    merged.chunks_stored,
          skippedReasons:  merged.skipped_reasons,
        });
        setShowDoneAlert(true);
        setIngestDoneUnread(true);
      }
    } catch (e) {
      const wasAborted = runAbortRef.current?.signal.aborted === true;
      if (wasAborted) {
        if (rowsDoneRef.current > 0) {
          setWasCancelled(true);
          if (currentDb) {
            setIncompleteCollection(currentDb, effectiveCollection);
            setCollectionType(currentDb, effectiveCollection, "sqlite");
          }
          queryClient.invalidateQueries({ queryKey: ["collections", apiUrl, currentDb] });
        }
      } else {
        setSqliteIngestStreamError(errMsg(e));
      }
    } finally {
      setSqliteIngestRunning(false);
      setCurrentIngestTable(null);
    }
  }

  const canRun =
    !sqliteIngestRunning
    && !!sqlitePath
    && !!effectiveCollection
    && !waitingForLockedModel
    && (sourceMode === "sql"
        ? sqlQuery.trim().length > 0 && idColumn.trim().length > 0
        : !!selectedTable);

  const hasActivity =
    sqliteIngestRunning ||
    tableProgress.length > 0 ||
    sqliteIngestStreamError !== null ||
    wasCancelled ||
    (showDoneAlert && result !== null) ||
    (result !== null && result.sources_ingested === 0 && result.skipped_reasons.length > 0);

  const leftColumn = (
    <>
      {/* Database file picker */}
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

      {/* Source mode toggle — table picker or SQL query */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Source</Label>
        <SegmentedControl
          value={sourceMode}
          onChange={setSourceMode}
          ariaLabel="Source mode"
          options={[
            { value: "table", label: "Table" },
            { value: "sql",   label: "SQL query" },
          ] as const}
        />
      </div>

      {sourceMode === "table" ? (
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
              {tables.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tableError && <p className="text-xs text-destructive">{tableError}</p>}
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor="sqlite-sql-query" className="text-xs text-muted-foreground">
              SQL query
            </Label>
            <textarea
              id="sqlite-sql-query"
              value={sqlQuery}
              onChange={(e) => setSqlQuery(e.target.value)}
              placeholder={`SELECT t.id, t.title, t.body, u.name AS author
FROM posts t
LEFT JOIN users u ON t.user_id = u.id`}
              rows={6}
              spellCheck={false}
              disabled={!sqlitePath}
              aria-label="SQL query"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="text-[10px] text-muted-foreground">
              Must be a <code>SELECT</code> (or <code>WITH&hellip;SELECT</code>) statement.
              Changing the query produces a new source identifier.
            </p>
          </div>

          {/* ID column is required for incremental dedup and chunk IDs.
              In SQL mode it can't fall back to rowid, so we surface it here. */}
          <div className="space-y-1">
            <Label htmlFor="sqlite-id-col-sql" className="text-xs text-muted-foreground">
              ID column <span className="text-destructive">*</span>
            </Label>
            <Input
              id="sqlite-id-col-sql"
              value={idColumn}
              onChange={(e) => setIdColumn(e.target.value)}
              placeholder="id"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Must be one of the columns returned by the query.
              Alias one in your SELECT if you don't have a natural unique key.
            </p>
          </div>
        </>
      )}

      {/* Collection — picker (existing or new) */}
      <div className="space-y-1">
        <Label htmlFor="sqlite-collection" className="text-xs text-muted-foreground">
          Collection
        </Label>
        <CollectionPicker
          inputId="sqlite-collection"
          value={collectionName}
          onChange={setCollectionName}
          existing={existingCollections}
          placeholder={currentCollection ?? "new-collection-name"}
        />
        {collectionExists && !sqliteIngestRunning && !existingCollections.includes(collectionName) && (
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
            {sourceMode === "table" && (
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
            )}
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

          {/* Embedding model — only meaningful when creating a new collection.
              For existing targets the model is locked, shown above the Advanced section. */}
          {!isExistingTarget && (
            <>
              <div className="h-px bg-border/60" />
              <EmbeddingModelField
                inputId="sqlite-embedding-model"
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
                id="sqlite-append-model"
                checked={appendModel}
                onCheckedChange={setAppendModel}
                aria-label="Append embedding model to collection name"
              />
              <Label htmlFor="sqlite-append-model" className="text-xs cursor-pointer">
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
    <IngestEmptyState icon={Database} />
  ) : (
    <>
      {(sqliteIngestRunning || (sqliteIngestRowsTotal > 0 && !sqliteIngestStreamError)) && (
        <IngestProgressBar
          running={sqliteIngestRunning}
          done={sqliteIngestRowsDone}
          total={sqliteIngestRowsTotal}
          modelDownload={modelDownload}
          eta={eta}
          indeterminate
        />
      )}

      {sqliteIngestStreamError && <IngestErrorAlert message={sqliteIngestStreamError} />}

      {wasCancelled && (
        <IngestCancelledAlert
          doneCount={sqliteIngestRowsDone}
          unit="row"
          onDismiss={() => setWasCancelled(false)}
        />
      )}

      {showDoneAlert && result && duration && (
        <IngestDoneAlert
          sourcesIngested={result.sources_ingested}
          sourcesSkipped={result.sources_skipped}
          chunksStored={result.chunks_stored}
          duration={duration}
          skippedReasons={result.skipped_reasons}
          onDismiss={() => setShowDoneAlert(false)}
        />
      )}

      {/* Skipped-only result — distinct from done alert (no ingest succeeded) */}
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

      {(tableProgress.length > 0 || sqliteIngestRunning) && (
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Tables</p>
          <div className="flex flex-col gap-1">
            {tableProgress.map((p, i) => (
              <div key={`${p.table}-${i}`} className="flex items-center gap-2 text-xs p-1">
                <Badge variant={STATUS_VARIANT[p.status]} className="text-xs shrink-0">
                  {p.status}
                </Badge>
                <span className="font-mono truncate flex-1">{p.table}</span>
                <span className="text-muted-foreground shrink-0">{p.chunksStored} chunks</span>
              </div>
            ))}
            {sqliteIngestRunning && currentIngestTable && (
              <div className="flex items-center gap-2 text-xs p-1 text-muted-foreground">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
                <span className="font-mono truncate flex-1">{currentIngestTable}</span>
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
      running={sqliteIngestRunning}
      startDisabled={!canRun}
      onStart={handleRun}
      onStop={() => runAbortRef.current?.abort()}
      incrementalId="sqlite-incremental"
    />
  );

  return <IngestLayout leftColumn={leftColumn} rightColumn={rightColumn} actionBar={actionBar} />;
}
