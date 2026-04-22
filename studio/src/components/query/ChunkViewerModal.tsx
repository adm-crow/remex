import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { QueryResultItem } from "@/api/client";

interface ChunkViewerModalProps {
  results: QueryResultItem[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function ChunkViewerModal({ results, initialIndex, open, onClose }: ChunkViewerModalProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  if (results.length === 0) return null;
  const result = results[Math.min(index, results.length - 1)];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm font-medium flex items-center gap-2 pr-8">
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-primary/12 text-primary shrink-0">
              {result.score.toFixed(3)}
            </span>
            <span className="truncate text-muted-foreground font-mono text-xs">
              {result.source}
            </span>
            <span className="shrink-0 text-muted-foreground text-xs">#{result.chunk}</span>
          </DialogTitle>
        </DialogHeader>

        {result.doc_title && (
          <p className="shrink-0 text-xs font-semibold text-muted-foreground px-0.5">
            {result.doc_title}
            {result.doc_author && ` · ${result.doc_author}`}
          </p>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto rounded border bg-muted/30 p-4">
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{result.text}</p>
        </div>

        <div className="shrink-0 flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {index + 1} / {results.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={index === 0}
              onClick={() => setIndex((i) => i - 1)}
              aria-label="Previous chunk"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={index >= results.length - 1}
              onClick={() => setIndex((i) => i + 1)}
              aria-label="Next chunk"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-7 px-3 text-xs" onClick={onClose}>
              <X className="w-3.5 h-3.5 mr-1" />
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
