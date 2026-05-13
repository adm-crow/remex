import { useState } from "react";
import { cn } from "@/lib/utils";
import { FilesTab } from "./FilesTab";
import { SQLiteTab } from "./SQLiteTab";

type Tab = "files" | "sqlite";

export function IngestPane() {
  const [activeTab, setActiveTab] = useState<Tab>("files");

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b px-4 shrink-0">
        {(["files", "sqlite"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab === "files" ? "Files" : "SQLite"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === "files" ? <FilesTab /> : <SQLiteTab />}
      </div>
    </div>
  );
}
