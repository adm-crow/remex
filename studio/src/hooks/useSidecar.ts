import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/app";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 60000;
const HEALTH_CHECK_TIMEOUT_MS = 3000;

function parseUrl(apiUrl: string): { host: string; port: number } {
  try {
    const u = new URL(apiUrl);
    // Always use 127.0.0.1 — on Windows "localhost" can resolve to ::1 (IPv6)
    // which causes the Tauri WebView fetch to fail against an IPv4-bound server.
    const hostname = u.hostname === "localhost" ? "127.0.0.1" : (u.hostname || "127.0.0.1");
    return {
      host: hostname,
      port: u.port ? parseInt(u.port) : 8000,
    };
  } catch {
    return { host: "127.0.0.1", port: 8000 };
  }
}

export function useSidecar() {
  const apiUrl = useAppStore((s) => s.apiUrl);
  const reconnectSeq = useAppStore((s) => s.sidecarReconnectSeq);
  const setSidecarStatus = useAppStore((s) => s.setSidecarStatus);
  const setSidecarError = useAppStore((s) => s.setSidecarError);
  const setSetupProgress = useAppStore((s) => s.setSetupProgress);
  const setSetupError = useAppStore((s) => s.setSetupError);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didSpawnRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    didSpawnRef.current = false;
    const { host, port } = parseUrl(apiUrl);

    async function checkHealth(): Promise<boolean> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(`http://${host}:${port}/health`, { signal: ctrl.signal });
        return res.ok;
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    }

    async function start() {
      setSidecarStatus("starting");

      if (await checkHealth()) {
        if (!cancelled) setSidecarStatus("connected");
        return;
      }

      if (cancelled) return;

      // Register setup event listeners before invoking spawn_sidecar so we
      // don't miss events emitted during the (potentially long) setup phase.
      const unlistenStarted = await listen("setup://started", () => {
        if (!cancelled) setSidecarStatus("setup");
      });
      const unlistenProgress = await listen<{ step: string; index: number; total: number }>(
        "setup://progress",
        (event) => {
          if (!cancelled) setSetupProgress(event.payload.step, event.payload.index);
        }
      );
      const unlistenError = await listen<{ message: string }>("setup://error", (event) => {
        if (!cancelled) {
          setSetupError(event.payload.message);
          setSidecarStatus("setup_error");
        }
      });
      const unlistenDone = await listen("setup://done", () => {
        // spawn_sidecar resolves after this; status transitions to "starting" naturally
      });

      try {
        await invoke("spawn_sidecar", { host, port });
        didSpawnRef.current = true;
      } catch (err) {
        console.error("[useSidecar] spawn_sidecar failed:", err);
        // Don't overwrite "setup_error" — the SetupScreen already shows the
        // specific message and Retry button from the setup://error event.
        if (!cancelled && useAppStore.getState().sidecarStatus !== "setup_error") {
          setSidecarError(String(err));
          setSidecarStatus("error");
        }
        return;
      } finally {
        unlistenStarted();
        unlistenProgress();
        unlistenError();
        unlistenDone();
      }

      if (cancelled) return;
      setSidecarStatus("starting");

      const deadline = Date.now() + TIMEOUT_MS;
      let timerId: ReturnType<typeof setInterval>;
      timerId = setInterval(async () => {
        if (cancelled) {
          clearInterval(timerId);
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(timerId);
          if (!cancelled) setSidecarStatus("error");
          return;
        }
        const alive = await invoke<boolean>("is_sidecar_alive").catch(() => false);
        if (!alive) {
          clearInterval(timerId);
          if (!cancelled) setSidecarStatus("error");
          return;
        }
        if (await checkHealth()) {
          clearInterval(timerId);
          if (!cancelled) setSidecarStatus("connected");
        }
      }, POLL_INTERVAL_MS);
      intervalRef.current = timerId;
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (didSpawnRef.current) {
        didSpawnRef.current = false;
        invoke("kill_sidecar").catch(() => {});
      }
    };
  }, [apiUrl, reconnectSeq, setSidecarStatus, setSidecarError, setSetupProgress, setSetupError]);
}
