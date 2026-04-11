import { cn } from "@/lib/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/store/app";

export type View = "query" | "ingest" | "sources" | "settings";

interface SidebarProps {
  activeView: View;
  onViewChange: (v: View) => void;
}

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: "query", label: "Query" },
  { view: "ingest", label: "Ingest" },
  { view: "sources", label: "Sources" },
  { view: "settings", label: "Settings" },
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const { currentDb, sidecarStatus } = useAppStore();

  const statusColor =
    sidecarStatus === "connected"
      ? "bg-green-500"
      : sidecarStatus === "starting"
      ? "bg-amber-500"
      : "bg-red-500";

  const truncated =
    currentDb && currentDb.length > 30
      ? "…" + currentDb.slice(-27)
      : (currentDb ?? "");

  return (
    <aside className="w-52 shrink-0 flex flex-col border-r bg-muted/30 h-full">
      <div className="p-3 space-y-2">
        <p
          className="text-xs text-muted-foreground truncate"
          title={currentDb ?? ""}
          aria-label="Current database"
        >
          {truncated}
        </p>
        <CollectionSwitcher />
      </div>
      <Separator />
      <nav className="flex flex-col p-2 gap-1 flex-1">
        {NAV_ITEMS.map(({ view, label }) => (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            className={cn(
              "text-left text-sm px-3 py-1.5 rounded hover:bg-accent transition-colors",
              activeView === view && "bg-accent font-medium"
            )}
            aria-current={activeView === view ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      <Separator />
      <div className="p-3 flex items-center gap-2">
        <span
          className={cn("w-2 h-2 rounded-full", statusColor)}
          aria-label={`Server ${sidecarStatus}`}
          title={`Server ${sidecarStatus}`}
        />
        <span className="text-xs text-muted-foreground capitalize">
          {sidecarStatus}
        </span>
      </div>
    </aside>
  );
}
