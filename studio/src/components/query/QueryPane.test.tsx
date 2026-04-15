import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { QueryPane } from "./QueryPane";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useMultiQueryResults: vi.fn(),
  useChat: vi.fn(),
  useMultiChat: vi.fn(),
  useCollections: vi.fn(),
  useCollectionStats: vi.fn(),
  useSources: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tauri-apps/plugin-dialog")>()),
  save: vi.fn().mockResolvedValue("/tmp/results.json"),
}));

import * as useApi from "@/hooks/useApi";
import { useMultiQueryResults, useChat, useMultiChat, useCollections, useCollectionStats } from "@/hooks/useApi";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

const mockResults = [
  {
    text: "Sample chunk text",
    source: "/docs/a.md",
    source_type: "file",
    score: 0.9,
    distance: 0.1,
    chunk: 0,
    doc_title: "Doc A",
    doc_author: "",
    doc_created: "",
  },
];

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
    queryHistory: [],
  } as any);
  vi.mocked(useCollections).mockReturnValue({
    data: ["myCol"],
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useCollectionStats).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useMultiQueryResults).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useChat).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useMultiChat).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useApi.useSources).mockReturnValue({
    data: [],
    isLoading: false,
    error: null,
  } as any);
});

describe("QueryPane", () => {
  it("renders the query input and search button", () => {
    renderWithProviders(<QueryPane />);
    expect(screen.getByRole("textbox", { name: /query input/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /search/i })).toBeInTheDocument();
  });

  it("renders result cards after submitting a query", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: mockResults,
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Sample chunk text")).toBeInTheDocument();
    });
  });

  it("renders AI answer card in chat mode", async () => {
    vi.mocked(useChat).mockReturnValue({
      data: {
        answer: "Remex is a RAG tool.",
        sources: mockResults,
        provider: "anthropic",
        model: "claude-opus-4-6",
      },
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    fireEvent.click(screen.getByRole("switch", { name: /ai answer/i }));
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Remex is a RAG tool.")).toBeInTheDocument();
      expect(screen.getByText(/anthropic.*claude-opus-4-6/i)).toBeInTheDocument();
    });
  });

  it("shows 'No results' when results are empty after query", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "nothing" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("No results")).toBeInTheDocument();
    });
  });

  it("shows error banner when query fails", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Collection not found"),
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "oops" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("adds a history chip after submitting a query", async () => {
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "what is remex" })
      ).toBeInTheDocument();
    });
  });

  it("clicking a history chip re-submits the query and shows results", async () => {
    useAppStore.setState({ queryHistory: ["previous search"] } as any);
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: mockResults,
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const chip = screen.getByRole("button", { name: "previous search" });
    fireEvent.click(chip);
    await waitFor(() => {
      expect(screen.getByText("Sample chunk text")).toBeInTheDocument();
    });
  });

  it("clicking a history chip promotes it to front of history", () => {
    useAppStore.setState({
      queryHistory: ["older query", "previous search"],
    } as any);
    renderWithProviders(<QueryPane />);
    const chip = screen.getByRole("button", { name: "older query" });
    fireEvent.click(chip);
    expect(useAppStore.getState().queryHistory[0]).toBe("older query");
  });

  it("renders collection pills for each available collection", () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col-a", "col-b"],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    expect(screen.getByRole("button", { name: "col-a" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "col-b" })).toBeInTheDocument();
  });

  it("toggling a second pill adds it to the active selection", () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col-a", "col-b"],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    fireEvent.click(screen.getByRole("button", { name: "col-b" }));
    expect(screen.getByRole("button", { name: "col-b" })).toHaveClass("bg-primary");
  });

  it("shows results from multiple collections merged by score", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["col-a", "col-b"],
      isLoading: false,
      error: null,
    } as any);
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: [
        { text: "High score result", source: "col-a", score: 0.9, source_type: "file", distance: 0.1, chunk: 0, doc_title: "", doc_author: "", doc_created: "" },
        { text: "Lower score result", source: "col-b", score: 0.7, source_type: "file", distance: 0.3, chunk: 0, doc_title: "", doc_author: "", doc_created: "" },
      ],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("High score result")).toBeInTheDocument();
      expect(screen.getByText("Lower score result")).toBeInTheDocument();
    });
  });

  it("shows clear button when input has text and hides it when empty", () => {
    renderWithProviders(<QueryPane />);
    expect(screen.queryByRole("button", { name: /clear search/i })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: /query input/i }), {
      target: { value: "hello" },
    });
    expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
  });

  it("clear button resets input and results", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: mockResults,
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => expect(screen.getByText("Sample chunk text")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /clear search/i }));
    expect(input).toHaveValue("");
    expect(screen.queryByText("Sample chunk text")).not.toBeInTheDocument();
  });

  it("removing a history chip via ✕ removes only that chip", () => {
    useAppStore.setState({ queryHistory: ["first", "second"] } as any);
    renderWithProviders(<QueryPane />);
    fireEvent.click(screen.getByRole("button", { name: /remove first/i }));
    expect(screen.queryByRole("button", { name: "first" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "second" })).toBeInTheDocument();
  });

  it("Clear all removes all history chips", () => {
    useAppStore.setState({ queryHistory: ["first", "second"] } as any);
    renderWithProviders(<QueryPane />);
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(screen.queryByRole("button", { name: "first" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "second" })).not.toBeInTheDocument();
  });

  it("collection pill shows chunk count and embedding model in title", () => {
    vi.mocked(useCollectionStats).mockReturnValue({
      data: {
        name: "myCol",
        total_chunks: 42,
        total_sources: 3,
        embedding_model: "all-MiniLM-L6-v2",
      },
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const pill = screen.getByRole("button", { name: /myCol/ });
    expect(pill).toHaveAttribute("title", expect.stringContaining("42 chunks"));
    expect(pill).toHaveAttribute("title", expect.stringContaining("all-MiniLM-L6-v2"));
  });

  it("shows 'No project open' when currentDb is null", () => {
    useAppStore.setState({ currentDb: null } as any);
    renderWithProviders(<QueryPane />);
    expect(screen.getByText("No project open")).toBeInTheDocument();
  });

  it("shows idle state before any query when collections exist", () => {
    renderWithProviders(<QueryPane />);
    expect(screen.getByText("Ask anything about your documents")).toBeInTheDocument();
  });

  it("shows 'No collections yet' when collections list is empty", () => {
    vi.mocked(useCollections).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    expect(screen.getByText("No collections yet")).toBeInTheDocument();
  });

  it("passes where filter to useMultiQueryResults when source filter is active", async () => {
    vi.mocked(useApi.useSources).mockReturnValue({
      data: [
        { source: "/docs/readme.md", chunk_count: 5 },
      ],
      isLoading: false,
      error: null,
    } as any);

    useAppStore.setState({
      currentDb: "./db",
      currentCollection: "myCol",
      apiUrl: "http://localhost:8000",
    } as any);

    renderWithProviders(<QueryPane />);

    // Open the filter section
    fireEvent.click(screen.getByRole("button", { name: /filter by source/i }));

    // Click the source chip
    const chip = await screen.findByRole("button", { name: /readme\.md/i });
    fireEvent.click(chip);

    // Submit a query
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "my query" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(vi.mocked(useMultiQueryResults)).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        "my query",
        expect.objectContaining({
          where: { source: { "$eq": "/docs/readme.md" } },
        })
      );
    });
  });

  it("calls onFocusReady with a function that focuses the query input", () => {
    let focusFn: (() => void) | undefined;
    renderWithProviders(
      <QueryPane onFocusReady={(fn) => { focusFn = fn; }} />
    );
    expect(focusFn).toBeDefined();
  });

  it("shows Export button when results exist and exports on click", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: [
        {
          text: "hello world",
          source: "/docs/readme.md",
          source_type: "files",
          score: 0.9,
          distance: 0.1,
          chunk: 0,
          doc_title: "",
          doc_author: "",
          doc_created: "",
        },
      ],
      isLoading: false,
      error: null,
    } as any);

    useAppStore.setState({
      currentDb: "./db",
      currentCollection: "myCol",
      apiUrl: "http://localhost:8000",
      queryHistory: [],
    } as any);

    renderWithProviders(<QueryPane />);

    // Submit a query to see results
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "test" } });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    const exportBtn = await screen.findByRole("button", { name: /export/i });
    expect(exportBtn).toBeInTheDocument();

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(vi.mocked(save)).toHaveBeenCalled();
      expect(vi.mocked(invoke)).toHaveBeenCalledWith(
        "write_text_file",
        expect.objectContaining({ path: "/tmp/results.json" })
      );
    });
  });

  it("Escape on the input clears text and dismisses results", async () => {
    vi.mocked(useMultiQueryResults).mockReturnValue({
      data: mockResults,
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() =>
      expect(screen.getByText("Sample chunk text")).toBeInTheDocument()
    );
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("");
    expect(
      screen.getByText("Ask anything about your documents")
    ).toBeInTheDocument();
  });
});
