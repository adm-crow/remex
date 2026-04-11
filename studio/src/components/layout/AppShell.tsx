import { useState } from "react";
import type { ComponentType } from "react";
import { Sidebar, type View } from "./Sidebar";
import { QueryPane } from "@/components/query/QueryPane";
import { IngestPane } from "@/components/ingest/IngestPane";
import { SourcesPane } from "@/components/sources/SourcesPane";
import { SettingsPane } from "@/components/settings/SettingsPane";
import { useSidecar } from "@/hooks/useSidecar";
import { useAppStore } from "@/store/app";

const PANE_MAP: Record<View, ComponentType> = {
  query: QueryPane,
  ingest: IngestPane,
  sources: SourcesPane,
  settings: SettingsPane,
};

export function AppShell() {
  const [activeView, setActiveView] = useState<View>("query");
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  useSidecar();

  const ActivePane = PANE_MAP[activeView];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activeView={activeView} onViewChange={setActiveView} />
      <main className="flex-1 overflow-auto flex flex-col">
        {sidecarStatus === "error" && (
          <div
            className="bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-sm text-destructive"
            role="alert"
          >
            Could not start remex serve. Is remex installed? (pip install
            remex[api])
          </div>
        )}
        <div className="flex-1"><ActivePane /></div>
      </main>
    </div>
  );
}
