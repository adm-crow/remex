import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Home } from "./Home";
import * as dialog from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/store/app";

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

describe("Home", () => {
  it("renders the app title and open button", () => {
    render(<Home />);
    expect(screen.getByText("Remex Studio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open remex_db folder/i })
    ).toBeInTheDocument();
  });

  it("does not render recent projects section when list is empty", () => {
    render(<Home />);
    expect(screen.queryByText(/recent projects/i)).not.toBeInTheDocument();
  });

  it("renders recent projects when store has entries", () => {
    useAppStore.setState({
      recentProjects: [
        { path: "/my/db", lastOpened: "2026-04-01T00:00:00.000Z" },
      ],
    } as any);
    render(<Home />);
    expect(screen.getByText(/recent projects/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Open /my/db")).toBeInTheDocument();
  });

  it("clicking a recent project sets currentDb in store", () => {
    useAppStore.setState({
      recentProjects: [
        { path: "/my/db", lastOpened: "2026-04-01T00:00:00.000Z" },
      ],
    } as any);
    render(<Home />);
    fireEvent.click(screen.getByLabelText("Open /my/db"));
    expect(useAppStore.getState().currentDb).toBe("/my/db");
  });

  it("open button calls dialog.open and sets currentDb on selection", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/selected/db");
    render(<Home />);
    fireEvent.click(
      screen.getByRole("button", { name: /open remex_db folder/i })
    );
    await waitFor(() => {
      expect(useAppStore.getState().currentDb).toBe("/selected/db");
    });
  });

  it("open button does nothing when dialog is cancelled (null)", async () => {
    vi.mocked(dialog.open).mockResolvedValue(null);
    render(<Home />);
    fireEvent.click(
      screen.getByRole("button", { name: /open remex_db folder/i })
    );
    await waitFor(() => {
      expect(useAppStore.getState().currentDb).toBeNull();
    });
  });
});
