import { useState, useEffect, useRef, useMemo } from "react";
import type { FormEvent } from "react";
import { Search, Sparkles, Info, Loader2, X, FolderOpen, Inbox, SearchX, ChevronDown, Clock, Layers, Filter, Download, CheckCircle2 } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useMultiQueryResults, useChat, useMultiChat, useCollections, useCollectionStats, useSources } from "@/hooks/useApi";
import { useAppStore, useIsPro } from "@/store/app";
import { toBibTeX, toRIS, toCSLJson, toObsidianVault } from "@/lib/exports";
import { join } from "@tauri-apps/api/path";
import { ResultCard } from "./ResultCard";

function CollectionPill({
  col,
  isSelected,
  apiUrl,
  currentDb,
  onClick,
}: {
  col: string;
  isSelected: boolean;
  apiUrl: string;
  currentDb: string;
  onClick: () => void;
}) {
  const { data: stats } = useCollectionStats(apiUrl, currentDb, col);
  const tooltip = stats
    ? `${stats.total_chunks} chunks · ${stats.embedding_model}`
    : col;
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className={cn(
        "text-xs px-2.5 py-1 rounded-md border transition-colors font-medium",
        isSelected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground"
      )}
    >
      {col}
      {stats && (
        <span className={cn("ml-1.5 opacity-60 font-normal tabular-nums", isSelected && "opacity-80")}>
          {stats.total_chunks}
        </span>
      )}
    </button>
  );
}

interface QueryPaneProps {
  onFocusReady?: (fn: () => void) => void;
}

export function QueryPane({ onFocusReady }: QueryPaneProps) {
  const { apiUrl, currentDb, currentCollection, aiProvider, aiModel, aiApiKey,
          queryHistory, addQueryHistory, removeQueryHistory, clearQueryHistory,
          openUpgradeModal } =
    useAppStore();

  const isPro = useIsPro();
  const [historyFilter, setHistoryFilter] = useState("");
  const visibleHistory = useMemo(() => {
    if (!isPro) return queryHistory.slice(0, 20);
    const q = historyFilter.trim().toLowerCase();
    if (!q) return queryHistory;
    return queryHistory.filter((h) => h.toLowerCase().includes(q));
  }, [isPro, queryHistory, historyFilter]);

  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [nResults, setNResults] = useState(5);
  const [minScore, setMinScore] = useState(0);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    currentCollection ? [currentCollection] : []
  );
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [aiExportDone, setAiExportDone] = useState(false);

  // Keep selection in sync when the user switches collections from the sidebar.
  // Also reset source filter so stale where-filters aren't applied to new collection.
  useEffect(() => {
    setSelectedCollections(currentCollection ? [currentCollection] : []);
    setSelectedSources([]);
  }, [currentCollection]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!onFocusReady) return;
    onFocusReady(() => inputRef.current?.focus());
    // No cleanup needed: AppShell's handleFocusReady is stable (useCallback []),
    // so this effect runs exactly once on mount.
  }, [onFocusReady]);

  const { data: collections = [] } = useCollections(apiUrl, currentDb ?? "");
  // For AI mode (single-collection): use first selected or fall back to currentCollection
  const activeCollection = selectedCollections[0] ?? currentCollection ?? "";

  const { data: sourcesData = [] } = useSources(
    apiUrl, currentDb ?? "", selectedCollections[0] ?? currentCollection ?? ""
  );

  const whereFilter = useMemo<Record<string, unknown> | undefined>(() => {
    if (selectedSources.length === 1) return { source: { "$eq": selectedSources[0] } };
    if (selectedSources.length > 1) return { source: { "$in": selectedSources } };
    return undefined;
  }, [selectedSources]);

  const multiResult = useMultiQueryResults(
    apiUrl, currentDb ?? "", selectedCollections, submitted,
    { enabled: !!submitted && !useAi, n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined,
      where: whereFilter }
  );

  const isMultiAi = useAi && selectedCollections.length > 1;
  const multiChatResult = useMultiChat(
    apiUrl, currentDb ?? "", selectedCollections, submitted,
    { enabled: !!submitted && isMultiAi,
      n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined,
      where: whereFilter,
      provider: aiProvider || undefined,
      model: aiModel || undefined,
      api_key: aiApiKey || undefined,
    }
  );
  const singleChatResult = useChat(
    apiUrl, currentDb ?? "", activeCollection, submitted,
    { enabled: !!submitted && useAi && !isMultiAi,
      n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined,
      where: whereFilter,
      provider: aiProvider || undefined,
      model: aiModel || undefined,
      api_key: aiApiKey || undefined,
    }
  );
  const chatResult = isMultiAi ? multiChatResult : singleChatResult;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) {
      setSubmitted(text.trim());
      addQueryHistory(text.trim());
    }
  }

  function handleCollectionToggle(col: string) {
    setSelectedCollections((prev) => {
      if (prev.includes(col)) {
        if (prev.length === 1) return prev; // never deselect last
        return prev.filter((c) => c !== col);
      }
      return [...prev, col];
    });
  }

  async function handleExport() {
    if (results.length === 0) return;
    const path = await save({
      defaultPath: "remex-results.json",
      filters: [
        { name: "JSON",      extensions: ["json"] },
        { name: "CSV",       extensions: ["csv"]  },
        { name: "Markdown",  extensions: ["md"]   },
        ...(isPro ? [
          { name: "BibTeX",   extensions: ["bib"] },
          { name: "RIS",      extensions: ["ris"] },
          { name: "CSL-JSON", extensions: ["csl"] },
          { name: "Obsidian Vault (folder)", extensions: [""] },
        ] : [
          // Pro formats shown to free users. .csl is unambiguous (no collision
          // with the free .json export), so the gate below can rely on extension alone.
          { name: "BibTeX (Pro)",   extensions: ["bib"] },
          { name: "RIS (Pro)",      extensions: ["ris"] },
          { name: "CSL-JSON (Pro)", extensions: ["csl"] },
          { name: "Obsidian Vault — folder (Pro)", extensions: [""] },
        ]),
      ],
    });
    if (!path) return;

    const ext = path.split(".").pop()?.toLowerCase();
    let content: string | null = null;

    if (ext === "bib") {
      if (!isPro) { openUpgradeModal("export"); return; }
      content = toBibTeX(results, submitted);
    } else if (ext === "ris") {
      if (!isPro) { openUpgradeModal("export"); return; }
      content = toRIS(results, submitted);
    } else if (ext === "csl") {
      if (!isPro) { openUpgradeModal("export"); return; }
      content = toCSLJson(results, submitted);
    } else if (!ext) {
      // Obsidian vault: path is the folder the user chose.
      if (!isPro) { openUpgradeModal("export"); return; }
      const files = toObsidianVault(results, submitted);
      try {
        for (const [rel, fileContent] of Object.entries(files)) {
          const target = await join(path, rel);
          await invoke("write_text_file", { path: target, content: fileContent });
        }
        setExportDone(true);
        setExportError(null);
        setTimeout(() => setExportDone(false), 3000);
      } catch (e) {
        setExportError(e instanceof Error ? e.message : String(e));
      }
      return;
    } else if (ext === "csv") {
      const header = "score,source,chunk,text\n";
      const rows = results.map(
        (r) =>
          `${r.score},"${r.source.replace(/"/g, '""')}",${r.chunk},"${r.text.replace(/"/g, '""').replace(/\n/g, " ")}"`
      );
      content = header + rows.join("\n");
    } else if (ext === "md") {
      content = `# Remex Query Results\n\n**Query:** ${submitted}\n\n`;
      content += results
        .map(
          (r, i) =>
            `## ${i + 1}. ${r.source.split(/[/\\]/).pop() ?? r.source} (score: ${r.score.toFixed(3)})\n\n${r.text}\n`
        )
        .join("\n---\n\n");
    } else {
      content = JSON.stringify(results, null, 2);
    }

    try {
      await invoke("write_text_file", { path, content });
      setExportDone(true);
      setExportError(null);
      setTimeout(() => setExportDone(false), 3000);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleExportAiAnswer() {
    if (!chatResult.data) return;
    const path = await save({
      defaultPath: "remex-answer.md",
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!path) return;
    const { answer, provider, model, sources } = chatResult.data;
    const sourceList = sources
      .map((s, i) =>
        `### ${i + 1}. ${s.source.split(/[/\\]/).pop() ?? s.source} (score: ${s.score.toFixed(3)})\n\n${s.text}`
      )
      .join("\n\n---\n\n");
    const content = [
      `# Remex AI Answer`,
      ``,
      `**Query:** ${submitted}`,
      `**Provider:** ${provider} · ${model}`,
      ``,
      `## Answer`,
      ``,
      answer,
      ``,
      `## Sources`,
      ``,
      sourceList,
    ].join("\n");
    try {
      await invoke("write_text_file", { path, content });
      setAiExportDone(true);
      setTimeout(() => setAiExportDone(false), 3000);
    } catch {
      // silently ignore — rare Tauri write error
    }
  }

  const results = useAi ? (chatResult.data?.sources ?? []) : (multiResult.data ?? []);
  const isLoading = useAi ? chatResult.isLoading : multiResult.isLoading;
  const error = useAi ? chatResult.error : multiResult.error;
  const canRun = !isLoading && selectedCollections.length > 0;

  return (
    <div className="flex flex-col h-full">

      {/* ── Search area ─────────────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 border-b shrink-0 space-y-3">

        {/* Search input — dominant, full width */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setText("");
                  setSubmitted("");
                  inputRef.current?.blur();
                }
              }}
              placeholder="Ask a question or search your documents…"
              className="pl-9 pr-9 h-10"
              aria-label="Query input"
            />
            {text && (
              <button
                type="button"
                onClick={() => { setText(""); setSubmitted(""); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button
            type="submit"
            disabled={!canRun}
            className="h-10 px-5 shrink-0"
          >
            {isLoading ? "Searching…" : "Search"}
          </Button>
        </form>

        {/* Query history chips */}
        {queryHistory.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {isPro && queryHistory.length > 20 && (
              <div className="w-full">
                <Input
                  value={historyFilter}
                  onChange={(e) => setHistoryFilter(e.target.value)}
                  placeholder="Search your query history…"
                  className="h-7 text-xs"
                  aria-label="Search query history"
                />
              </div>
            )}
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mr-0.5 shrink-0">
              <Clock className="w-3 h-3" />
              Recent
            </span>
            {visibleHistory.map((q) => (
              <span
                key={q}
                className="group flex items-center gap-0.5 text-xs pl-2 pr-1 py-0.5 rounded-full border border-border/60 bg-muted/40 hover:bg-muted transition-colors"
              >
                <button
                  type="button"
                  onClick={() => { setText(q); setSubmitted(q); addQueryHistory(q); }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {q}
                </button>
                <button
                  type="button"
                  onClick={() => removeQueryHistory(q)}
                  aria-label={`Remove ${q}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {queryHistory.length > 1 && (
              <button
                type="button"
                onClick={clearQueryHistory}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors ml-0.5"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Separator between history and collections */}
        {queryHistory.length > 0 && collections.length > 0 && (
          <div className="h-px bg-border/60" />
        )}

        {/* Collection pills */}
        {collections.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 mr-0.5 shrink-0">
              <Layers className="w-3 h-3" />
              Collections
            </span>
            {collections.map((col) => (
              <CollectionPill
                key={col}
                col={col}
                isSelected={selectedCollections.includes(col)}
                apiUrl={apiUrl}
                currentDb={currentDb ?? ""}
                onClick={() => handleCollectionToggle(col)}
              />
            ))}
          </div>
        )}

        {/* Options strip — compact, secondary */}
        <div className="flex items-center gap-3">

          {/* Results count */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Results</span>
            <Input
              type="number" min={1} max={50}
              value={nResults}
              onChange={(e) => setNResults(Math.max(1, Number(e.target.value)))}
              className="h-7 w-14 text-xs text-center px-1"
              aria-label="Max results"
            />
          </div>

          {/* Min score */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Min score</span>
            <Input
              id="min-score"
              type="number" min={0} max={1} step={0.05}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="h-7 w-16 text-xs text-center px-1"
            />
          </div>

          <div className="flex-1" />

          {/* AI toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="ai-toggle"
              checked={useAi}
              onCheckedChange={(val) => {
                setUseAi(val);
              }}
              aria-label="AI answer toggle"
            />
            <Label
              htmlFor="ai-toggle"
              className="text-xs flex items-center gap-1.5 cursor-pointer select-none"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              AI Answer
            </Label>
          </div>
        </div>

        {/* Filter by source — collapsible chip strip */}
        {sourcesData.length > 0 && (
          <Collapsible open={filterOpen} onOpenChange={setFilterOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-1.5 text-muted-foreground gap-1.5 text-xs">
                <Filter className="w-3 h-3" />
                Filter by source
                {selectedSources.length > 0 && (
                  <span className="rounded-full bg-primary text-primary-foreground text-[10px] px-1.5">
                    {selectedSources.length}
                  </span>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {sourcesData.map((s) => {
                  const label = s.source.split(/[/\\]/).pop() ?? s.source;
                  const isSelected = selectedSources.includes(s.source);
                  return (
                    <button
                      key={s.source}
                      type="button"
                      title={s.source}
                      onClick={() =>
                        setSelectedSources((prev) =>
                          prev.includes(s.source)
                            ? prev.filter((x) => x !== s.source)
                            : [...prev, s.source]
                        )
                      }
                      className={cn(
                        "text-xs px-2 py-0.5 rounded border transition-colors font-mono truncate max-w-[200px]",
                        isSelected
                          ? "bg-primary/10 border-primary text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
                {selectedSources.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedSources([])}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* AI Agent notice — shown below the strip when toggle is on but not configured */}
        {useAi && !aiProvider && !aiModel && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-500 dark:text-amber-400">
            <Info className="w-3.5 h-3.5 shrink-0" />
            AI Answer requires a provider and model — configure them in{" "}
            <strong className="font-medium">Settings → AI Agent</strong>.
          </div>
        )}
      </div>

      {/* ── Export error ─────────────────────────────────────────────────── */}
      {exportError && (
        <div
          className="mx-6 mt-3 shrink-0 text-destructive text-sm p-3 border border-destructive/30 rounded-md bg-destructive/5 flex items-center justify-between gap-2"
          role="alert"
        >
          <span>Export failed: {exportError}</span>
          <button type="button" onClick={() => setExportError(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!!submitted && error && (
        <div
          className="mx-6 mt-4 shrink-0 text-destructive text-sm p-3 border border-destructive/30 rounded-md bg-destructive/5"
          role="alert"
        >
          {error.message}
        </div>
      )}

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 py-4 space-y-4">

          {/* Empty state: no project open */}
          {!currentDb && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <FolderOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No project open</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Open a project from the sidebar to start searching.
              </p>
            </div>
          )}

          {/* Empty state: pre-query idle (has collections) */}
          {!!currentDb && !submitted && collections.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Ask anything about your documents
              </p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Type a question above and press Search.
              </p>
            </div>
          )}

          {/* Empty state: pre-query idle (no collections) */}
          {!!currentDb && !submitted && collections.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <Inbox className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No collections yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Go to the Ingest tab to add some documents first.
              </p>
            </div>
          )}

          {/* AI answer — loading */}
          {useAi && chatResult.isLoading && (
            <div className="rounded-lg border border-primary/25 bg-primary/8 p-4 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-primary shrink-0 animate-spin" />
              <span className="text-sm text-muted-foreground">Generating answer…</span>
            </div>
          )}

          {/* AI answer — result */}
          {useAi && chatResult.data && (
            <div className="rounded-lg border border-primary/25 bg-primary/8 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm font-semibold">AI Answer</span>
                <Badge variant="secondary" className="text-xs ml-2 font-mono">
                  {chatResult.data.provider} · {chatResult.data.model}
                  {isMultiAi && (
                    <span className="ml-1 opacity-70">({selectedCollections.length} collections)</span>
                  )}
                </Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1.5 ml-auto"
                  onClick={() => void handleExportAiAnswer()}
                  aria-label="Export AI answer"
                >
                  {aiExportDone
                    ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Saved</>
                    : <><Download className="w-3 h-3" /> Export</>}
                </Button>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
                [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>ul]:pl-4 [&>ol]:pl-4
                [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm
                [&>pre]:bg-muted [&>pre]:p-2 [&>pre]:rounded [&>pre]:overflow-x-auto
                [&>code]:bg-muted [&>code]:px-1 [&>code]:rounded [&>code]:text-xs">
                <ReactMarkdown>{chatResult.data.answer}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* Vector search loading skeleton */}
          {!useAi && isLoading && !!submitted && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border bg-card p-4 space-y-2.5 animate-pulse">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-10 rounded bg-muted" />
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="h-4 w-48 rounded bg-muted flex-1" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-4/5 rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state: no results */}
          {!isLoading && !!submitted && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <SearchX className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No results</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try broader terms, a lower min-score, or check that the collection has been ingested.
              </p>
            </div>
          )}

          {/* Results / Sources — AI mode gets a collapsible, vector mode is always open */}
          {!isLoading && submitted && results.length > 0 && (
            useAi ? (
              <Collapsible open={sourcesOpen} onOpenChange={setSourcesOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Sources
                  </span>
                  <span className="text-xs text-muted-foreground">{results.length}</span>
                  <ChevronDown className={cn(
                    "w-3.5 h-3.5 text-muted-foreground ml-auto transition-transform duration-150",
                    sourcesOpen && "rotate-180"
                  )} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="flex flex-col gap-2 mt-2">
                    {results.map((r, i) => (
                      <ResultCard key={`${r.source}-${r.chunk}-${i}`} result={r} />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Results
                  </span>
                  <span className="text-xs text-muted-foreground">{results.length}</span>
                  <div className="flex-1" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1.5"
                    onClick={() => void handleExport()}
                    aria-label="Export results"
                  >
                    {exportDone
                      ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Exported</>
                      : <><Download className="w-3 h-3" /> Export</>
                    }
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {results.map((r, i) => (
                    <ResultCard key={`${r.source}-${r.chunk}-${i}`} result={r} />
                  ))}
                </div>
              </>
            )
          )}

        </div>
      </div>
    </div>
  );
}
