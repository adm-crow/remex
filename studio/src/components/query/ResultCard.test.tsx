import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ResultCard } from "./ResultCard";
import type { QueryResultItem } from "@/api/client";

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn().mockResolvedValue(undefined),
}));

const baseResult: QueryResultItem = {
  text: "Short text about refund policies.",
  source: "/docs/policy.txt",
  source_type: "file",
  score: 0.91,
  distance: 0.09,
  chunk: 0,
  doc_title: "Policy Guide",
  doc_author: "",
  doc_created: "",
};

describe("ResultCard", () => {
  it("displays score, source, chunk, and doc_title", () => {
    renderWithProviders(<ResultCard result={baseResult} />);
    expect(screen.getByText("0.910")).toBeInTheDocument();
    expect(screen.getByText("/docs/policy.txt")).toBeInTheDocument();
    expect(screen.getByText("#0")).toBeInTheDocument();
    expect(screen.getByText("Policy Guide")).toBeInTheDocument();
  });

  it("shows the text content", () => {
    renderWithProviders(<ResultCard result={baseResult} />);
    expect(screen.getByText(/refund policies/i)).toBeInTheDocument();
  });

  it("truncates long text and shows expand toggle", () => {
    const longResult = {
      ...baseResult,
      text: "A".repeat(400),
    };
    renderWithProviders(<ResultCard result={longResult} />);
    expect(screen.getByText(/show more/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/show more/i));
    expect(screen.getByText(/show less/i)).toBeInTheDocument();
  });

  it("does not show expand toggle for short text", () => {
    renderWithProviders(<ResultCard result={baseResult} />);
    expect(screen.queryByText(/show more/i)).not.toBeInTheDocument();
  });

  it("shows open-file button for non-sqlite sources", () => {
    renderWithProviders(<ResultCard result={baseResult} />);
    expect(screen.getByLabelText(/open source file/i)).toBeInTheDocument();
  });

  it("hides open-file button for sqlite sources", () => {
    renderWithProviders(
      <ResultCard result={{ ...baseResult, source_type: "sqlite" }} />
    );
    expect(screen.queryByLabelText(/open source file/i)).not.toBeInTheDocument();
  });
});
