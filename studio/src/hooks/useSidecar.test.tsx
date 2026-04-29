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
  vi.mocked(tauriCore.invoke).mockResolvedValue(undefined);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useSidecar", () => {
  it("sets status to connected when health returns 200 on first check", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
    expect(tauriCore.invoke).not.toHaveBeenCalled();
  });

  it("calls spawn_sidecar when health fails initially", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue({ ok: true }),
    );

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith("spawn_sidecar", {
        host: "localhost",
        port: 8000,
      });
    });
  });

  it("sets status to connected after spawn + poll succeeds", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("still not ready"))
      .mockResolvedValue({ ok: true }),
    );

    vi.mocked(tauriCore.invoke)
      .mockResolvedValueOnce(undefined)  // spawn_sidecar succeeds
      .mockResolvedValue(true);          // is_sidecar_alive → process alive

    renderHook(() => useSidecar());

    // Advance past spawn + two poll ticks
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
  });

  it("sets status to error when invoke fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not ready")));
    vi.mocked(tauriCore.invoke).mockRejectedValue(
      new Error("remex not found")
    );

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("error");
    });
  });

  it("sets status to setup when setup://started event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not ready")));

    let fireStarted!: () => void;
    vi.mocked(tauriEvent.listen).mockClear();
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://started") fireStarted = () => (handler as any)({ payload: undefined });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(() => new Promise(() => {}));

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://started", expect.any(Function)));

    fireStarted();

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("setup");
    });
  });

  it("calls setSetupProgress when setup://progress event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not ready")));

    let fireProgress!: (payload: { step: string; index: number; total: number }) => void;
    vi.mocked(tauriEvent.listen).mockClear();
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://progress") fireProgress = (p) => (handler as any)({ payload: p });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(() => new Promise(() => {}));

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://progress", expect.any(Function)));

    fireProgress({ step: "Installing Python 3.11…", index: 1, total: 4 });

    await waitFor(() => {
      expect(useAppStore.getState().setupStep).toBe("Installing Python 3.11…");
      expect(useAppStore.getState().setupProgress).toBe(1);
    });
  });

  it("sets status to setup_error when setup://error event fires", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("not ready")));

    let fireError!: (payload: { message: string }) => void;
    vi.mocked(tauriEvent.listen).mockClear();
    vi.mocked(tauriEvent.listen).mockImplementation(async (event, handler) => {
      if (event === "setup://error") fireError = (p) => (handler as any)({ payload: p });
      return () => {};
    });
    vi.mocked(tauriCore.invoke).mockImplementation(() => new Promise(() => {}));

    renderHook(() => useSidecar());

    await waitFor(() => expect(tauriEvent.listen).toHaveBeenCalledWith("setup://error", expect.any(Function)));

    fireError({ message: "No internet connection." });

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("setup_error");
      expect(useAppStore.getState().setupError).toBe("No internet connection.");
    });
  });
});
