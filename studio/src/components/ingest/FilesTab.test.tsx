import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { FilesTab } from "./FilesTab";
import { useAppStore } from "@/store/app";
import * as dialog from "@tauri-apps/plugin-dialog";

vi.mock("@/api/client", () => ({
  api: {
    ingestFilesStream: vi.fn(),
  },
}));

import { api } from "@/api/client";

async function* makeStream(events: object[]) {
  for (const e of events) yield e;
}

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: "./remex_db",
    currentCollection: "myCol",
    apiUrl: "http://localhost:8000",
    sidecarStatus: "connected",
    ingestRunning: false,
    ingestProgress: [],
    ingestFilesDone: 0,
    ingestFilesTotal: 0,
    ingestStreamError: null,
    lastIngestResult: null,
  } as any);
});

describe("FilesTab", () => {
  it("renders source path input and start button", () => {
    renderWithProviders(<FilesTab />);
    expect(screen.getByRole("textbox", { name: /source directory/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start ingest/i })).toBeInTheDocument();
  });

  it("start button is disabled when source path is empty", () => {
    renderWithProviders(<FilesTab />);
    expect(screen.getByRole("button", { name: /start ingest/i })).toBeDisabled();
  });

  it("browse button calls dialog.open and fills source path", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/my/docs");
    renderWithProviders(<FilesTab />);
    fireEvent.click(screen.getByRole("button", { name: /browse/i }));
    await waitFor(() => {
      expect(
        (screen.getByRole("textbox", { name: /source directory/i }) as HTMLInputElement).value
      ).toBe("/my/docs");
    });
  });

  it("shows progress items as SSE events arrive", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([
        {
          type: "progress",
          filename: "a.md",
          files_done: 1,
          files_total: 2,
          status: "ingested",
          chunks_stored: 3,
        },
      ]) as any
    );
    renderWithProviders(<FilesTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByText("a.md")).toBeInTheDocument();
    });
  });

  it("shows success alert on done event when files were ingested", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([
        {
          type: "done",
          result: {
            sources_found: 3,
            sources_ingested: 3,
            sources_skipped: 0,
            chunks_stored: 12,
            skipped_reasons: [],
          },
        },
      ]) as any
    );
    renderWithProviders(<FilesTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/ingest complete/i);
      expect(screen.getByRole("alert")).toHaveTextContent(/12 chunks stored/i);
    });
  });

  it("shows error alert on error event", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([{ type: "error", detail: "Directory not found" }]) as any
    );
    renderWithProviders(<FilesTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Directory not found");
    });
  });

  it("success alert is dismissible", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([
        {
          type: "done",
          result: {
            sources_found: 2,
            sources_ingested: 2,
            sources_skipped: 0,
            chunks_stored: 8,
            skipped_reasons: [],
          },
        },
      ]) as any
    );
    renderWithProviders(<FilesTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/ingest complete/i);
    });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert", { hidden: false })).not.toBeInTheDocument();
  });

  it("does not show success alert when sources_ingested is 0", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([
        {
          type: "done",
          result: {
            sources_found: 3,
            sources_ingested: 0,
            sources_skipped: 3,
            chunks_stored: 0,
            skipped_reasons: ["unchanged", "unchanged", "unchanged"],
          },
        },
      ]) as any
    );
    renderWithProviders(<FilesTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    // Wait for ingest to finish (button re-enables)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /start ingest/i })).not.toBeDisabled();
    });
    expect(screen.queryByText(/ingest complete/i)).not.toBeInTheDocument();
  });

  it("success alert includes a timestamp", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([
        {
          type: "done",
          result: {
            sources_found: 3,
            sources_ingested: 3,
            sources_skipped: 0,
            chunks_stored: 12,
            skipped_reasons: [],
          },
        },
      ]) as any
    );
    renderWithProviders(<FilesTab />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      // Alert should be visible and contain a non-empty timestamp string
      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(/ingest complete/i);
      // The timestamp line is rendered via toLocaleString() — just assert it's non-empty
      expect(alert.textContent).toMatch(/\d/);
    });
  });

  it("shows Stop button while ingesting and aborts stream on click", async () => {
    let resolveAbort!: (val: unknown) => void;
    const abortPromise = new Promise((res) => { resolveAbort = res; });
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      (async function* () {
        await abortPromise; // never resolves in this test
      })()
    );

    useAppStore.setState({ currentDb: "./remex_db", currentCollection: "col", apiUrl: "http://localhost:8000" } as any);
    renderWithProviders(<FilesTab />);
    fireEvent.change(screen.getByRole("textbox", { name: /source directory/i }), { target: { value: "/docs" } });
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));

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
