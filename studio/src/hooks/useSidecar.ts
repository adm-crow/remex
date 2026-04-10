import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api } from "@/api/client";
import { useAppStore } from "@/store/app";

const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS = 15000;

export function useSidecar() {
  const apiUrl = useAppStore((s) => s.apiUrl);
  const setSidecarStatus = useAppStore((s) => s.setSidecarStatus);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkHealth(): Promise<boolean> {
      try {
        await api.getHealth(apiUrl);
        return true;
      } catch {
        return false;
      }
    }

    async function start() {
      setSidecarStatus("starting");

      if (await checkHealth()) {
        if (!cancelled) setSidecarStatus("connected");
        return;
      }

      try {
        await invoke("spawn_sidecar");
      } catch {
        if (!cancelled) setSidecarStatus("error");
        return;
      }

      const deadline = Date.now() + TIMEOUT_MS;
      intervalRef.current = setInterval(async () => {
        if (cancelled) {
          clearInterval(intervalRef.current!);
          return;
        }
        if (Date.now() > deadline) {
          clearInterval(intervalRef.current!);
          setSidecarStatus("error");
          return;
        }
        if (await checkHealth()) {
          clearInterval(intervalRef.current!);
          setSidecarStatus("connected");
        }
      }, POLL_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [apiUrl, setSidecarStatus]);
}
