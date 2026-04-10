import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";

export function Home() {
  const { recentProjects, addRecentProject, setCurrentDb, setCurrentCollection } =
    useAppStore();

  async function handleOpen() {
    const selected = await open({
      directory: true,
      title: "Select remex_db folder",
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
        Open remex_db folder
      </Button>

      {recentProjects.length > 0 && (
        <div className="w-96 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Recent projects
          </p>
          {recentProjects.map((p) => (
            <button
              key={p.path}
              onClick={() => handleRecent(p.path)}
              className="w-full text-left p-3 rounded border hover:bg-accent transition-colors"
              aria-label={`Open ${p.path}`}
            >
              <p className="text-sm font-mono truncate">{p.path}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(p.lastOpened).toLocaleDateString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
