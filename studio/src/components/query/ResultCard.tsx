import { FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { cn } from "@/lib/utils";
import type { QueryResultItem } from "@/api/client";

interface Props {
  result: QueryResultItem;
}

export function ResultCard({ result }: Props) {
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
          onClick={() => {
            open(result.source).catch((err) => {
              console.error("[ResultCard] Failed to open file:", err);
            });
          }}
          aria-label="Open source file"
          className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0 text-muted-foreground hover:text-foreground"
        >
          <FolderOpen className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Excerpt */}
      <p className="text-sm leading-relaxed text-foreground">
        {result.text.slice(0, 300)}
        {result.text.length > 300 && (
          <span className="text-muted-foreground">…</span>
        )}
      </p>
    </div>
  );
}
