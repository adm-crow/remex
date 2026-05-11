import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { SQLiteTab } from "./SQLiteTab";
import { useAppStore } from "@/store/app";

vi.mock("@/api/client", () => ({
  api: {
    listSqliteTables: vi.fn(),
    ingestSqlite: vi.fn(),
    ingestSqliteStream: vi.fn(),
  },
}));

import { api } from "@/api/client";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
  } as any);
  vi.clearAllMocks();
});

describe("SQLiteTab", () => {
  it("renders database path input, browse button, and disabled run button", () => {
    renderWithProviders(<SQLiteTab />);
    expect(screen.getByRole("textbox", { name: /sqlite database path/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /browse/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run ingest/i })).toBeDisabled();
  });

  it("loads tables when path is entered", async () => {
    vi.mocked(api.listSqliteTables).mockResolvedValue({ tables: ["posts", "users"] });
    renderWithProviders(<SQLiteTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /sqlite database path/i }),
      { target: { value: "/my/data.db" } }
    );
    await waitFor(() => {
      expect(api.listSqliteTables).toHaveBeenCalledWith("http://localhost:8000", "/my/data.db");
    });
  });

  it("shows inline error when tables cannot be loaded", async () => {
    vi.mocked(api.listSqliteTables).mockRejectedValue(new Error("400: Cannot read SQLite file"));
    renderWithProviders(<SQLiteTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /sqlite database path/i }),
      { target: { value: "/bad/file.db" } }
    );
    await waitFor(() => {
      expect(screen.getByText(/400: Cannot read SQLite file/i)).toBeInTheDocument();
    });
  });

  it("run button stays disabled until a table is selected", async () => {
    vi.mocked(api.listSqliteTables).mockResolvedValue({ tables: ["logs"] });
    renderWithProviders(<SQLiteTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /sqlite database path/i }),
      { target: { value: "/my/data.db" } }
    );
    await waitFor(() => {
      expect(api.listSqliteTables).toHaveBeenCalled();
    });
    // Tables are loaded but none selected yet — run button must stay disabled.
    expect(screen.getByRole("button", { name: /run ingest/i })).toBeDisabled();
  });

  it("incremental toggle is visible without opening Advanced", () => {
    renderWithProviders(<SQLiteTab />);
    expect(screen.getByRole("switch", { name: /incremental/i })).toBeInTheDocument();
  });

  it("embedding model segmented control is visible without opening Advanced", () => {
    renderWithProviders(<SQLiteTab />);
    expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
  });
});
