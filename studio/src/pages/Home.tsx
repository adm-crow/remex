import { open } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen, Search, Upload, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import { AuroraBg } from "@/components/home/AuroraBg";
import { NetworkBg } from "@/components/home/NetworkBg";

const FEATURES = [
  {
    icon: Upload,
    label: "Ingest",
    desc: "12 file formats + SQLite",
  },
  {
    icon: Search,
    label: "Search",
    desc: "Semantic vector search",
  },
  {
    icon: Sparkles,
    label: "AI Answer",
    desc: "Anthropic · OpenAI · Ollama",
  },
  {
    icon: Database,
    label: "Collections",
    desc: "Manage your knowledge base",
  },
];

export function Home() {
  const {
    recentProjects,
    addRecentProject,
    removeRecentProject,
    setCurrentDb,
    setCurrentCollection,
    homeBg,
  } = useAppStore();

  async function handleOpen() {
    const selected = await open({
      directory: true,
      title: "Select project folder",
    });
    if (typeof selected === "string") {
      addRecentProject(selected);
      setCurrentDb(selected);
      setCurrentCollection(null);
    }
  }

  function handleRecent(path: string) {
    addRecentProject(path);
    setCurrentDb(path);
    setCurrentCollection(null);
  }

  return (
    <div className="relative flex flex-col h-screen overflow-hidden px-8">

      {/* ── Background ───────────────────────────────────────────────────── */}
      {homeBg === "dotgrid" && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="dotgrid-bg animate-grid-fade absolute inset-0" />
          <div className="dotgrid-pulse animate-grid-pulse absolute inset-0" />
          <div className="dotgrid-vignette absolute inset-0" />
        </div>
      )}
      {homeBg === "aurora"  && <AuroraBg />}
      {homeBg === "network" && <NetworkBg />}

      {/* ── Main content — centered in upper portion ───────────────────── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-10 min-h-0">

        {/* ── Brand ───────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/remex.svg"
            alt="remex"
            className="h-16 w-8 drop-shadow-sm select-none"
            draggable={false}
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Remex Studio</h1>
            <p className="text-sm text-muted-foreground mt-1 whitespace-nowrap">
              Your private knowledge base — fully offline, never leaves your machine.
            </p>
          </div>
        </div>

        {/* ── Feature pills ───────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3 w-full max-w-lg">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 rounded-xl border bg-card/80 backdrop-blur-sm px-3 py-3 text-center"
            >
              <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-primary" />
              </div>
              <p className="text-xs font-semibold leading-none">{label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
            </div>
          ))}
        </div>

        {/* ── Open button ─────────────────────────────────────────────── */}
        <Button onClick={handleOpen} size="lg" className="px-8 gap-2">
          <FolderOpen className="w-4 h-4" />
          Open project folder
        </Button>

      </div>

      {/* ── Recent projects — reserved slot at bottom, scrollable ──────── */}
      <div className="relative z-10 shrink-0 h-48 flex flex-col justify-end pb-5">
        {recentProjects.length > 0 && (
          <div className="w-full max-w-sm mx-auto space-y-2 overflow-y-auto max-h-full">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest px-1">
              Recent
            </p>
            <div className="space-y-1">
              {recentProjects.map((p) => (
                <div
                  key={p.path}
                  className={cn(
                    "group flex items-center gap-2 rounded-lg border bg-card/80 backdrop-blur-sm",
                    "hover:border-primary/30 hover:bg-accent/40 transition-all duration-150"
                  )}
                >
                  <button
                    className="flex-1 text-left px-3 py-2.5 min-w-0"
                    onClick={() => handleRecent(p.path)}
                    aria-label={`Open ${p.path}`}
                  >
                    <p className="text-xs font-mono truncate">{p.path}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(p.lastOpened).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </button>
                  <button
                    className={cn(
                      "shrink-0 mr-2 p-1.5 rounded-md text-muted-foreground",
                      "opacity-0 group-hover:opacity-100",
                      "hover:bg-destructive/10 hover:text-destructive transition-all duration-100"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecentProject(p.path);
                    }}
                    aria-label={`Remove ${p.path} from recent projects`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
