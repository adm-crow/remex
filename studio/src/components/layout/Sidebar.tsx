import { Search, Upload, Database, Settings, RotateCcw, House, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { useAppStore, useIsPro } from "@/store/app";
import { ProBadge } from "@/components/license/ProBadge";

export type View = "query" | "ingest" | "collections" | "settings" | "logs";

interface SidebarProps {
  activeView: View;
  onViewChange: (v: View) => void;
  style?: React.CSSProperties;
}

const NAV_ITEMS: { view: View; label: string; icon: LucideIcon }[] = [
  { view: "query",       label: "Query",       icon: Search   },
  { view: "ingest",      label: "Ingest",      icon: Upload   },
  { view: "collections", label: "Collections", icon: Database },
  { view: "settings",    label: "Settings",    icon: Settings },
];

export function Sidebar({ activeView, onViewChange, style }: SidebarProps) {
  const { currentDb, sidecarStatus, setIngestDoneUnread, triggerSidecarReconnect, setCurrentDb } = useAppStore();
  const isPro = useIsPro();

  return (
    <aside
      className="shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border h-full overflow-hidden"
      style={style}
    >
      {/* ── Brand ───────────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 shrink-0">
        <p className="font-semibold text-[13px] leading-tight tracking-tight text-sidebar-foreground flex items-center">
          Remex Studio
          {isPro && <ProBadge size="md" className="ml-2" />}
        </p>
        {currentDb && (
          <p
            className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5 font-mono"
            title={currentDb}
            aria-label="Current database"
          >
            {currentDb}
          </p>
        )}
      </div>

      {/* ── Collection switcher ─────────────────────────────────────────── */}
      <div className="px-3 pb-3 shrink-0">
        <CollectionSwitcher />
      </div>

      {/* ── Separator ───────────────────────────────────────────────────── */}
      <div className="h-px bg-sidebar-border mx-0 shrink-0" />

      {/* ── Navigation ──────────────────────────────────────────────────── */}
      <nav className="flex flex-col p-2 gap-0.5 flex-1 mt-1">
        {NAV_ITEMS.map(({ view, label, icon: Icon }) => (
          <button
            key={view}
            onClick={() => {
              if (view === "ingest") setIngestDoneUnread(false);
              onViewChange(view);
            }}
            className={cn(
              "group relative flex items-center gap-3 text-left text-sm px-3 py-2 rounded-md transition-all duration-150 w-full",
              activeView === view
                ? "bg-accent text-primary font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-sidebar-foreground"
            )}
            aria-current={activeView === view ? "page" : undefined}
          >
            {/* Left accent bar */}
            <span
              className={cn(
                "absolute left-0 inset-y-1.5 w-[3px] rounded-full transition-all duration-200",
                activeView === view ? "bg-primary opacity-100" : "opacity-0"
              )}
            />
            <Icon
              className={cn(
                "w-4 h-4 shrink-0 transition-colors duration-150",
                activeView === view
                  ? "text-primary"
                  : "text-muted-foreground group-hover:text-sidebar-foreground"
              )}
            />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* ── Home + Logs buttons ─────────────────────────────────────────── */}
      <div className="px-2 pb-1 shrink-0 flex flex-col gap-0.5">
        <button
          onClick={() => setCurrentDb(null)}
          className="flex items-center gap-3 text-left text-sm px-3 py-2 rounded-md w-full text-muted-foreground hover:bg-accent/50 hover:text-sidebar-foreground transition-all duration-150"
          title="Back to home"
          aria-label="Back to home"
        >
          <House className="w-4 h-4 shrink-0" />
          <span>Home</span>
        </button>
        <button
          onClick={() => onViewChange("logs")}
          className={cn(
            "group relative flex items-center gap-3 text-left text-sm px-3 py-2 rounded-md w-full transition-all duration-150",
            activeView === "logs"
              ? "bg-accent text-primary font-medium"
              : "text-muted-foreground hover:bg-accent/50 hover:text-sidebar-foreground"
          )}
          aria-current={activeView === "logs" ? "page" : undefined}
        >
          <span
            className={cn(
              "absolute left-0 inset-y-1.5 w-[3px] rounded-full transition-all duration-200",
              activeView === "logs" ? "bg-primary opacity-100" : "opacity-0"
            )}
          />
          <ScrollText
            className={cn(
              "w-4 h-4 shrink-0 transition-colors duration-150",
              activeView === "logs"
                ? "text-primary"
                : "text-muted-foreground group-hover:text-sidebar-foreground"
            )}
          />
          <span>Logs</span>
        </button>
      </div>

      {/* ── Status footer ───────────────────────────────────────────────── */}
      <div className="h-px bg-sidebar-border mx-0 shrink-0" />
      <div className="px-4 py-3 flex items-center gap-3 shrink-0">
        <span
          className={cn(
            "size-2 rounded-full shrink-0",
            sidecarStatus === "connected"
              ? "bg-emerald-500"
              : sidecarStatus === "starting"
              ? "bg-amber-500 animate-pulse-dot"
              : "bg-red-500"
          )}
          aria-label={`Server ${sidecarStatus}`}
          title={`Server ${sidecarStatus}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium capitalize text-sidebar-foreground leading-none">
            {sidecarStatus}
          </p>
          <p className="text-[11px] text-muted-foreground leading-none mt-1">
            Remex serve
          </p>
        </div>
        {sidecarStatus !== "starting" && (
          <button
            onClick={triggerSidecarReconnect}
            className="shrink-0 text-muted-foreground hover:text-sidebar-foreground transition-colors p-1 rounded"
            title="Restart server"
            aria-label="Restart server"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </aside>
  );
}
