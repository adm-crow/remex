import { open } from "@tauri-apps/plugin-dialog";
import { X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";

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
    <div className="flex flex-col items-center justify-center h-screen gap-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Remex Studio</h1>
        <p className="text-muted-foreground mt-1">Local-first RAG interface</p>
      </div>

      <Button onClick={handleOpen} size="lg">
        <FolderOpen className="w-4 h-4 mr-2" />
        Open project folder
      </Button>

      {recentProjects.length > 0 && (
        <div className="w-96 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1">
            Recent projects
          </p>
          {recentProjects.map((p) => (
            <div
              key={p.path}
              className="group flex items-center gap-2 rounded-lg border bg-card hover:border-primary/30 hover:bg-accent/30 transition-all duration-150"
            >
              <button
                className="flex-1 text-left px-3 py-2.5 min-w-0"
                onClick={() => handleRecent(p.path)}
                aria-label={`Open ${p.path}`}
              >
                <p className="text-sm font-mono truncate">{p.path}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(p.lastOpened).toLocaleDateString()}
                </p>
              </button>
              <button
                className="shrink-0 mr-2 p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all duration-100"
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
      )}
    </div>
  );
}
