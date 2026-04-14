import { useState, useRef, useCallback } from "react";
import type { ComponentType } from "react";
import { Sidebar, type View } from "./Sidebar";
import { QueryPane } from "@/components/query/QueryPane";
import { IngestPane } from "@/components/ingest/IngestPane";
import { SourcesPane } from "@/components/sources/SourcesPane";
import { SettingsPane } from "@/components/settings/SettingsPane";
import { useAppStore } from "@/store/app";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

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
  const triggerSidecarReconnect = useAppStore((s) => s.triggerSidecarReconnect);
  const isDragging = useRef(false);
  const focusSearchRef = useRef<(() => void) | null>(null);

  const handleFocusReady = useCallback((fn: () => void) => {
    focusSearchRef.current = fn;
  }, []);

  const focusSearch = useCallback(
    () => focusSearchRef.current?.(),
    [] // focusSearchRef is a stable ref; no deps needed
  );

  useKeyboardShortcuts({ onViewChange: setActiveView, focusSearch });

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

      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
        {sidecarStatus === "error" && (
          <div
            className="shrink-0 bg-destructive/8 border-b border-destructive/20 px-4 py-2.5 text-sm text-destructive flex items-center gap-2"
            role="alert"
          >
            <span className="size-1.5 rounded-full bg-destructive shrink-0" />
            Could not start remex serve — is remex installed?{" "}
            <code className="font-mono text-xs opacity-80">pip install remex[api]</code>
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
      </main>
    </div>
  );
}
