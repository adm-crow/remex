import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/app";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 60000;
const HEALTH_CHECK_TIMEOUT_MS = 3000;

function parseUrl(apiUrl: string): { host: string; port: number } {
  try {
    const u = new URL(apiUrl);
    return {
      host: u.hostname || "127.0.0.1",
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // True only when this effect run successfully spawned the sidecar.
  // Used to avoid killing an externally-started server on cleanup
  // (important in React StrictMode which mounts → unmounts → remounts).
  const didSpawnRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    didSpawnRef.current = false;
    const { host, port } = parseUrl(apiUrl);

    async function checkHealth(): Promise<boolean> {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), HEALTH_CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(`${apiUrl}/health`, { signal: ctrl.signal });
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

      try {
        await invoke("spawn_sidecar", { host, port });
        didSpawnRef.current = true;
      } catch (err) {
        console.error("[useSidecar] spawn_sidecar failed:", err);
        if (!cancelled) setSidecarStatus("error");
        return;
      }

      if (cancelled) return;

      const deadline = Date.now() + TIMEOUT_MS;
      // Use a local variable so each effect's callbacks only clear their own
      // timer — not the one created by a subsequent StrictMode re-mount.
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
        // Bail fast if the process has already died
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
      // Only kill the sidecar if we spawned it — not if we found an
      // already-running external server (avoids killing it on React
      // StrictMode's double-mount or on unrelated re-renders).
      if (didSpawnRef.current) {
        didSpawnRef.current = false;
        invoke("kill_sidecar").catch(() => {});
      }
    };
  }, [apiUrl, reconnectSeq, setSidecarStatus]);
}
