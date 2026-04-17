import { open } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen, Search, Upload, Database, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";

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

      {/* ── Aurora background ────────────────────────────────────────────── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Blob 1 — indigo/violet, top-left */}
        <div
          className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full opacity-30 dark:opacity-20"
          style={{
            background: "radial-gradient(circle, oklch(0.60 0.22 280) 0%, transparent 70%)",
            filter: "blur(72px)",
            animation: "aurora-1 18s ease-in-out infinite",
          }}
        />
        {/* Blob 2 — cyan/blue, top-right */}
        <div
          className="absolute -top-16 -right-40 w-[480px] h-[480px] rounded-full opacity-25 dark:opacity-15"
          style={{
            background: "radial-gradient(circle, oklch(0.65 0.20 220) 0%, transparent 70%)",
            filter: "blur(80px)",
            animation: "aurora-2 22s ease-in-out infinite",
          }}
        />
        {/* Blob 3 — violet/pink, bottom-right */}
        <div
          className="absolute -bottom-24 -right-24 w-[440px] h-[440px] rounded-full opacity-25 dark:opacity-15"
          style={{
            background: "radial-gradient(circle, oklch(0.62 0.24 320) 0%, transparent 70%)",
            filter: "blur(88px)",
            animation: "aurora-3 26s ease-in-out infinite",
          }}
        />
        {/* Blob 4 — teal, bottom-left */}
        <div
          className="absolute -bottom-16 -left-16 w-[380px] h-[380px] rounded-full opacity-20 dark:opacity-10"
          style={{
            background: "radial-gradient(circle, oklch(0.68 0.18 195) 0%, transparent 70%)",
            filter: "blur(80px)",
            animation: "aurora-4 20s ease-in-out infinite",
          }}
        />
      </div>

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
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
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
