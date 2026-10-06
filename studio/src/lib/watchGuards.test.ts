import { describe, it, expect, vi } from "vitest";
import { createCoalescingRunner, isInsideDir } from "./watchGuards";

describe("isInsideDir", () => {
  it("matches the directory itself and its descendants", () => {
    expect(isInsideDir("C:\\proj\\remex_db", "C:\\proj\\remex_db")).toBe(true);
    expect(isInsideDir("C:\\proj\\remex_db\\chroma.sqlite3", "C:\\proj\\remex_db")).toBe(true);
    expect(isInsideDir("/home/u/proj/db/x.bin", "/home/u/proj/db/")).toBe(true);
  });

  it("ignores slash style and case (Windows paths)", () => {
    expect(isInsideDir("c:/Proj/Remex_DB/a/b.bin", "C:\\proj\\remex_db")).toBe(true);
  });

  it("does not match siblings sharing a name prefix", () => {
    expect(isInsideDir("C:\\proj\\remex_db2\\a.txt", "C:\\proj\\remex_db")).toBe(false);
    expect(isInsideDir("C:\\proj\\notes.md", "C:\\proj\\remex_db")).toBe(false);
  });
});

describe("createCoalescingRunner", () => {
  it("never runs two jobs for the same key at once and collapses bursts into one re-run", async () => {
    const run = createCoalescingRunner();
    let release!: () => void;
    const job = vi.fn(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    const first = run("folder", job);
    void run("folder", job); // burst while the first run is in flight…
    void run("folder", job); // …collapses into a single re-run
    expect(job).toHaveBeenCalledTimes(1);

    release();
    await vi.waitFor(() => expect(job).toHaveBeenCalledTimes(2));
    release();
    await first;
    expect(job).toHaveBeenCalledTimes(2);
  });

  it("runs different keys independently", async () => {
    const run = createCoalescingRunner();
    const job = vi.fn(() => Promise.resolve());
    await Promise.all([run("a", job), run("b", job)]);
    expect(job).toHaveBeenCalledTimes(2);
  });

  it("frees the key after a failing job", async () => {
    const run = createCoalescingRunner();
    await expect(run("k", () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    const job = vi.fn(() => Promise.resolve());
    await run("k", job);
    expect(job).toHaveBeenCalledTimes(1);
  });
});
