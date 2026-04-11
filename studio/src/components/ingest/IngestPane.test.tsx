import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { IngestPane } from "./IngestPane";
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
  } as any);
});

describe("IngestPane", () => {
  it("renders source path input and start button", () => {
    renderWithProviders(<IngestPane />);
    expect(
      screen.getByRole("textbox", { name: /source directory/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start ingest/i })
    ).toBeInTheDocument();
  });

  it("start button is disabled when source path is empty", () => {
    renderWithProviders(<IngestPane />);
    expect(screen.getByRole("button", { name: /start ingest/i })).toBeDisabled();
  });

  it("browse button calls dialog.open and fills source path", async () => {
    vi.mocked(dialog.open).mockResolvedValue("/my/docs");
    renderWithProviders(<IngestPane />);
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
    renderWithProviders(<IngestPane />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByText("a.md")).toBeInTheDocument();
      expect(screen.getByText("ingested")).toBeInTheDocument();
    });
  });

  it("shows summary card on done event", async () => {
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
    renderWithProviders(<IngestPane />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByText(/chunks stored: 12/i)).toBeInTheDocument();
    });
  });

  it("shows error card on error event", async () => {
    vi.mocked(api.ingestFilesStream).mockReturnValue(
      makeStream([{ type: "error", detail: "Directory not found" }]) as any
    );
    renderWithProviders(<IngestPane />);
    fireEvent.change(
      screen.getByRole("textbox", { name: /source directory/i }),
      { target: { value: "/my/docs" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Directory not found"
      );
    });
  });
});
