import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ResultCard } from "./ResultCard";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

import { open } from "@tauri-apps/plugin-shell";

const mockResult = {
  text: "Sample chunk text about the document content",
  source: "/docs/a.md",
  source_type: "file",
  score: 0.9,
  distance: 0.1,
  chunk: 2,
  doc_title: "Doc A",
  doc_author: "",
  doc_created: "",
};

const longText = "A".repeat(400);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResultCard", () => {
  it("renders score, source path, and excerpt", () => {
    renderWithProviders(<ResultCard result={mockResult} />);
    expect(screen.getByText("0.900")).toBeInTheDocument();
    expect(screen.getByText("/docs/a.md")).toBeInTheDocument();
    expect(screen.getByText(/Sample chunk text/)).toBeInTheDocument();
  });

  it("renders the open-file button with correct aria-label", () => {
    renderWithProviders(<ResultCard result={mockResult} />);
    expect(
      screen.getByRole("button", { name: /open source file/i })
    ).toBeInTheDocument();
  });

  it("clicking the button calls open() with the source path", () => {
    renderWithProviders(<ResultCard result={mockResult} />);
    fireEvent.click(screen.getByRole("button", { name: /open source file/i }));
    expect(vi.mocked(open)).toHaveBeenCalledWith("/docs/a.md");
  });

  it("does not show toggle when text is 300 chars or fewer", () => {
    renderWithProviders(<ResultCard result={mockResult} />);
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument();
  });

  it("shows truncated text and 'Show more' button when text exceeds 300 chars", () => {
    renderWithProviders(<ResultCard result={{ ...mockResult, text: longText }} />);
    expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show less/i })).not.toBeInTheDocument();
    // Only first 300 chars rendered — the full 400-char string should not be present
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
  });

  it("clicking 'Show more' reveals full text and shows 'Show less' button", () => {
    renderWithProviders(<ResultCard result={{ ...mockResult, text: longText }} />);
    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    expect(screen.getByText(longText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show less/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  it("clicking 'Show less' collapses back to truncated text", () => {
    renderWithProviders(<ResultCard result={{ ...mockResult, text: longText }} />);
    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    fireEvent.click(screen.getByRole("button", { name: /show less/i }));
    expect(screen.queryByText(longText)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
  });
});
