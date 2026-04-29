import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSidecar } from "./useSidecar";
import * as tauriCore from "@tauri-apps/api/core";
import * as tauriEvent from "@tauri-apps/api/event";
import { useAppStore } from "@/store/app";

// @testing-library/dom's waitFor detects fake timers by checking `typeof jest`.
// Vitest doesn't inject a jest global, so we alias vi → jest here so that
// waitFor can call jest.advanceTimersByTime and flush the fake timer queue.
(globalThis as unknown as Record<string, unknown>).jest = vi;

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useSidecar", () => {
  it("sets status to connected when health check succeeds on first poll", async () => {
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd) => {
      if (cmd === "check_sidecar_health") return true;
      return undefined;
    });

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
    expect(tauriCore.invoke).not.toHaveBeenCalledWith("spawn_sidecar", expect.anything());
  });

  it("calls spawn_sidecar when health fails initially", async () => {
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd) => {
      if (cmd === "check_sidecar_health") return false;
      return undefined;
    });

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith("spawn_sidecar", {
        host: "127.0.0.1",
        port: 8000,
      });
    });
  });

  it("sets status to connected after spawn + poll succeeds", async () => {
    let healthCalls = 0;
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd) => {
      if (cmd === "check_sidecar_health") return ++healthCalls > 1;
      if (cmd === "is_sidecar_alive") return true;
      return undefined; // spawn_sidecar
    });

    renderHook(() => useSidecar());

    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
  });

  it("sets status to error when invoke fails", async () => {
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd) => {
      if (cmd === "check_sidecar_health") return false;
      throw new Error("remex not found");
    });

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("error");
    });
  });

  it("sets status to setup when setup://started event fires", async () => {
    let fireStarted!: () => void;
    vi.mocked(tauriEvent.listen).mockClear();
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://started") fireStarted = () => (handler as any)({ payload: undefined });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd) => {
      if (cmd === "check_sidecar_health") return false;
      return new Promise(() => {}); // spawn_sidecar hangs
    });

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://started", expect.any(Function)));

    fireStarted();

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("setup");
    });
  });

  it("calls setSetupProgress when setup://progress event fires", async () => {
    let fireProgress!: (payload: { step: string; index: number; total: number }) => void;
    vi.mocked(tauriEvent.listen).mockClear();
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://progress") fireProgress = (p) => (handler as any)({ payload: p });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd) => {
      if (cmd === "check_sidecar_health") return false;
      return new Promise(() => {});
    });

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://progress", expect.any(Function)));

    fireProgress({ step: "Installing Python 3.13…", index: 1, total: 4 });

    await waitFor(() => {
      expect(useAppStore.getState().setupStep).toBe("Installing Python 3.13…");
      expect(useAppStore.getState().setupProgress).toBe(1);
    });
  });

  it("sets status to setup_error when setup://error event fires", async () => {
    let fireError!: (payload: { message: string }) => void;
    vi.mocked(tauriEvent.listen).mockClear();
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://error") fireError = (p) => (handler as any)({ payload: p });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(async (cmd) => {
      if (cmd === "check_sidecar_health") return false;
      return new Promise(() => {});
    });

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://error", expect.any(Function)));

    fireError({ message: "No internet connection." });

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("setup_error");
      expect(useAppStore.getState().setupError).toBe("No internet connection.");
    });
  });
});
