export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_VARIANT = {
  ingested: "default"     as const,
  skipped:  "secondary"   as const,
  error:    "destructive" as const,
};
