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

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
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
});
