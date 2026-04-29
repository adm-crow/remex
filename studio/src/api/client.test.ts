import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./client";

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

function errResponse(status: number, body = "Error") {
  return Promise.resolve({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });
}

describe("api.getHealth", () => {
  it("calls /health and returns data", async () => {
    mockFetch.mockReturnValue(okJson({ status: "ok", version: "0.2.0" }));
    const result = await api.getHealth("http://localhost:8000");
    expect(mockFetch).toHaveBeenCalledWith("http://127.0.0.1:8000/health");
    expect(result).toEqual({ status: "ok", version: "0.2.0" });
  });
});

describe("api.getCollections", () => {
  it("encodes db_path in query string", async () => {
    mockFetch.mockReturnValue(okJson(["col1", "col2"]));
    await api.getCollections("http://localhost:8000", "./remex_db");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/collections?db_path=.%2Fremex_db"
    );
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockReturnValue(errResponse(404, "Not found"));
    await expect(
      api.getCollections("http://localhost:8000", "./remex_db")
    ).rejects.toThrow("404");
  });
});

describe("api.queryCollection", () => {
  it("sends POST with db_path merged into body", async () => {
    mockFetch.mockReturnValue(okJson([]));
    await api.queryCollection("http://localhost:8000", "./remex_db", "myCol", {
      text: "hello",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/collections/myCol/query",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "hello", db_path: "./remex_db" }),
      })
    );
  });
});

describe("api.purgeCollection", () => {
  it("sends POST to purge endpoint", async () => {
    mockFetch.mockReturnValue(
      okJson({ chunks_deleted: 3, chunks_checked: 10 })
    );
    const result = await api.purgeCollection(
      "http://localhost:8000",
      "./remex_db",
      "myCol"
    );
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/collections/myCol/purge?db_path=.%2Fremex_db",
      expect.objectContaining({ method: "POST" })
    );
    expect(result.chunks_deleted).toBe(3);
  });
});

describe("api.ingestFilesStream", () => {
  it("yields progress and done events from SSE stream", async () => {
    const progressEvent = JSON.stringify({
      type: "progress",
      filename: "a.md",
      files_done: 1,
      files_total: 2,
      status: "ingested",
      chunks_stored: 5,
    });
    const doneEvent = JSON.stringify({
      type: "done",
      result: {
        sources_found: 2,
        sources_ingested: 2,
        sources_skipped: 0,
        chunks_stored: 10,
        skipped_reasons: [],
      },
    });
    const sseBody = `data: ${progressEvent}\n\ndata: ${doneEvent}\n\n`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    mockFetch.mockReturnValue(
      Promise.resolve({ ok: true, body: stream })
    );

    const events = [];
    for await (const event of api.ingestFilesStream(
      "http://localhost:8000",
      "./remex_db",
      "myCol",
      { source_dir: "./docs" }
    )) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("progress");
    expect(events[1].type).toBe("done");
  });
});
