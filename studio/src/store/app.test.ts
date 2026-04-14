import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./app";

beforeEach(() => {
  localStorage.clear();
  useAppStore.setState({
    currentDb: null,
    currentCollection: null,
    recentProjects: [],
    queryHistory: [],
    apiUrl: "http://localhost:8000",
    sidecarStatus: "starting",
    ingestRunning: false,
    ingestProgress: [],
    ingestFilesDone: 0,
    ingestFilesTotal: 0,
    ingestStreamError: null,
    lastIngestResult: null,
  } as any);
});

describe("useAppStore", () => {
  it("setCurrentDb updates currentDb", () => {
    useAppStore.getState().setCurrentDb("./remex_db");
    expect(useAppStore.getState().currentDb).toBe("./remex_db");
  });

  it("setCurrentCollection updates currentCollection", () => {
    useAppStore.getState().setCurrentCollection("myCol");
    expect(useAppStore.getState().currentCollection).toBe("myCol");
  });

  it("addRecentProject prepends a new entry", () => {
    useAppStore.getState().addRecentProject("/path/a");
    expect(useAppStore.getState().recentProjects[0].path).toBe("/path/a");
    expect(useAppStore.getState().recentProjects[0].lastOpened).toBeTruthy();
  });

  it("addRecentProject keeps most recent at index 0 when adding second", () => {
    useAppStore.getState().addRecentProject("/path/a");
    useAppStore.getState().addRecentProject("/path/b");
    expect(useAppStore.getState().recentProjects[0].path).toBe("/path/b");
    expect(useAppStore.getState().recentProjects[1].path).toBe("/path/a");
  });

  it("addRecentProject deduplicates — re-adding moves to front", () => {
    useAppStore.getState().addRecentProject("/path/a");
    useAppStore.getState().addRecentProject("/path/b");
    useAppStore.getState().addRecentProject("/path/a");
    const { recentProjects } = useAppStore.getState();
    expect(recentProjects).toHaveLength(2);
    expect(recentProjects[0].path).toBe("/path/a");
  });

  it("removeRecentProject removes the matching entry", () => {
    useAppStore.getState().addRecentProject("/path/a");
    useAppStore.getState().addRecentProject("/path/b");
    useAppStore.getState().removeRecentProject("/path/a");
    const { recentProjects } = useAppStore.getState();
    expect(recentProjects).toHaveLength(1);
    expect(recentProjects[0].path).toBe("/path/b");
  });

  it("setApiUrl updates apiUrl", () => {
    useAppStore.getState().setApiUrl("http://localhost:9000");
    expect(useAppStore.getState().apiUrl).toBe("http://localhost:9000");
  });

  it("setSidecarStatus updates sidecarStatus", () => {
    useAppStore.getState().setSidecarStatus("connected");
    expect(useAppStore.getState().sidecarStatus).toBe("connected");
  });

  it("addQueryHistory adds an entry", () => {
    useAppStore.getState().addQueryHistory("what is remex");
    expect(useAppStore.getState().queryHistory[0]).toBe("what is remex");
  });

  it("addQueryHistory deduplicates — re-adding moves to front", () => {
    useAppStore.getState().addQueryHistory("first query");
    useAppStore.getState().addQueryHistory("second query");
    useAppStore.getState().addQueryHistory("first query");
    const { queryHistory } = useAppStore.getState();
    expect(queryHistory).toHaveLength(2);
    expect(queryHistory[0]).toBe("first query");
  });

  it("addQueryHistory caps at 20 entries", () => {
    for (let i = 0; i < 25; i++) {
      useAppStore.getState().addQueryHistory(`query ${i}`);
    }
    expect(useAppStore.getState().queryHistory).toHaveLength(20);
  });

  it("removeQueryHistory removes the matching entry", () => {
    useAppStore.getState().addQueryHistory("first");
    useAppStore.getState().addQueryHistory("second");
    useAppStore.getState().removeQueryHistory("first");
    const { queryHistory } = useAppStore.getState();
    expect(queryHistory).toHaveLength(1);
    expect(queryHistory[0]).toBe("second");
  });

  it("clearQueryHistory empties the history", () => {
    useAppStore.getState().addQueryHistory("first");
    useAppStore.getState().addQueryHistory("second");
    useAppStore.getState().clearQueryHistory();
    expect(useAppStore.getState().queryHistory).toHaveLength(0);
  });

  it("resetIngestSession zeroes all session ingest fields", () => {
    useAppStore.setState({
      ingestRunning: true,
      ingestProgress: [{ filename: "a.md", status: "ingested", chunks_stored: 3 }],
      ingestFilesDone: 1,
      ingestFilesTotal: 2,
      ingestStreamError: "oops",
    } as any);
    useAppStore.getState().resetIngestSession();
    const s = useAppStore.getState();
    expect(s.ingestRunning).toBe(false);
    expect(s.ingestProgress).toHaveLength(0);
    expect(s.ingestFilesDone).toBe(0);
    expect(s.ingestFilesTotal).toBe(0);
    expect(s.ingestStreamError).toBeNull();
  });

  it("appendIngestProgress appends items in order", () => {
    useAppStore.getState().appendIngestProgress({ filename: "b.md", status: "skipped", chunks_stored: 0 });
    useAppStore.getState().appendIngestProgress({ filename: "c.md", status: "ingested", chunks_stored: 5 });
    const { ingestProgress } = useAppStore.getState();
    expect(ingestProgress).toHaveLength(2);
    expect(ingestProgress[0].filename).toBe("b.md");
    expect(ingestProgress[1].filename).toBe("c.md");
  });

  it("setLastIngestResult saves the result", () => {
    useAppStore.getState().setLastIngestResult({
      collection:      "docs",
      sourcePath:      "/my/docs",
      completedAt:     "2026-04-14T10:00:00.000Z",
      sourcesFound:    3,
      sourcesIngested: 3,
      sourcesSkipped:  0,
      chunksStored:    12,
    });
    const { lastIngestResult } = useAppStore.getState();
    expect(lastIngestResult?.collection).toBe("docs");
    expect(lastIngestResult?.chunksStored).toBe(12);
  });
});
