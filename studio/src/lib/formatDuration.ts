/**
 * Format a duration in milliseconds as a human-readable string.
 * e.g. 800 → "800ms", 45000 → "45s", 125000 → "2min 5s", 120000 → "2min"
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}min` : `${m}min ${rem}s`;
}
