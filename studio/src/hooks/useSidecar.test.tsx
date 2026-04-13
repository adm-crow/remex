import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useSidecar } from "./useSidecar";
import * as tauriCore from "@tauri-apps/api/core";
import { useAppStore } from "@/store/app";

// Mock the api module
vi.mock("@/api/client", () => ({
  api: { getHealth: vi.fn() },
}));

import { api } from "@/api/client";

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
});

describe("useSidecar", () => {
  it("sets status to connected when health returns 200 on first check", async () => {
    vi.mocked(api.getHealth).mockResolvedValue({
      status: "ok",
      version: "0.2.0",
    });

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
    expect(tauriCore.invoke).not.toHaveBeenCalled();
  });

  it("calls spawn_sidecar when health fails initially", async () => {
    vi.mocked(api.getHealth)
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValue({ status: "ok", version: "0.2.0" });

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(tauriCore.invoke).toHaveBeenCalledWith("spawn_sidecar", {
        host: "localhost",
        port: 8000,
      });
    });
  });

  it("sets status to connected after spawn + poll succeeds", async () => {
    vi.mocked(tauriCore.invoke)
      .mockResolvedValueOnce(undefined)  // spawn_sidecar succeeds
      .mockResolvedValue(true);          // is_sidecar_alive → process alive

    vi.mocked(api.getHealth)
      .mockRejectedValueOnce(new Error("not ready"))
      .mockRejectedValueOnce(new Error("still not ready"))
      .mockResolvedValue({ status: "ok", version: "0.2.0" });

    renderHook(() => useSidecar());

    // Advance past spawn + two poll ticks
    await vi.advanceTimersByTimeAsync(5000);

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("connected");
    });
  });

  it("sets status to error when invoke fails", async () => {
    vi.mocked(api.getHealth).mockRejectedValue(new Error("not ready"));
    vi.mocked(tauriCore.invoke).mockRejectedValue(
      new Error("remex not found")
    );

    renderHook(() => useSidecar());

    await waitFor(() => {
      expect(useAppStore.getState().sidecarStatus).toBe("error");
    });
  });
});
