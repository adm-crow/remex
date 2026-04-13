import { useState } from "react";
import type { FormEvent } from "react";
import { Search, Sparkles, Info, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useMultiQueryResults, useChat, useCollections } from "@/hooks/useApi";
import { useAppStore } from "@/store/app";
import { ResultCard } from "./ResultCard";

export function QueryPane() {
  const { apiUrl, currentDb, currentCollection, aiProvider, aiModel, aiApiKey,
          queryHistory, addQueryHistory } =
    useAppStore();

  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [useAi, setUseAi] = useState(false);
  const [nResults, setNResults] = useState(5);
  const [minScore, setMinScore] = useState(0);
  const [selectedCollections, setSelectedCollections] = useState<string[]>(
    currentCollection ? [currentCollection] : []
  );

  const { data: collections = [] } = useCollections(apiUrl, currentDb ?? "");
  // For AI mode (single-collection): use first selected or fall back to currentCollection
  const activeCollection = selectedCollections[0] ?? currentCollection ?? "";

  const multiResult = useMultiQueryResults(
    apiUrl, currentDb ?? "", selectedCollections, submitted,
    { enabled: !!submitted && !useAi, n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined }
  );
  const chatResult = useChat(
    apiUrl, currentDb ?? "", activeCollection, submitted,
    { enabled: !!submitted && useAi, n_results: nResults,
      min_score: minScore > 0 ? minScore : undefined,
      provider: aiProvider || undefined, model: aiModel || undefined,
      api_key: aiApiKey || undefined }
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (text.trim()) {
      setSubmitted(text.trim());
      addQueryHistory(text.trim());
    }
  }

  function handleCollectionToggle(col: string) {
    if (useAi) {
      setSelectedCollections([col]);
    } else {
      setSelectedCollections((prev) => {
        if (prev.includes(col)) {
          if (prev.length === 1) return prev; // never deselect last
          return prev.filter((c) => c !== col);
        }
        return [...prev, col];
      });
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
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question or search your documents…"
              className="pl-9 h-10"
              aria-label="Query input"
            />
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
          <div className="flex flex-wrap gap-1.5">
            {queryHistory.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => { setText(q); setSubmitted(q); addQueryHistory(q); }}
                className="text-xs px-2 py-0.5 rounded-full border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {/* Collection pills */}
        <div className="flex flex-wrap gap-1.5">
          {collections.map((col) => {
            const isSelected = selectedCollections.includes(col);
            return (
              <button
                key={col}
                type="button"
                onClick={() => handleCollectionToggle(col)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                )}
              >
                {col}
              </button>
            );
          })}
        </div>

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
                if (val && selectedCollections.length > 1) {
                  setSelectedCollections([selectedCollections[0]]);
                }
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

        {/* AI Agent notice — shown below the strip when toggle is on but not configured */}
        {useAi && !aiProvider && !aiModel && (
          <div className="flex items-center gap-1.5 text-[11px] text-amber-500 dark:text-amber-400">
            <Info className="w-3.5 h-3.5 shrink-0" />
            AI Answer requires a provider and model — configure them in{" "}
            <strong className="font-medium">Settings → AI Agent</strong>.
          </div>
        )}
      </div>

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
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
                <Badge variant="secondary" className="text-xs ml-auto font-mono">
                  {chatResult.data.provider} · {chatResult.data.model}
                </Badge>
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

          {/* Results header */}
          {!isLoading && submitted && results.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {useAi ? "Sources" : "Results"}
              </span>
              <span className="text-xs text-muted-foreground">
                {results.length}
              </span>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && submitted && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-8 h-8 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No results found.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Try different search terms or a lower min-score.
              </p>
            </div>
          )}

          {/* Result cards */}
          <div className="flex flex-col gap-2">
            {results.map((r) => (
              <ResultCard key={`${r.source}-${r.chunk}`} result={r} />
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
