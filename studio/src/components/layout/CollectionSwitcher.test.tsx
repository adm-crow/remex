import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CollectionSwitcher } from "./CollectionSwitcher";
import { useAppStore } from "@/store/app";

// Radix Select uses a Portal + open-state gate that makes items invisible in JSDOM.
// Replace with simple pass-through components so trash buttons are always in the DOM.
vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: any) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: any) => (
    <button role="combobox" aria-label="Collection" {...props}>{children}</button>
  ),
  SelectValue: ({ placeholder }: any) => <span>{placeholder ?? ""}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value, textValue, ...props }: any) => (
    <div data-value={value} {...props}>{children}</div>
  ),
}));

vi.mock("@/hooks/useApi", () => ({
  useCollections: vi.fn(),
  useDeleteCollection: vi.fn(),
}));

import { useCollections, useDeleteCollection } from "@/hooks/useApi";

const mockDeleteMutate = vi.fn();

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    apiUrl: "http://localhost:8000",
    currentDb: "./remex_db",
    currentCollection: "docs",
  } as any);

  vi.mocked(useCollections).mockReturnValue({
    data: ["docs", "work", "personal"],
    isLoading: false,
    error: null,
  } as any);

  vi.mocked(useDeleteCollection).mockReturnValue({
    mutate: mockDeleteMutate,
    isPending: false,
  } as any);

  mockDeleteMutate.mockReset();
});

describe("CollectionSwitcher", () => {
  it("calls useDeleteCollection with apiUrl and currentDb", () => {
    renderWithProviders(<CollectionSwitcher />);
    expect(useDeleteCollection).toHaveBeenCalledWith("http://localhost:8000", "./remex_db");
  });

  it("renders a delete button for each collection", () => {
    renderWithProviders(<CollectionSwitcher />);
    expect(screen.getByRole("button", { name: /delete collection docs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete collection work/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete collection personal/i })).toBeInTheDocument();
  });

  it("clicking a trash button opens the confirmation dialog with the collection name", () => {
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/delete "work"/i)).toBeInTheDocument();
  });

  it("confirming deletion calls deleteCollection with the correct collection name", () => {
    mockDeleteMutate.mockImplementation((_col: string, { onSuccess }: any = {}) =>
      onSuccess?.()
    );
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(mockDeleteMutate).toHaveBeenCalledWith(
      "work",
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it("deleting the active collection switches currentCollection to the next one", async () => {
    mockDeleteMutate.mockImplementation((_col: string, { onSuccess }: any = {}) =>
      onSuccess?.()
    );
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection docs/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(useAppStore.getState().currentCollection).toBe("work")
    );
  });

  it("deleting the last collection clears currentCollection", async () => {
    vi.mocked(useCollections).mockReturnValue({
      data: ["only"],
      isLoading: false,
      error: null,
    } as any);
    useAppStore.setState({ currentCollection: "only" } as any);
    mockDeleteMutate.mockImplementation((_col: string, { onSuccess }: any = {}) =>
      onSuccess?.()
    );
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection only/i }));
    fireEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() =>
      expect(useAppStore.getState().currentCollection).toBe("")
    );
  });

  it("cancelling the dialog does not call deleteCollection", () => {
    renderWithProviders(<CollectionSwitcher />);
    fireEvent.click(screen.getByRole("button", { name: /delete collection work/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockDeleteMutate).not.toHaveBeenCalled();
  });
});
