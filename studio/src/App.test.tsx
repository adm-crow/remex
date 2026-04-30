import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";
import { useAppStore } from "@/store/app";

// Stub heavy pane components so they don't need full setup
vi.mock("@/components/layout/AppShell", () => ({
  AppShell: () => <div data-testid="app-shell" />,
}));
vi.mock("@/pages/Home", () => ({
  Home: () => <div data-testid="home" />,
}));
vi.mock("@/components/setup/SetupScreen", () => ({
  SetupScreen: () => <div data-testid="setup-screen"><h1>Setting up Remex…</h1><button>Retry</button></div>,
}));
vi.mock("@/hooks/useSidecar", () => ({
  useSidecar: () => {},
}));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  });
});

describe("App", () => {
  it("renders Home when currentDb is null", () => {
    render(<App />);
    expect(screen.getByTestId("home")).toBeInTheDocument();
    expect(screen.queryByTestId("app-shell")).not.toBeInTheDocument();
  });

  it("renders AppShell when currentDb is set", () => {
    useAppStore.setState({ currentDb: "./remex_db" } as any);
    render(<App />);
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.queryByTestId("home")).not.toBeInTheDocument();
  });

  it("renders SetupScreen when sidecarStatus is starting", () => {
    useAppStore.setState({ sidecarStatus: "starting" } as any);
    render(<App />);
    expect(screen.getByTestId("setup-screen")).toBeInTheDocument();
  });

  it("renders SetupScreen when sidecarStatus is setup_config", () => {
    useAppStore.setState({ sidecarStatus: "setup_config" } as any);
    render(<App />);
    expect(screen.getByTestId("setup-screen")).toBeInTheDocument();
  });

  it("renders SetupScreen when sidecarStatus is setup", () => {
    useAppStore.setState({ sidecarStatus: "setup", setupStep: "Installing Python 3.13…", setupProgress: 1, setupError: "" } as any);
    render(<App />);
    expect(screen.getByTestId("setup-screen")).toBeInTheDocument();
  });

  it("renders SetupScreen when sidecarStatus is setup_error", () => {
    useAppStore.setState({ sidecarStatus: "setup_error", setupStep: "", setupProgress: 0, setupError: "No internet." } as any);
    render(<App />);
    expect(screen.getByTestId("setup-screen")).toBeInTheDocument();
  });
});
