import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SourcesPane } from "./SourcesPane";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useSources: vi.fn(),
  useDeleteSource: vi.fn(),
  usePurgeCollection: vi.fn(),
}));

import { useSources, useDeleteSource, usePurgeCollection } from "@/hooks/useApi";

const mockDeleteMutate = vi.fn().mockResolvedValue({ deleted_chunks: 2 });
const mockPurgeMutate = vi.fn().mockResolvedValue({
  chunks_deleted: 1,
  chunks_checked: 5,
});

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
  vi.mocked(useSources).mockReturnValue({
    data: ["/docs/a.md", "/docs/b.md"],
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useDeleteSource).mockReturnValue({
    mutateAsync: mockDeleteMutate,
    isPending: false,
  } as any);
  vi.mocked(usePurgeCollection).mockReturnValue({
    mutateAsync: mockPurgeMutate,
    isPending: false,
  } as any);
});

describe("SourcesPane", () => {
  it("renders source paths from useSources", () => {
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText("/docs/a.md")).toBeInTheDocument();
    expect(screen.getByText("/docs/b.md")).toBeInTheDocument();
  });

  it("shows empty state when no sources", () => {
    vi.mocked(useSources).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText(/nothing ingested yet/i)).toBeInTheDocument();
  });

  it("clicking delete opens confirmation dialog", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.mouseOver(screen.getByText("/docs/a.md").closest("div")!);
    const deleteBtn = screen.getByRole("button", {
      name: /delete \/docs\/a\.md/i,
    });
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("/docs/a.md")).toBeInTheDocument();
    });
  });

  it("confirming delete calls mutateAsync with source path", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.mouseOver(screen.getByText("/docs/a.md").closest("div")!);
    fireEvent.click(
      screen.getByRole("button", { name: /delete \/docs\/a\.md/i })
    );
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => {
      expect(mockDeleteMutate).toHaveBeenCalledWith("/docs/a.md");
    });
  });

  it("purge button calls mutateAsync and shows result", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.click(screen.getByRole("button", { name: /purge stale/i }));
    await waitFor(() => {
      expect(mockPurgeMutate).toHaveBeenCalled();
      expect(screen.getByText(/purged 1 chunk/i)).toBeInTheDocument();
    });
  });
});
