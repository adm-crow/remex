import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "@/store/app";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 60000;

export function parseUrl(apiUrl: string): { host: string; port: number } {
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
  const setupExtras = useAppStore((s) => s.setupExtras);
  const setSidecarStatus = useAppStore((s) => s.setSidecarStatus);
  const setSidecarError = useAppStore((s) => s.setSidecarError);
  const setSetupProgress = useAppStore((s) => s.setSetupProgress);
  const setSetupError = useAppStore((s) => s.setSetupError);
  const appendSetupLog = useAppStore((s) => s.appendSetupLog);
  const clearSetupLog = useAppStore((s) => s.clearSetupLog);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const didSpawnRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    didSpawnRef.current = false;
    const { host, port } = parseUrl(apiUrl);

    async function checkHealth(): Promise<boolean> {
      return invoke<boolean>("check_sidecar_health", { host, port }).catch(() => false);
    }

    // Register all setup event listeners unconditionally so they fire whether
    // spawn_sidecar is called from useSidecar or directly from SetupScreen.
    const unlistenAll = Promise.all([
      listen("setup://started", () => {
        if (!cancelled) {
          clearSetupLog();
          setSidecarStatus("setup");
        }
      }),
      listen<{ step: string; index: number; total: number }>(
        "setup://progress",
        (event) => {
          if (!cancelled) setSetupProgress(event.payload.step, event.payload.index);
        }
      ),
      listen<{ message: string }>("setup://error", (event) => {
        if (!cancelled) {
          setSetupError(event.payload.message);
          setSidecarStatus("setup_error");
        }
      }),
      listen("setup://done", () => {
        // spawn_sidecar resolves shortly after this; status moves to "starting" naturally
      }),
      listen<{ message: string }>("setup://log", (event) => {
        if (!cancelled) appendSetupLog(event.payload.message);
      }),
    ]);

    async function spawnAndPoll() {
      try {
        await invoke("spawn_sidecar", { host, port, extras: setupExtras });
        didSpawnRef.current = true;
      } catch (err) {
        console.error("[useSidecar] spawn_sidecar failed:", err);
        if (!cancelled && useAppStore.getState().sidecarStatus !== "setup_error") {
          setSidecarError(String(err));
          setSidecarStatus("error");
        }
        return;
      }

      if (cancelled) return;
      setSidecarStatus("starting");

      const deadline = Date.now() + TIMEOUT_MS;
      const timerId = setInterval(async () => {
        if (cancelled) { clearInterval(timerId); return; }
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

    async function start() {
      setSidecarStatus("starting");

      if (await checkHealth()) {
        if (!cancelled) setSidecarStatus("connected");
        return;
      }
      if (cancelled) return;

      // Check whether a fresh install is needed (first run or version change).
      // If so, show the extras-selection screen and let the user trigger install
      // from SetupScreen rather than spawning automatically.
      let needsSetup = false;
      try {
        needsSetup = await invoke<boolean>("check_needs_setup", { extras: setupExtras });
      } catch {
        needsSetup = false;
      }

      if (needsSetup) {
        if (!cancelled) setSidecarStatus("setup_config");
        return; // SetupScreen calls spawn_sidecar then triggerSidecarReconnect
      }

      // Already installed — just not running. Spawn directly.
      await spawnAndPoll();
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      unlistenAll.then((fns) => fns.forEach((fn) => fn()));
      if (didSpawnRef.current) {
        didSpawnRef.current = false;
        invoke("kill_sidecar").catch(() => {});
      }
    };
  }, [apiUrl, reconnectSeq, setupExtras, setSidecarStatus, setSidecarError, setSetupProgress, setSetupError, appendSetupLog, clearSetupLog]);
}
