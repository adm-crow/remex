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

// Replace Radix Select with a plain native <select> so JSDOM can drive it.
// This mock is scoped to this file only — it must not bleed into SQLiteTab.test.tsx.
vi.mock("@/components/ui/select", () => ({
  Select: ({ value, onValueChange, children, disabled }: any) => (
    <select
      role="combobox"
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onValueChange?.(e.target.value)}
      aria-label="Select table"
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: any) => <>{children}</>,
  SelectValue: ({ placeholder }: any) => <option value="" disabled>{placeholder}</option>,
  SelectContent: ({ children }: any) => <>{children}</>,
  SelectItem: ({ value, children }: any) => <option value={value}>{children}</option>,
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

describe("SQLiteTab — cancel / stop-button", () => {
  it("shows Stop button while ingesting and aborts stream on click", async () => {
    let resolveAbort!: (val: unknown) => void;
    const abortPromise = new Promise((res) => { resolveAbort = res; });
    vi.mocked(api.listSqliteTables).mockResolvedValue({ tables: ["posts"] });
    vi.mocked(api.ingestSqliteStream).mockReturnValue(
      (async function* () {
        await abortPromise; // never resolves in this test
      })()
    );

    renderWithProviders(<SQLiteTab />);

    // Set database path and wait for tables to load
    fireEvent.change(
      screen.getByRole("textbox", { name: /sqlite database path/i }),
      { target: { value: "/my/data.db" } }
    );
    await waitFor(() => {
      expect(api.listSqliteTables).toHaveBeenCalled();
    });

    // Select the table using the native select mock
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "posts" } });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run ingest/i })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: /run ingest/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    resolveAbort(undefined);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /stop/i })).not.toBeInTheDocument();
    });
  });
});
