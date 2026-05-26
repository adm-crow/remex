import { useState, useRef, useCallback, useEffect } from "react";
import type { ComponentType } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Sidebar, type View } from "./Sidebar";
import { QueryPane } from "@/components/query/QueryPane";
import { IngestPane } from "@/components/ingest/IngestPane";
import { SourcesPane } from "@/components/sources/SourcesPane";
import { SettingsPane } from "@/components/settings/SettingsPane";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/app";
import { api } from "@/api/client";
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
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  const sidecarError = useAppStore((s) => s.sidecarError);
  const extrasInstalling   = useAppStore((s) => s.extrasInstalling);
  const extrasInstallLog   = useAppStore((s) => s.extrasInstallLog);
  const extrasInstallError = useAppStore((s) => s.extrasInstallError);
  const setExtrasInstallError = useAppStore((s) => s.setExtrasInstallError);
  const shortcutsOpen = useAppStore((s) => s.shortcutsOpen);
  const setShortcutsOpen = useAppStore((s) => s.setShortcutsOpen);
  const triggerSidecarReconnect = useAppStore((s) => s.triggerSidecarReconnect);
  const ingestDoneUnread = useAppStore((s) => s.ingestDoneUnread);
  const setIngestDoneUnread = useAppStore((s) => s.setIngestDoneUnread);
  const lastIngestResult = useAppStore((s) => s.lastIngestResult);
  const requestedView = useAppStore((s) => s.requestedView);
  const setRequestedView = useAppStore((s) => s.setRequestedView);
  const isDragging = useRef(false);

  // Note: model warmup is fired from App.tsx — don't duplicate it here.

  // Hydrate API keys from the OS keyring on mount. Fire-and-forget — the
  // setters in the store fail soft when the keyring is unavailable, so the
  // worst case is the user re-enters the key once.
  useEffect(() => {
    void useAppStore.getState().hydrateApiKeys();
  }, []);

  // Restore file + database watchers from the persisted lists on startup. WatchState
  // lives in Rust memory and is cleared on restart, so we re-register here once the
  // shell mounts (a project is open).
  useEffect(() => {
    const { watchFolders, watchDatabases } = useAppStore.getState();
    for (const w of watchFolders) {
      void invoke("watch_start", { folder: w.path }).catch(() => {});
    }
    for (const w of watchDatabases) {
      void invoke("watch_db_start", { dbPath: w.dbPath }).catch(() => {});
    }
  }, []);

  // Global watch:changed listener — kept here (always mounted) so it survives
  // navigation away from the Settings tab where WatchFoldersCard lives.
  useEffect(() => {
    const unsub = listen<{ folder: string; paths: string[] }>("watch:changed", async (evt) => {
      const state = useAppStore.getState();
      const db = state.currentDb;
      if (!db) return;
      const watch = state.watchFolders.find((w) => w.path === evt.payload.folder);
      if (!watch || !watch.collection) {
        console.warn("[watch] fired for folder without a target collection — skipping", evt.payload.folder);
        return;
      }
      const col = watch.collection;
      const url = state.apiUrl;
      const lastParams = state.lastIngestParamsMap[`${db}::${col}`];
      const embeddingModel = lastParams?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
      const startedAt = new Date().toISOString();
      try {
        const result = await api.ingestFiles(url, db, col, {
          source_dir: evt.payload.folder,
          incremental: true,
          embedding_model: embeddingModel,
          ...(lastParams?.chunkSize !== undefined && { chunk_size: lastParams.chunkSize }),
          ...(lastParams?.overlap   !== undefined && { overlap:    lastParams.overlap }),
          ...(lastParams?.chunking  !== undefined && { chunking:   lastParams.chunking }),
        });
        useAppStore.getState().setLastIngestResult({
          collection: col,
          sourcePath: evt.payload.folder,
          startedAt,
          completedAt: new Date().toISOString(),
          sourcesFound:    result.sources_found,
          sourcesIngested: result.sources_ingested,
          sourcesSkipped:  result.sources_skipped,
          chunksStored:    result.chunks_stored,
          skippedReasons:  result.skipped_reasons,
        });
        useAppStore.getState().setIngestDoneUnread(true);
      } catch (err) {
        console.error("[watch] auto-ingest failed:", err);
        return;
      }
      try {
        await api.purgeCollection(url, db, col);
      } catch (err) {
        console.error("[watch] purge failed:", err);
      }
    });
    return () => { void unsub.then((fn) => fn()); };
  }, []);

  // watch:db:changed — fires when a watched SQLite file (or its WAL/SHM siblings)
  // is written. Look up the watch's stored config and re-run ingest_sqlite with
  // `incremental: true` so existing rows are deduped by hash.
  useEffect(() => {
    const unsub = listen<{ db_path: string }>("watch:db:changed", async (evt) => {
      const state = useAppStore.getState();
      const proj = state.currentDb;
      if (!proj) return;
      const watch = state.watchDatabases.find((w) => w.dbPath === evt.payload.db_path);
      if (!watch) return;
      const url = state.apiUrl;
      const col = watch.collection;
      const lastParams = state.lastIngestParamsMap[`${proj}::${col}`];
      const embeddingModel = lastParams?.embeddingModel ?? DEFAULT_EMBEDDING_MODEL;
      const startedAt = new Date().toISOString();
      try {
        const r = await api.ingestSqlite(url, proj, col, {
          sqlite_path: watch.dbPath,
          // Exactly one of `table` / `sql_query` is sent — the watch entry's
          // wizard enforced the mode, so trust the stored shape here.
          ...(watch.sqlQuery
            ? { sql_query: watch.sqlQuery }
            : { table: watch.table ?? "" }),
          incremental: true,
          embedding_model: embeddingModel,
          ...(watch.columns     !== undefined && { columns:      watch.columns }),
          ...(watch.idColumn    !== undefined && { id_column:    watch.idColumn }),
          ...(watch.rowTemplate !== undefined && { row_template: watch.rowTemplate }),
          ...(lastParams?.chunkSize !== undefined && { chunk_size: lastParams.chunkSize }),
          ...(lastParams?.overlap   !== undefined && { overlap:    lastParams.overlap }),
          ...(lastParams?.chunking  !== undefined && { chunking:   lastParams.chunking }),
        });
        useAppStore.getState().setLastIngestResult({
          collection: col,
          sourcePath: watch.dbPath,
          startedAt,
          completedAt: new Date().toISOString(),
          sourcesFound:    r.sources_found,
          sourcesIngested: r.sources_ingested,
          sourcesSkipped:  r.sources_skipped,
          chunksStored:    r.chunks_stored,
          skippedReasons:  r.skipped_reasons,
        });
        useAppStore.getState().setIngestDoneUnread(true);
        // Same as the file-watch branch above: purge stale chunks for rows
        // that no longer exist in the table so the collection stays consistent
        // with the source DB.
        try {
          await api.purgeCollection(url, proj, col);
        } catch (err) {
          console.error("[watch:db] purge failed:", err);
        }
      } catch (err) {
        console.error("[watch:db] auto-ingest failed:", err);
      }
    });
    return () => { void unsub.then((fn) => fn()); };
  }, []);

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

  const dragListenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null);

  // Cleanup any drag listeners on unmount so an unmount mid-drag never leaks them.
  useEffect(() => {
    return () => {
      if (dragListenersRef.current) {
        document.removeEventListener("mousemove", dragListenersRef.current.move);
        document.removeEventListener("mouseup",   dragListenersRef.current.up);
        dragListenersRef.current = null;
      }
    };
  }, []);

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
      dragListenersRef.current = null;
    };

    dragListenersRef.current = { move: onMouseMove, up: onMouseUp };
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

        {/* Background optional-extras install (Phase 2) — Studio is fully
            usable while this runs; the banner just lets the user see progress
            and surfaces errors (which fall back gracefully — missing extras
            raise ImportError on the affected feature, not a crash). */}
        {extrasInstalling && (
          <div
            className="shrink-0 bg-primary/8 border-b border-primary/20 px-4 py-2 text-xs text-muted-foreground flex items-center gap-3"
            role="status"
            aria-live="polite"
          >
            <span className="size-2 rounded-full bg-primary shrink-0 animate-pulse-dot" />
            <span className="font-medium text-foreground shrink-0">Installing optional packages…</span>
            {extrasInstallLog.length > 0 && (
              <span className="font-mono truncate min-w-0 opacity-70" title={extrasInstallLog[extrasInstallLog.length - 1]}>
                {extrasInstallLog[extrasInstallLog.length - 1]}
              </span>
            )}
          </div>
        )}
        {extrasInstallError && !extrasInstalling && (
          <div
            className="shrink-0 bg-amber-500/10 border-b border-amber-500/25 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-400 flex items-center gap-2"
            role="alert"
          >
            <span className="size-2 rounded-full bg-amber-500 shrink-0" />
            <span className="shrink-0 font-medium">Optional packages didn't install:</span>
            <span className="truncate min-w-0">{extrasInstallError}</span>
            <button
              onClick={() => {
                setExtrasInstallError(null);
                triggerSidecarReconnect();
              }}
              className="ml-auto shrink-0 underline underline-offset-2 hover:no-underline"
            >
              Retry
            </button>
            <button
              onClick={() => setExtrasInstallError(null)}
              className="shrink-0 underline underline-offset-2 hover:no-underline opacity-80"
            >
              Dismiss
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
