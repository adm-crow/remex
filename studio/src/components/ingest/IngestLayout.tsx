/**
 * Shared scaffolding + result-region primitives for the Ingest tabs.
 *
 * Both `FilesTab` and `SQLiteTab` share the same outer shell:
 *   ┌──────────────┬──────────────┐
 *   │ left column  │ right column │
 *   │ (configure)  │ (monitor)    │
 *   ├──────────────┴──────────────┤
 *   │       action bar            │
 *   └─────────────────────────────┘
 * and the same set of right-column primitives (progress bar, alerts).
 *
 * Each tab owns its own state slice and composes the pieces.
 */

import type { ReactNode } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Play, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { formatBytes } from "./ingestShared";

// ─────────────────────────────────────────────────────────────────────────────
// Outer shell
// ─────────────────────────────────────────────────────────────────────────────

interface IngestLayoutProps {
  leftColumn: ReactNode;
  rightColumn: ReactNode;
  actionBar: ReactNode;
}

export function IngestLayout({ leftColumn, rightColumn, actionBar }: IngestLayoutProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden">
        <div className="overflow-y-auto p-4 space-y-3 lg:border-r">{leftColumn}</div>
        <div className="overflow-y-auto p-4 space-y-3 bg-muted/10">{rightColumn}</div>
      </div>
      <div className="shrink-0 border-t bg-background/95 backdrop-blur-sm px-4 py-3">
        {actionBar}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Right-column primitives
// ─────────────────────────────────────────────────────────────────────────────

interface IngestEmptyStateProps {
  icon: LucideIcon;
}

export function IngestEmptyState({ icon: Icon }: IngestEmptyStateProps) {
  return (
    <div className="h-full flex items-center justify-center text-center text-muted-foreground">
      <div className="space-y-2 max-w-xs px-6">
        <Icon className="w-8 h-8 mx-auto opacity-40" />
        <p className="text-sm">
          Configure on the left, then click{" "}
          <span className="font-medium text-foreground">Start ingest</span> below.
        </p>
        <p className="text-xs opacity-70">Progress and results will appear here.</p>
      </div>
    </div>
  );
}

interface IngestProgressBarProps {
  running:       boolean;
  done:          number;
  total:         number;
  modelDownload: { downloaded: number; total: number } | null;
  eta:           string | null;
  /** Use an animated bar instead of a 3% stub when we know nothing about progress yet. */
  indeterminate?: boolean;
}

export function IngestProgressBar({
  running, done, total, modelDownload, eta, indeterminate = false,
}: IngestProgressBarProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{running ? (total === 0 ? "Loading model…" : "Ingesting…") : "Done"}</span>
        <span className="tabular-nums">
          {total === 0
            ? modelDownload && modelDownload.total > 0
              ? `${formatBytes(modelDownload.downloaded)} / ${formatBytes(modelDownload.total)}`
              : "—"
            : `${done} / ${total}`}
        </span>
      </div>
      <div
        className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total || 1}
        aria-valuenow={done}
        aria-label="Ingest progress"
      >
        {total > 0 ? (
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.round((done / total) * 100)}%` }}
          />
        ) : modelDownload && modelDownload.total > 0 ? (
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${Math.min(99, Math.round((modelDownload.downloaded / modelDownload.total) * 100))}%` }}
          />
        ) : indeterminate ? (
          <div className="h-full rounded-full bg-primary animate-indeterminate" />
        ) : (
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: running ? "3%" : "0%" }}
          />
        )}
      </div>
      {running && eta && (
        <p className="text-xs text-muted-foreground text-right tabular-nums">
          ~{eta} remaining
        </p>
      )}
    </div>
  );
}

interface IngestErrorAlertProps {
  message: string;
}

export function IngestErrorAlert({ message }: IngestErrorAlertProps) {
  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
      role="alert"
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

interface IngestCancelledAlertProps {
  doneCount: number;
  /** Singular unit name — "file" or "row". The component pluralises. */
  unit:      string;
  onDismiss: () => void;
}

export function IngestCancelledAlert({ doneCount, unit, onDismiss }: IngestCancelledAlertProps) {
  return (
    <div
      className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
      role="alert"
    >
      <div className="flex items-start gap-2.5 text-amber-700 dark:text-amber-400 min-w-0">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">Incomplete</p>
          <p className="text-xs opacity-80">
            Ingestion was stopped early — {doneCount} {unit}{doneCount !== 1 ? "s" : ""} ingested.
            The collection is partially populated.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-amber-700 dark:text-amber-400 hover:opacity-70 transition-opacity mt-0.5"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

interface IngestDoneAlertProps {
  sourcesIngested: number;
  sourcesSkipped:  number;
  chunksStored:    number;
  duration:        string;
  /** Optional ISO timestamp — when present, shown as a monospaced subtitle. */
  completedAt?:    string;
  /** Optional list of skip reasons — when present, rendered inside a <details>. */
  skippedReasons?: string[];
  onDismiss: () => void;
}

export function IngestDoneAlert({
  sourcesIngested, sourcesSkipped, chunksStored,
  duration, completedAt, skippedReasons, onDismiss,
}: IngestDoneAlertProps) {
  return (
    <div
      className="flex items-start justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3"
      role="alert"
    >
      <div className="flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400 min-w-0">
        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-0.5 min-w-0">
          <p className="text-sm font-medium">Ingest complete</p>
          <p className="text-xs opacity-80">
            {sourcesIngested} ingested · {sourcesSkipped} skipped · {chunksStored} chunks stored
          </p>
          <p className="text-xs opacity-80">
            Duration: <span className="font-medium">{duration}</span>
          </p>
          {completedAt && (
            <p className="text-xs opacity-60 font-mono">
              {new Date(completedAt).toLocaleString()}
            </p>
          )}
          {skippedReasons && skippedReasons.length > 0 && (
            <details className="mt-1">
              <summary className="text-xs text-destructive/80 cursor-pointer select-none">
                {skippedReasons.length} skip reason{skippedReasons.length !== 1 ? "s" : ""}
              </summary>
              <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                {skippedReasons.map((r, i) => (
                  <li key={i} className="text-xs font-mono text-destructive/80 break-all">{r}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-emerald-700 dark:text-emerald-400 hover:opacity-70 transition-opacity mt-0.5"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action bar
// ─────────────────────────────────────────────────────────────────────────────

interface IngestActionBarProps {
  incremental:         boolean;
  onIncrementalChange: (v: boolean) => void;
  running:             boolean;
  startDisabled:       boolean;
  onStart:             () => void;
  onStop:              () => void;
  /** Unique DOM id for the Incremental Switch — distinguishes the Files vs SQLite tab. */
  incrementalId?:      string;
}

export function IngestActionBar({
  incremental, onIncrementalChange, running, startDisabled,
  onStart, onStop, incrementalId = "incremental",
}: IngestActionBarProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        id={incrementalId}
        checked={incremental}
        onCheckedChange={onIncrementalChange}
        aria-label="Incremental ingest"
      />
      <Label htmlFor={incrementalId} className="text-xs text-muted-foreground whitespace-nowrap">
        Incremental
      </Label>
      <Button
        onClick={onStart}
        disabled={startDisabled}
        aria-label="Start ingest"
        className="flex-1"
      >
        <Play className="w-4 h-4 mr-2" />
        {running ? "Ingesting…" : "Start ingest"}
      </Button>
      {running && (
        <Button
          type="button"
          variant="destructive"
          onClick={onStop}
          aria-label="Stop"
          className="shrink-0"
        >
          Stop
        </Button>
      )}
    </div>
  );
}
