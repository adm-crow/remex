import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useCollections: vi.fn(),
  useDeleteCollection: vi.fn(),
}));

vi.mock("@/hooks/useSidecar", () => ({
  useSidecar: vi.fn(),
}));

import { useCollections, useDeleteCollection } from "@/hooks/useApi";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  });
  vi.mocked(useDeleteCollection).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as any);
});

describe("Sidebar", () => {
  it("renders all nav items", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    const onViewChange = vi.fn();
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={onViewChange} />
    );
    expect(screen.getByText("Query")).toBeInTheDocument();
    expect(screen.getByText("Ingest")).toBeInTheDocument();
    expect(screen.getByText("Collections")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("clicking a nav item calls onViewChange", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    const onViewChange = vi.fn();
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={onViewChange} />
    );
    fireEvent.click(screen.getByText("Ingest"));
    expect(onViewChange).toHaveBeenCalledWith("ingest");
  });

  it("shows green status dot when sidecar is connected", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={vi.fn()} />
    );
    expect(screen.getByLabelText("Server connected")).toBeInTheDocument();
  });

  it("shows red status dot when sidecar errors", () => {
    useAppStore.setState({ sidecarStatus: "error" } as any);
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={vi.fn()} />
    );
    expect(screen.getByLabelText("Server error")).toBeInTheDocument();
  });

  it("Home button clears currentDb and currentCollection", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={vi.fn()} />
    );
    fireEvent.click(screen.getByRole("button", { name: /change project/i }));
    expect(useAppStore.getState().currentDb).toBeNull();
    expect(useAppStore.getState().currentCollection).toBeNull();
  });

  it("Settings button at the bottom navigates to the settings view", () => {
    vi.mocked(useCollections).mockReturnValue({ data: [] } as any);
    const onViewChange = vi.fn();
    renderWithProviders(
      <Sidebar activeView="query" onViewChange={onViewChange} />
    );
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    expect(onViewChange).toHaveBeenCalledWith("settings");
  });
});
