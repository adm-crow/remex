import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { QueryPane } from "./QueryPane";
import { useAppStore } from "@/store/app";

vi.mock("@/hooks/useApi", () => ({
  useQueryResults: vi.fn(),
  useChat: vi.fn(),
  useCollections: vi.fn(),
}));

import { useQueryResults, useChat, useCollections } from "@/hooks/useApi";

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
  vi.mocked(useQueryResults).mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
  } as any);
  vi.mocked(useChat).mockReturnValue({
    data: undefined,
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
    vi.mocked(useQueryResults).mockReturnValue({
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
    // Enable AI toggle
    fireEvent.click(screen.getByRole("switch", { name: /ai answer/i }));
    // Submit a query
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "what is remex" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText("Remex is a RAG tool.")).toBeInTheDocument();
      expect(screen.getByText(/anthropic.*claude-opus-4-6/i)).toBeInTheDocument();
    });
  });

  it("shows 'No results found' when results are empty after query", async () => {
    vi.mocked(useQueryResults).mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);
    renderWithProviders(<QueryPane />);
    const input = screen.getByRole("textbox", { name: /query input/i });
    fireEvent.change(input, { target: { value: "nothing" } });
    fireEvent.submit(input.closest("form")!);
    await waitFor(() => {
      expect(screen.getByText(/no results found/i)).toBeInTheDocument();
    });
  });

  it("shows error banner when query fails", async () => {
    vi.mocked(useQueryResults).mockReturnValue({
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
    vi.mocked(useQueryResults).mockReturnValue({
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
});
