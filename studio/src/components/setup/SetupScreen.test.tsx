import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { useAppStore } from "@/store/app";
import { SetupScreen } from "./SetupScreen";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    sidecarStatus: "setup",
    setupStep: "Installing Python 3.11…",
    setupProgress: 1,
    setupError: "",
    sidecarReconnectSeq: 0,
    triggerSidecarReconnect: vi.fn(),
  } as any);
});

describe("SetupScreen", () => {
  it("shows the current step label during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText("Installing Python 3.11…")).toBeInTheDocument();
  });

  it("shows the once-only note during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.getByText(/this only runs once/i)).toBeInTheDocument();
  });

  it("does not show retry button during setup", () => {
    renderWithProviders(<SetupScreen />);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
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
});
