import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  useCollections,
  useCollectionStats,
  useSources,
  useDeleteSource,
  usePurgeCollection,
} from "./useApi";

vi.mock("@/api/client", () => ({
  api: {
    getCollections: vi.fn(),
    getCollectionStats: vi.fn(),
    getSources: vi.fn(),
    deleteSource: vi.fn(),
    purgeCollection: vi.fn(),
  },
}));

import { api } from "@/api/client";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.resetAllMocks());

describe("useCollections", () => {
  it("returns data from api.getCollections", async () => {
    vi.mocked(api.getCollections).mockResolvedValue(["col1", "col2"]);
    const { result } = renderHook(
      () => useCollections("http://localhost:8000", "./remex_db"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(["col1", "col2"]);
  });

  it("is disabled when dbPath is empty", async () => {
    const { result } = renderHook(
      () => useCollections("http://localhost:8000", ""),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.getCollections).not.toHaveBeenCalled();
  });
});

describe("useCollectionStats", () => {
  it("returns stats from api.getCollectionStats", async () => {
    vi.mocked(api.getCollectionStats).mockResolvedValue({
      name: "col1",
      total_chunks: 10,
      total_sources: 2,
      embedding_model: "all-MiniLM-L6-v2",
    });
    const { result } = renderHook(
      () =>
        useCollectionStats("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.total_chunks).toBe(10);
  });
});

describe("useSources", () => {
  it("returns sources list", async () => {
    vi.mocked(api.getSources).mockResolvedValue(["/path/a.md", "/path/b.md"]);
    const { result } = renderHook(
      () => useSources("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });
});

describe("useDeleteSource", () => {
  it("calls api.deleteSource with correct args", async () => {
    vi.mocked(api.deleteSource).mockResolvedValue({ deleted_chunks: 3 });
    const { result } = renderHook(
      () => useDeleteSource("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    await result.current.mutateAsync("/path/a.md");
    expect(api.deleteSource).toHaveBeenCalledWith(
      "http://localhost:8000",
      "./remex_db",
      "col1",
      "/path/a.md"
    );
  });
});

describe("usePurgeCollection", () => {
  it("calls api.purgeCollection", async () => {
    vi.mocked(api.purgeCollection).mockResolvedValue({
      chunks_deleted: 2,
      chunks_checked: 5,
    });
    const { result } = renderHook(
      () => usePurgeCollection("http://localhost:8000", "./remex_db", "col1"),
      { wrapper }
    );
    const res = await result.current.mutateAsync();
    expect(res.chunks_deleted).toBe(2);
  });
});
