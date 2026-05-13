import { useState, useRef, useCallback, useEffect } from "react";
import type { ComponentType } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Sidebar, type View } from "./Sidebar";
import { QueryPane } from "@/components/query/QueryPane";
import { IngestPane } from "@/components/ingest/IngestPane";
import { SourcesPane } from "@/components/sources/SourcesPane";
import { SettingsPane } from "@/components/settings/SettingsPane";
import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore, useIsPro } from "@/store/app";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { formatDuration } from "@/lib/formatDuration";
import { DEFAULT_EMBEDDING_MODEL } from "@/lib/constants";
import { OnboardingModal } from "./OnboardingModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";

const PANE_MAP: Record<View, ComponentType> = {
  query:       QueryPane,
  ingest:      IngestPane,
  collections: SourcesPane,
  settings:    SettingsPane,
};

const MIN_SIDEBAR = 160;
const MAX_SIDEBAR = 380;
const DEFAULT_SIDEBAR = 208; // 52 * 4

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("query");
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR);
  const isPro = useIsPro();
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  const sidecarError = useAppStore((s) => s.sidecarError);
  const currentDb = useAppStore((s) => s.currentDb);
  const apiUrl = useAppStore((s) => s.apiUrl);
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const triggerSidecarReconnect = useAppStore((s) => s.triggerSidecarReconnect);
  const currentCollection = useAppStore((s) => s.currentCollection);
  const ingestDoneUnread = useAppStore((s) => s.ingestDoneUnread);
  const setIngestDoneUnread = useAppStore((s) => s.setIngestDoneUnread);
  const setLastIngestResult = useAppStore((s) => s.setLastIngestResult);
  const lastIngestResult = useAppStore((s) => s.lastIngestResult);
  const lastIngestParamsMap = useAppStore((s) => s.lastIngestParamsMap);
  const licensePromptSeq = useAppStore((s) => s.licensePromptSeq);
  const requestedView = useAppStore((s) => s.requestedView);
  const setRequestedView = useAppStore((s) => s.setRequestedView);
  const watchFolders = useAppStore((s) => s.watchFolders);
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

  // Restore file watchers from the persisted list on startup. WatchState lives
  // in Rust memory and is cleared on restart, so we re-register here once the
  // Pro license is confirmed — before the user opens Settings.
  useEffect(() => {
    if (!isPro || watchFolders.length === 0) return;
    for (const folder of watchFolders) {
      void invoke("watch_start", { folder }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPro]); // intentionally omits watchFolders: only needs to run once when Pro is confirmed

  // Global watch:changed listener — kept here (always mounted) so it survives
  // navigation away from the Settings tab where WatchFoldersCard lives.
  useEffect(() => {
    if (!isPro) return;
    const unsub = listen<{ folder: string; paths: string[] }>("watch:changed", async (evt) => {
      const db = useAppStore.getState().currentDb;
      const col = useAppStore.getState().currentCollection;
      if (!db || !col) return;
      const lastParams = useAppStore.getState().lastIngestParamsMap[`${db}::${col}`];
      const embeddingModel = lastParams?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
      const startedAt = new Date().toISOString();
      const url = useAppStore.getState().apiUrl;
      const ingestResp = await fetch(
        `${url}/collections/${encodeURIComponent(col)}/ingest`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            db_path: db,
            source_dir: evt.payload.folder,
            incremental: true,
            embedding_model: embeddingModel,
            ...(lastParams?.chunkSize  !== undefined && { chunk_size:     lastParams.chunkSize }),
            ...(lastParams?.overlap    !== undefined && { overlap:         lastParams.overlap }),
            ...(lastParams?.chunking   !== undefined && { chunking_method: lastParams.chunking }),
          }),
        }
      ).catch((err) => { console.error("[watch] auto-ingest failed:", err); return null; });
      if (!ingestResp || !ingestResp.ok) return;
      const result = await ingestResp.json().catch(() => null);
      if (result) {
        useAppStore.getState().setLastIngestResult({
          collection: col,
          sourcePath: evt.payload.folder,
          startedAt,
          completedAt: new Date().toISOString(),
          sourcesFound:    result.sources_found    ?? 0,
          sourcesIngested: result.sources_ingested ?? 0,
          sourcesSkipped:  result.sources_skipped  ?? 0,
          chunksStored:    result.chunks_stored     ?? 0,
          skippedReasons:  result.skipped_reasons  ?? [],
        });
        useAppStore.getState().setIngestDoneUnread(true);
      }
      await fetch(
        `${url}/collections/${encodeURIComponent(col)}/purge?db_path=${encodeURIComponent(db)}`,
        { method: "POST" }
      ).catch((err) => console.error("[watch] purge failed:", err));
    });
    return () => { void unsub.then((fn) => fn()); };
  }, [isPro]);

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

  const openShortcuts = useCallback(() => setShortcutsOpen(true), [setShortcutsOpen]);
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
            <span className="size-2 rounded-full bg-destructive shrink-0" />
            {sidecarError || "Could not start the Remex sidecar."}
            <button
              onClick={triggerSidecarReconnect}
              className="ml-auto shrink-0 underline underline-offset-2 hover:no-underline"
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
            aria-live="polite"
            aria-atomic="true"
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
                        <li key={i} className="text-xs font-mono text-destructive/80 break-all">{r}</li>
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
