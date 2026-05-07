import { useState, useRef, useCallback, useEffect } from "react";
import type { ComponentType } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Sidebar, type View } from "./Sidebar";
import { QueryPane } from "@/components/query/QueryPane";
import { IngestPane } from "@/components/ingest/IngestPane";
import { SourcesPane } from "@/components/sources/SourcesPane";
import { SettingsPane } from "@/components/settings/SettingsPane";
import { LogsPane } from "@/components/log-viewer/LogsPane";
import { useAppStore } from "@/store/app";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { formatDuration } from "@/lib/formatDuration";
import { OnboardingModal } from "./OnboardingModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";

const PANE_MAP: Record<View, ComponentType> = {
  query:       QueryPane,
  ingest:      IngestPane,
  collections: SourcesPane,
  settings:    SettingsPane,
  logs:        LogsPane,
};

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 380;
const DEFAULT_SIDEBAR = 208; // 52 * 4

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("query");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  const sidecarError = useAppStore((s) => s.sidecarError);
  const currentDb = useAppStore((s) => s.currentDb);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const triggerSidecarReconnect = useAppStore((s) => s.triggerSidecarReconnect);
  const ingestDoneUnread = useAppStore((s) => s.ingestDoneUnread);
  const setIngestDoneUnread = useAppStore((s) => s.setIngestDoneUnread);
  const lastIngestResult = useAppStore((s) => s.lastIngestResult);
  const licensePromptSeq = useAppStore((s) => s.licensePromptSeq);
  const requestedView = useAppStore((s) => s.requestedView);
  const setRequestedView = useAppStore((s) => s.setRequestedView);
  const isDragging = useRef(false);

  // Pre-warm the embedding model as soon as the sidecar is healthy and a
  // project is selected. The warmup endpoint returns 202 immediately and
  // loads the model in the background, so the first ingest doesn't block
  // on a cold model download.
  useEffect(() => {
    if (sidecarStatus !== "connected" || !currentDb) return;
    fetch(`${apiUrl}/collections/warmup?db_path=${encodeURIComponent(currentDb)}`, { method: "POST" })
      .catch(() => {}); // non-critical — ingest works even without warmup
  }, [sidecarStatus, currentDb, apiUrl]);

  useEffect(() => {
    if (licensePromptSeq === 0) return;
    setActiveView("settings");
  }, [licensePromptSeq]);

  useEffect(() => {
    if (!requestedView) return;
    setActiveView(requestedView as View);
    setRequestedView(null);
  }, [requestedView, setRequestedView]);
  const focusSearchRef = useRef<(() => void) | null>(null);

  const handleFocusReady = useCallback((fn: () => void) => {
    focusSearchRef.current = fn;
  }, []);

  const focusSearch = useCallback(
    () => focusSearchRef.current?.(),
    [] // focusSearchRef is a stable ref; no deps needed
  );

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);
  useKeyboardShortcuts({ onViewChange: setActiveView, focusSearch, onShowShortcuts: openShortcuts });

  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      setSidebarWidth(Math.max(MIN_SIDEBAR, Math.min(MAX_SIDEBAR, ev.clientX)));
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  const ActivePane = PANE_MAP[activeView];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        style={{ width: sidebarWidth }}
      />

      {/* Drag handle */}
      <div
        className="w-1 shrink-0 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors"
        onMouseDown={onDragStart}
        aria-hidden
      />

      <main className="flex-1 overflow-hidden flex flex-col min-w-0 relative">
        {sidecarStatus === "error" && (
          <div
            className="shrink-0 bg-destructive/8 border-b border-destructive/20 px-4 py-2.5 text-sm text-destructive flex items-center gap-2"
            role="alert"
          >
            <span className="size-1.5 rounded-full bg-destructive shrink-0" />
            {sidecarError || "Could not start the Remex sidecar."}
            <button
              onClick={() => setActiveView("logs")}
              className="ml-auto shrink-0 underline underline-offset-2 hover:no-underline"
            >
              View logs
            </button>
            <button
              onClick={triggerSidecarReconnect}
              className="shrink-0 underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}
        <div key={activeView} className="flex-1 min-h-0 flex flex-col animate-pane-in">
          {activeView === "query" ? (
            <QueryPane onFocusReady={handleFocusReady} />
          ) : (
            <ActivePane />
          )}
        </div>

        {/* Floating ingest-done toast — overlays content, doesn't shift layout */}
        {ingestDoneUnread && lastIngestResult && (
          <div
            className="absolute top-3 right-4 z-50 w-80 flex items-start justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm shadow-md px-4 py-3"
            role="alert"
          >
            <div className="flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">
                  Ingest complete — {lastIngestResult.collection}
                </p>
                <p className="text-xs opacity-80 mt-0.5">
                  {lastIngestResult.sourcesIngested} ingested · {lastIngestResult.sourcesSkipped} skipped ·{" "}
                  {lastIngestResult.chunksStored} chunks ·{" "}
                  {formatDuration(
                    new Date(lastIngestResult.completedAt).getTime() -
                    new Date(lastIngestResult.startedAt).getTime()
                  )}
                </p>
                {lastIngestResult.skippedReasons.length > 0 && (
                  <details className="mt-1">
                    <summary className="text-xs text-destructive/80 cursor-pointer select-none">
                      {lastIngestResult.skippedReasons.length} skip reason{lastIngestResult.skippedReasons.length !== 1 ? "s" : ""}
                    </summary>
                    <ul className="mt-1 space-y-0.5 max-h-28 overflow-y-auto pr-1">
                      {lastIngestResult.skippedReasons.map((r, i) => (
                        <li key={i} className="text-[10px] font-mono text-destructive/80 break-all">{r}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIngestDoneUnread(false)}
              className="shrink-0 text-emerald-700 dark:text-emerald-400 hover:opacity-70 transition-opacity mt-0.5"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </main>
      <OnboardingModal />
      <KeyboardShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
