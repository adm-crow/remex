import { useState, useEffect, useRef, useMemo } from "react";
import type { FormEvent } from "react";
import { Search, Sparkles, Loader2, X, FolderOpen, Inbox, SearchX, ChevronDown, Clock, Layers, Filter, Download, CheckCircle2, SlidersHorizontal } from "lucide-react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import { cn, errMsg, basename } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SoftAlert } from "@/components/ui/soft-alert";
import { useMultiQueryResults, useChat, useMultiChat, useCollections, useCollectionStats, useSources } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";
import { toBibTeX, toRIS, toCSLJson, toObsidianVault } from "@/lib/exports";
import { join } from "@tauri-apps/api/path";
import { ResultCard } from "./ResultCard";
import { ChunkViewerModal } from "./ChunkViewerModal";
import type { QueryResultItem } from "@/api/client";

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

function isAiNetworkError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("networkerror") ||
    lower.includes("failed to connect") ||
    lower.includes("connection refused") ||
    lower.includes("connection timed out") ||
    lower.includes("name or service not known") ||
    lower.includes("getaddrinfo") ||
    lower.includes("502") ||
    lower.includes("proxy") ||
    lower.includes("ssl") ||
    lower.includes("certificate")
  );
}

export function QueryPane({ onFocusReady }: QueryPaneProps) {
  // Narrow selectors: each subscription re-renders the pane only when its
  // specific slice changes, instead of the destructure-everything pattern that
  // wakes the component up on any store mutation.
  const apiUrl                  = useAppStore((s) => s.apiUrl);
  const currentDb               = useAppStore((s) => s.currentDb);
  const currentCollection       = useAppStore((s) => s.currentCollection);
  const aiProvider              = useAppStore((s) => s.aiProvider);
  const aiModel                 = useAppStore((s) => s.aiModel);
  const aiApiKey                = useAppStore((s) => s.aiApiKey);
  const agentPersonas           = useAppStore((s) => s.agentPersonas);
  const activePersonaId         = useAppStore((s) => s.activePersonaId);
  const setActivePersonaId      = useAppStore((s) => s.setActivePersonaId);
  const customProviders         = useAppStore((s) => s.customProviders);
  const activeCustomProviderId  = useAppStore((s) => s.activeCustomProviderId);
  const customApiKeys           = useAppStore((s) => s.customApiKeys);
  const queryHistory            = useAppStore((s) => s.queryHistory);
  const addQueryHistory         = useAppStore((s) => s.addQueryHistory);
  const removeQueryHistory      = useAppStore((s) => s.removeQueryHistory);
  const clearQueryHistory       = useAppStore((s) => s.clearQueryHistory);
  const projectDefaults         = useAppStore((s) => s.projectDefaults);
  const setProjectDefaults      = useAppStore((s) => s.setProjectDefaults);
  const setRequestedView        = useAppStore((s) => s.setRequestedView);
  // Per-project Query settings live on the project-defaults map so that changes
  // made in the gear popover persist across sessions and project switches.
  const currentProjectDefaults = currentDb ? (projectDefaults[currentDb] ?? {}) : {};
  const nResults = currentProjectDefaults.nResults ?? 5;
  const minScore = currentProjectDefaults.minScore ?? 0;
  const setNResults = (v: number) => {
    if (!currentDb) return;
    setProjectDefaults(currentDb, { ...currentProjectDefaults, nResults: v });
  };
  const setMinScore = (v: number) => {
    if (!currentDb) return;
    setProjectDefaults(currentDb, { ...currentProjectDefaults, minScore: v });
  };
  const activePersona = agentPersonas.find((p) => p.id === activePersonaId) ?? null;
  const agentSystemPrompt = activePersona?.systemPrompt ?? "";

  // When the user has picked a custom OpenAI-compatible provider, resolve it
  // and overlay its config + in-memory API key onto the chat request.
  const activeCustomProvider = aiProvider === "custom" && activeCustomProviderId
    ? customProviders.find((p) => p.id === activeCustomProviderId) ?? null
    : null;
  const customOverlay = activeCustomProvider
    ? {
        model:         aiModel || activeCustomProvider.defaultModel || undefined,
        api_key:       customApiKeys[activeCustomProvider.id] || undefined,
        base_url:      activeCustomProvider.baseUrl || undefined,
        header_name:   activeCustomProvider.headerName || undefined,
        header_prefix: activeCustomProvider.headerPrefix,
      }
    : null;

  const [historyFilter, setHistoryFilter] = useState("");
  const visibleHistory = useMemo(() => {
    const q = historyFilter.trim().toLowerCase();
    if (!q) return queryHistory;
    return queryHistory.filter((h) => h.toLowerCase().includes(q));
  }, [queryHistory, historyFilter]);

  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    currentCollection ? [currentCollection] : []
  );
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sourceSearch, setSourceSearch] = useState("");
  const [viewerResult, setViewerResult] = useState<QueryResultItem | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [exportDone, setExportDone] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [aiExportDone, setAiExportDone] = useState(false);

  // Keep selection in sync when the user switches collections from the sidebar.
  // Also reset source filter so stale where-filters aren't applied to new collection.
  useEffect(() => {
    setSelectedCollections(currentCollection ? [currentCollection] : []);
    setSelectedSources([]);
  }, [currentCollection]);

  // Clear query state when the user opens a different project. Max-results and
  // min-score automatically re-derive from projectDefaults on the new currentDb.
  useEffect(() => {
    setText("");
    setSubmitted("");
  }, [currentDb]);

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

  // Source filter is per-collection (sourcesData comes from selectedCollections[0]).
  // Applying it across a multi-collection query would silently zero-out the
  // other collections, so we scope the where-clause to single-collection mode.
  const isSingleCollection = selectedCollections.length === 1;
  const whereFilter = useMemo<Record<string, unknown> | undefined>(() => {
    if (!isSingleCollection) return undefined;
    if (selectedSources.length === 1) return { source: { "$eq": selectedSources[0] } };
    if (selectedSources.length > 1) return { source: { "$in": selectedSources } };
    return undefined;
  }, [isSingleCollection, selectedSources]);

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
      model: customOverlay?.model ?? (aiModel || undefined),
      api_key: customOverlay?.api_key ?? (aiApiKey || undefined),
      system_prompt: agentSystemPrompt || undefined,
      base_url:      customOverlay?.base_url,
      header_name:   customOverlay?.header_name,
      header_prefix: customOverlay?.header_prefix,
    }
  );
  const singleChatResult = useChat(
    apiUrl, currentDb ?? "", activeCollection, submitted,
    { enabled: !!submitted && useAi && !isMultiAi,
      n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined,
      where: whereFilter,
      provider: aiProvider || undefined,
      model: customOverlay?.model ?? (aiModel || undefined),
      api_key: customOverlay?.api_key ?? (aiApiKey || undefined),
      system_prompt: agentSystemPrompt || undefined,
      base_url:      customOverlay?.base_url,
      header_name:   customOverlay?.header_name,
      header_prefix: customOverlay?.header_prefix,
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
        { name: "JSON",                    extensions: ["json"] },
        { name: "CSV",                     extensions: ["csv"]  },
        { name: "Markdown",                extensions: ["md"]   },
        { name: "BibTeX",                  extensions: ["bib"]  },
        { name: "RIS",                     extensions: ["ris"]  },
        { name: "CSL-JSON",                extensions: ["csl"]  },
        { name: "Obsidian Vault (folder)", extensions: [""]     },
      ],
    });
    if (!path) return;

    // Derive extension from the last path segment only, so folder paths
    // like "C:\Users\foo\vault" (no dot in last segment) correctly map to no ext.
    const lastSegment = path.replace(/.*[/\\]/, "");
    const dotIdx = lastSegment.lastIndexOf(".");
    const ext = dotIdx === -1 ? "" : lastSegment.slice(dotIdx + 1).toLowerCase();
    let content: string | null = null;

    if (ext === "bib") {
      content = toBibTeX(results, submitted);
    } else if (ext === "ris") {
      content = toRIS(results, submitted);
    } else if (ext === "csl") {
      content = toCSLJson(results, submitted);
    } else if (ext === "") {
      // Obsidian vault: path is the folder the user chose.
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
        setExportError(errMsg(e));
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
            `## ${i + 1}. ${basename(r.source)} (score: ${r.score.toFixed(3)})\n\n${r.text}\n`
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
      setExportError(errMsg(e));
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
        `### ${i + 1}. ${basename(s.source)} (score: ${s.score.toFixed(3)})\n\n${s.text}`
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
      setExportError(null);
      setTimeout(() => setAiExportDone(false), 3000);
    } catch (e) {
      setExportError(errMsg(e));
    }
  }

  const results = useAi ? (chatResult.data?.sources ?? []) : (multiResult.data ?? []);
  const isLoading = useAi ? chatResult.isLoading : multiResult.isLoading;
  const error = useAi ? chatResult.error : multiResult.error;
  const canRun = !isLoading && selectedCollections.length > 0;

  // Heuristic: a query is "well-answered" when at least one result is in the
  // strongly-relevant band (cosine ≳ 0.55 for normalized embeddings, see README).
  // Below this, we still return the results but caveat them with a soft banner.
  const HIGH_CONFIDENCE_THRESHOLD = 0.70;
  const bestScore = results.length > 0 ? Math.max(...results.map((r) => r.score)) : 0;
  const lowConfidence =
    !!submitted && !isLoading && results.length > 0 && bestScore < HIGH_CONFIDENCE_THRESHOLD;

  const filteredSources = useMemo(() => {
    const q = sourceSearch.trim().toLowerCase();
    if (!q) return sourcesData;
    return sourcesData.filter((s) => s.source.toLowerCase().includes(q));
  }, [sourcesData, sourceSearch]);

  function handleOpenViewer(result: QueryResultItem) {
    const idx = results.indexOf(result);
    setViewerIndex(idx >= 0 ? idx : 0);
    setViewerResult(result);
  }

  return (
    <div className="flex flex-col h-full">

      {/* ── Search area ─────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-4 border-b shrink-0 space-y-3">

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

        {/* Recent queries — own row */}
        {queryHistory.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <Clock className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-label="Recent" />
            {queryHistory.length > 20 && (
              <Input
                value={historyFilter}
                onChange={(e) => setHistoryFilter(e.target.value)}
                placeholder="Filter history…"
                className="h-7 text-xs w-40"
                aria-label="Search query history"
              />
            )}
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
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
            {queryHistory.length > 1 && (
              <button
                type="button"
                onClick={clearQueryHistory}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Collections + right-side controls — own row */}
        {(collections.length > 0 || sourcesData.length > 0) && (
          <div className="flex flex-wrap gap-1.5 items-center">
            {collections.length > 0 && (
              <>
                <Layers className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" aria-label="Collections" />
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
              </>
            )}

            {/* Right-side controls — pushed to end */}
            <div className="ml-auto flex items-center gap-1.5">
              {/* Source filter popover — single-collection only, since the
                  fetched source list comes from selectedCollections[0]. */}
              {sourcesData.length > 0 && isSingleCollection && (
                <Popover open={filterOpen} onOpenChange={setFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                      aria-label="Filter by source"
                    >
                      <Filter className="w-3.5 h-3.5" />
                      Sources
                      {selectedSources.length > 0 && (
                        <span className="rounded-full bg-primary text-primary-foreground text-[10px] leading-none px-1.5 py-0.5 tabular-nums">
                          {selectedSources.length}
                        </span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80 space-y-2">
                    {sourcesData.length > 6 && (
                      <Input
                        value={sourceSearch}
                        onChange={(e) => setSourceSearch(e.target.value)}
                        placeholder="Filter sources…"
                        className="h-8 text-xs"
                        aria-label="Filter sources"
                      />
                    )}
                    <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto">
                      {filteredSources.map((s) => {
                        const label = basename(s.source);
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
                    </div>
                    {selectedSources.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setSelectedSources([])}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Clear selection
                      </button>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {/* Search options popover (results count, min score, persona) */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                    aria-label="Query options"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    {nResults}{minScore > 0 ? ` · ≥${minScore}` : ""}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="opt-n-results" className="text-xs text-muted-foreground">Max results</Label>
                    <Input
                      id="opt-n-results"
                      type="number" min={1} max={50}
                      value={nResults}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setNResults(Number.isFinite(n) ? Math.max(1, Math.min(50, n)) : 5);
                      }}
                      className="h-7 w-16 text-xs text-center px-1"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="opt-min-score" className="text-xs text-muted-foreground">Min score</Label>
                    <Input
                      id="opt-min-score"
                      type="number" min={0} max={1} step={0.05}
                      value={minScore}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMinScore(Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
                      }}
                      className="h-7 w-20 text-xs text-center px-1"
                    />
                  </div>
                  {useAi && agentPersonas.length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Persona</Label>
                      <Select
                        value={activePersonaId ?? ""}
                        onValueChange={(v) => setActivePersonaId(v || null)}
                      >
                        <SelectTrigger className="h-7 text-xs w-full" aria-label="Active persona">
                          <SelectValue placeholder="Persona…" />
                        </SelectTrigger>
                        <SelectContent>
                          {agentPersonas.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.name || "(unnamed)"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              {/* AI toggle — kept visible since it's a primary control */}
              <div className="flex items-center gap-1.5 pl-1">
                <Switch
                  id="ai-toggle"
                  checked={useAi}
                  onCheckedChange={setUseAi}
                  aria-label="AI answer toggle"
                />
                <Label
                  htmlFor="ai-toggle"
                  className="text-xs flex items-center gap-1 cursor-pointer select-none"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  AI
                </Label>
              </div>
            </div>
          </div>
        )}

        {/* AI Agent notice — shown below the strip when toggle is on but not configured */}
        {useAi && !aiProvider && !aiModel && (
          <SoftAlert>
            AI Answer requires a provider and model — configure them in{" "}
            <strong className="font-medium">Settings → AI Agent</strong>.
          </SoftAlert>
        )}
      </div>

      {/* ── Export error ─────────────────────────────────────────────────── */}
      {exportError && (
        <div
          className="mx-4 mt-3 shrink-0 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <span className="flex-1">Export failed: {exportError}</span>
          <button type="button" onClick={() => setExportError(null)} className="shrink-0 opacity-70 hover:opacity-100 mt-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {!!submitted && error && (
        <div className="mx-4 mt-3 shrink-0 space-y-2">
          {useAi && isAiNetworkError(error.message) && (
            <SoftAlert>
              AI provider is unreachable — your network or corporate firewall may be blocking this endpoint.
              Try switching to <strong>Ollama (local)</strong> in <strong>Settings → AI & Server</strong>, or check with your IT team.
            </SoftAlert>
          )}
          <div
            className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            role="alert"
          >
          <span className="flex-1">{error.message}</span>
          <button type="button" onClick={() => setSubmitted("")} className="shrink-0 opacity-70 hover:opacity-100 mt-0.5">
            <X className="w-4 h-4" />
          </button>
          </div>
        </div>
      )}

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 py-4 space-y-4">

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
              <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
                Add documents first, then search across them here.
              </p>
              <Button size="sm" onClick={() => setRequestedView("ingest")}>
                Go to Ingest
              </Button>
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
                    ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Saved</>
                    : <><Download className="w-3.5 h-3.5" /> Export</>}
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

          {/* Low-confidence banner — no result reached HIGH_CONFIDENCE_THRESHOLD */}
          {lowConfidence && (
            <SoftAlert>
              <strong className="font-medium">No clear match</strong> — showing the closest
              results (best score {bestScore.toFixed(2)}). Try rephrasing the query or
              check that the relevant content has been ingested.
            </SoftAlert>
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
                      <ResultCard key={`${r.source}-${r.chunk}-${i}`} result={r} onOpenViewer={handleOpenViewer} />
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
                      ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Exported</>
                      : <><Download className="w-3.5 h-3.5" /> Export</>
                    }
                  </Button>
                </div>
                {/* 2-col on wide screens for scan-and-click; single col on narrow */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 items-start">
                  {results.map((r, i) => (
                    <ResultCard key={`${r.source}-${r.chunk}-${i}`} result={r} onOpenViewer={handleOpenViewer} />
                  ))}
                </div>
              </>
            )
          )}

        </div>
      </div>

      <ChunkViewerModal
        results={results}
        initialIndex={viewerIndex}
        open={!!viewerResult}
        onClose={() => setViewerResult(null)}
      />
    </div>
  );
}
