/** Guards for the auto-ingest watchers in AppShell. */

function normalizePath(p: string): string {
  // Studio ships on Windows: compare case-insensitively, either slash style.
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** True when `path` is `dir` itself or lives anywhere below it. */
export function isInsideDir(path: string, dir: string): boolean {
  const p = normalizePath(path);
  const d = normalizePath(dir);
  return p === d || p.startsWith(`${d}/`);
}

/**
 * Serialise async jobs per key. While a job for `key` is running, further
 * calls don't start a parallel run — they collapse into a single re-run once
 * it finishes, so watch events arriving faster than an ingest completes never
 * stack up concurrent ingests into the same collection.
 */
export function createCoalescingRunner() {
  const inFlight = new Map<string, { rerun: boolean }>();
  return async function run(key: string, job: () => Promise<void>): Promise<void> {
    const current = inFlight.get(key);
    if (current) {
      current.rerun = true;
      return;
    }
    const entry = { rerun: false };
    inFlight.set(key, entry);
    try {
      do {
        entry.rerun = false;
        await job();
      } while (entry.rerun);
    } finally {
      inFlight.delete(key);
    }
  };
}
