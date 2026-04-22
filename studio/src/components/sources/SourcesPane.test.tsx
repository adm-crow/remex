import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SourcesPane } from "./SourcesPane";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useCollections: vi.fn(),
  useCollectionStats: vi.fn(),
  useSources: vi.fn(),
  useDeleteSource: vi.fn(),
  usePurgeCollection: vi.fn(),
  useDeleteCollection: vi.fn(),
  useRenameCollection: vi.fn(),
  useUpdateCollectionDescription: vi.fn(),
}));

import {
  useCollections,
  useCollectionStats,
  useSources,
  useDeleteSource,
  usePurgeCollection,
  useDeleteCollection,
  useRenameCollection,
  useUpdateCollectionDescription,
} from "@/hooks/useApi";

const mockDeleteMutate = vi.fn().mockResolvedValue({ deleted_chunks: 2 });
const mockPurgeMutate  = vi.fn().mockResolvedValue({ chunks_deleted: 1, chunks_checked: 5 });
const mockDeleteCollectionMutate = vi.fn().mockResolvedValue({ deleted: true });
const mockRenameMutate = vi.fn();

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);

  vi.mocked(useCollections).mockReturnValue({
    data: ["myCol"],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(useCollectionStats).mockReturnValue({
    data: {
      total_chunks: 42,
      total_sources: 3,
      embedding_model: "all-MiniLM-L6-v2",
    },
    isLoading: false,
  } as any);

  vi.mocked(useSources).mockReturnValue({
    data: [
      { source: "/docs/a.md", chunk_count: 4 },
      { source: "/docs/b.md", chunk_count: 7 },
    ],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(useDeleteSource).mockReturnValue({
    mutateAsync: mockDeleteMutate,
    isPending: false,
    error: null,
  } as any);

  vi.mocked(usePurgeCollection).mockReturnValue({
    mutateAsync: mockPurgeMutate,
    isPending: false,
    error: null,
  } as any);

  vi.mocked(useDeleteCollection).mockReturnValue({
    mutateAsync: mockDeleteCollectionMutate,
    isPending: false,
    error: null,
  } as any);

  vi.mocked(useRenameCollection).mockReturnValue({
    mutate: mockRenameMutate,
    isPending: false,
    error: null,
  } as any);

  vi.mocked(useUpdateCollectionDescription).mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
    error: null,
  } as any);
});

describe("SourcesPane", () => {
  it("shows prompt when no project is open", () => {
    useAppStore.setState({ currentDb: null } as any);
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText(/open a project first/i)).toBeInTheDocument();
  });

  it("renders collection names from useCollections", () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["myCol", "otherCol"],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText("myCol")).toBeInTheDocument();
    expect(screen.getByText("otherCol")).toBeInTheDocument();
  });

  it("shows 'active' badge for the current collection", () => {
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows stats row with chunk and source counts", () => {
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("all-MiniLM-L6-v2")).toBeInTheDocument();
  });

  it("shows empty state when no collections", () => {
    vi.mocked(useCollections).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<SourcesPane />);
    expect(screen.getByText(/no collections yet/i)).toBeInTheDocument();
  });

  it("expanding a collection reveals source paths", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.click(screen.getByRole("button", { name: /expand myCol/i }));
    await waitFor(() => {
      expect(screen.getByText("/docs/a.md")).toBeInTheDocument();
      expect(screen.getByText("/docs/b.md")).toBeInTheDocument();
    });
  });

  it("clicking delete on a source opens confirmation dialog", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.click(screen.getByRole("button", { name: /expand myCol/i }));
    await waitFor(() => screen.getByText("/docs/a.md"));
    fireEvent.click(
      screen.getByRole("button", { name: /delete \/docs\/a\.md/i })
    );
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("clicking collection delete button opens confirmation dialog", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection myCol/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText(/delete collection/i)).toBeInTheDocument();
    });
  });

  it("confirming collection delete calls mutateAsync and clears currentCollection", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection myCol/i }));
    await waitFor(() => screen.getByRole("dialog"));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => {
      expect(mockDeleteCollectionMutate).toHaveBeenCalledWith("myCol");
      expect(useAppStore.getState().currentCollection).toBeNull();
    });
  });

  it("purge button calls mutateAsync and shows result", async () => {
    renderWithProviders(<SourcesPane />);
    fireEvent.click(screen.getByTitle(/purge stale chunks/i));
    await waitFor(() => {
      expect(mockPurgeMutate).toHaveBeenCalled();
      expect(screen.getByText(/purged 1 \/ 5 chunks/i)).toBeInTheDocument();
    });
  });
});
