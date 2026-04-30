import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./app";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    sidecarStatus: "starting",
    setupStep: "",
    setupProgress: 0,
    setupError: "",
  } as any);
});

describe("setup store fields", () => {
  it("setSetupProgress updates step and progress", () => {
    useAppStore.getState().setSetupProgress("Installing Python 3.11…", 1);
    const s = useAppStore.getState();
    expect(s.setupStep).toBe("Installing Python 3.11…");
    expect(s.setupProgress).toBe(1);
  });

  it("setSetupError updates error message", () => {
    useAppStore.getState().setSetupError("No internet connection.");
    expect(useAppStore.getState().setupError).toBe("No internet connection.");
  });

  it("setSidecarStatus accepts setup, setup_config and setup_error", () => {
    useAppStore.getState().setSidecarStatus("setup");
    expect(useAppStore.getState().sidecarStatus).toBe("setup");
    useAppStore.getState().setSidecarStatus("setup_config");
    expect(useAppStore.getState().sidecarStatus).toBe("setup_config");
    useAppStore.getState().setSidecarStatus("setup_error");
    expect(useAppStore.getState().sidecarStatus).toBe("setup_error");
  });

  it("appendSetupLog adds lines and clearSetupLog empties them", () => {
    useAppStore.getState().appendSetupLog("line 1");
    useAppStore.getState().appendSetupLog("line 2");
    expect(useAppStore.getState().setupLogLines).toEqual(["line 1", "line 2"]);
    useAppStore.getState().clearSetupLog();
    expect(useAppStore.getState().setupLogLines).toEqual([]);
  });

  it("setSetupExtras updates selectedExtras", () => {
    useAppStore.getState().setSetupExtras(["formats", "ai"]);
    expect(useAppStore.getState().setupExtras).toEqual(["formats", "ai"]);
  });
});
