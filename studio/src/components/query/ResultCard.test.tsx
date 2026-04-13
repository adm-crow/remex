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
});
