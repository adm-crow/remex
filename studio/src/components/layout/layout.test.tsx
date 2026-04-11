import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { Sidebar } from "./Sidebar";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useCollections: vi.fn(),
}));

vi.mock("@/hooks/useSidecar", () => ({
  useSidecar: vi.fn(),
}));

import { useCollections } from "@/hooks/useApi";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    recentProjects: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  });
});

describe("CollectionSwitcher", () => {
  it("renders available collections in the dropdown", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col1", "col2"],
      isLoading: false,
    } as any);
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    await waitFor(() => {
      expect(screen.getByText("col1")).toBeInTheDocument();
      expect(screen.getByText("col2")).toBeInTheDocument();
    });
  });

  it("selecting a collection updates the store", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col1", "col2"],
      isLoading: false,
    } as any);
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("combobox", { name: /collection/i }));
    await waitFor(() => screen.getByText("col1"));
    fireEvent.click(screen.getByText("col1"));
    expect(useAppStore.getState().currentCollection).toBe("col1");
  });
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
    expect(screen.getByText("Sources")).toBeInTheDocument();
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
});
