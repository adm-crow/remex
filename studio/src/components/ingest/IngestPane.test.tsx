import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { IngestPane } from "./IngestPane";
import { useAppStore } from "@/store/app";

vi.mock("@/api/client", () => ({ api: { ingestFilesStream: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
});

describe("IngestPane", () => {
  it("shows Files tab by default", () => {
    renderWithProviders(<IngestPane />);
    expect(screen.getByRole("textbox", { name: /source directory/i })).toBeInTheDocument();
  });

  it("switches to SQLite tab on click", () => {
    renderWithProviders(<IngestPane />);
    fireEvent.click(screen.getByText("SQLite"));
    expect(screen.getByRole("textbox", { name: /sqlite database path/i })).toBeInTheDocument();
  });
});
