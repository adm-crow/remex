import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { RefreshCw, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LogsPane() {
  const [log, setLog] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await invoke<string>("read_sidecar_log");
      // eslint-disable-next-line no-control-regex
      setLog(raw.replace(/\x1b\[[0-9;]*m/g, ""));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleCopy() {
    await navigator.clipboard.writeText(log);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleExport() {
    const path = await save({
      defaultPath: "remex-sidecar.log",
      filters: [{ name: "Log files", extensions: ["log", "txt"] }],
    });
    if (path) await invoke("export_log", { path, content: log });
  }

  return (
    <div className="flex flex-col h-full p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm font-semibold">Sidecar Logs</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Output from the remex server process
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn("size-3.5 mr-1.5", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCopy} disabled={!log}>
            <Copy className="size-3.5 mr-1.5" />
            {copied ? "Copied!" : "Copy"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleExport} disabled={!log}>
            <Download className="size-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </div>

      <div className="flex-1 rounded-md border bg-muted/30 overflow-auto min-h-0">
        {log ? (
          <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all text-foreground/80 leading-relaxed">
            {log}
          </pre>
        ) : (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            {loading ? "Loading…" : "No log file found. Start the sidecar first."}
          </div>
        )}
      </div>
    </div>
  );
}
