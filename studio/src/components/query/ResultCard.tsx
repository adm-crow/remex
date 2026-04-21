import { useState } from "react";
import { FolderOpen, Copy, Check } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import type { QueryResultItem } from "@/api/client";

interface Props {
  result: QueryResultItem;
}

export function ResultCard({ result }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div
      className={cn(
        "group rounded-lg border bg-card p-4 space-y-2.5 transition-all duration-150",
        "hover:border-primary/30 hover:shadow-sm hover:shadow-primary/5"
      )}
    >
      {/* Card meta row */}
      <div className="flex items-center gap-2 flex-wrap min-w-0">
        <span className="font-mono text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded bg-primary/12 text-primary shrink-0">
          {result.score.toFixed(3)}
        </span>
        {result.doc_title && (
          <span className="text-xs font-semibold truncate">
            {result.doc_title}
          </span>
        )}
        <span className="text-xs text-muted-foreground font-mono truncate flex-1 min-w-0">
          {result.source}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">
          #{result.chunk}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy text"
          className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
        >
          {copied
            ? <Check className="w-3.5 h-3.5 text-emerald-500" />
            : <Copy className="w-3.5 h-3.5" />}
        </button>
        {result.source_type !== "sqlite" && (
          <button
            type="button"
            onClick={() => {
              open(result.source).catch((err) => {
                console.error("[ResultCard] Failed to open file:", err);
              });
            }}
            aria-label="Open source file"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      {/* Excerpt */}
      <p className="text-sm leading-relaxed text-foreground">
        {expanded ? result.text : result.text.slice(0, 300)}
        {!expanded && result.text.length > 300 && (
          <span className="text-muted-foreground">…</span>
        )}
      </p>
      {result.text.length > 300 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors self-end"
        >
          {expanded ? "‹ Show less" : "Show more ›"}
        </button>
      )}
    </div>
  );
}
