import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { useAppStore } from "@/store/app";
import { SetupScreen } from "./SetupScreen";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    sidecarStatus: "setup",
    setupStep: "Installing Python 3.13…",
    setupProgress: 1,
    setupError: "",
    setupExtras: [],
    setupLogLines: [],
    apiUrl: "http://127.0.0.1:8000",
    sidecarReconnectSeq: 0,
    triggerSidecarReconnect: vi.fn(),
    setSetupExtras: vi.fn(),
    completeSetup: vi.fn(),
    clearSetupLog: vi.fn(),
    setSetupProgress: vi.fn(),
  } as any);
});

describe("SetupScreen", () => {
  it("shows a spinner in starting state", () => {
    useAppStore.setState({ sidecarStatus: "starting" } as any);
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText(/starting/i)).toBeInTheDocument();
  });

  it("shows extras checkboxes and install button in setup_config state", () => {
    useAppStore.setState({ sidecarStatus: "setup_config" } as any);
    renderWithProviders(<SetupScreen />);
    expect(screen.getByRole("button", { name: /install/i })).toBeInTheDocument();
    expect(screen.getByText(/extra file formats/i)).toBeInTheDocument();
    expect(screen.getByText(/ai integrations/i)).toBeInTheDocument();
    expect(screen.getByText(/sentence-aware chunking/i)).toBeInTheDocument();
  });

  it("toggles extra selection on checkbox click in setup_config state", () => {
    useAppStore.setState({ sidecarStatus: "setup_config" } as any);
    renderWithProviders(<SetupScreen />);
    const checkbox = screen.getByRole("checkbox", { name: /extra file formats/i });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("shows the current step label during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText("Installing Python 3.13…")).toBeInTheDocument();
  });

  it("shows the once-only note during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText(/this only runs once/i)).toBeInTheDocument();
  });

  it("does not show retry button during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("does not show log lines during normal setup progress", () => {
    useAppStore.setState({ setupLogLines: ["Downloading remex-cli…", "Done."] } as any);
    renderWithProviders(<SetupScreen />);
    expect(screen.queryByText("Downloading remex-cli…")).not.toBeInTheDocument();
  });

  it("shows log lines on error screen to help diagnose failures", () => {
    useAppStore.setState({
      sidecarStatus: "setup_error",
      setupError: "Network error",
      setupLogLines: ["Downloading remex-cli…", "Connection refused"],
    } as any);
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText("Downloading remex-cli…")).toBeInTheDocument();
    expect(screen.getByText("Connection refused")).toBeInTheDocument();
  });

  it("shows error message and retry button on setup_error", () => {
    useAppStore.setState({
      sidecarStatus: "setup_error",
      setupError: "Setup requires an internet connection. Please connect and retry.",
      setupStep: "",
      setupProgress: 0,
    } as any);
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText(/setup requires an internet connection/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("calls triggerSidecarReconnect when retry is clicked", () => {
    const reconnect = vi.fn();
    useAppStore.setState({
      sidecarStatus: "setup_error",
      setupError: "error",
      triggerSidecarReconnect: reconnect,
    } as any);
    renderWithProviders(<SetupScreen />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(reconnect).toHaveBeenCalledOnce();
  });

  it("calls invoke and completeSetup on install click", async () => {
    const { invoke } = await import("@tauri-apps/api/core");
    const completeSetup = vi.fn();
    useAppStore.setState({
      sidecarStatus: "setup_config",
      completeSetup,
    } as any);
    renderWithProviders(<SetupScreen />);
    fireEvent.click(screen.getByRole("button", { name: /install/i }));
    await waitFor(() => expect(completeSetup).toHaveBeenCalledOnce());
    expect(invoke).toHaveBeenCalledWith("spawn_sidecar", expect.objectContaining({ host: "127.0.0.1", port: 8000 }));
  });
});
