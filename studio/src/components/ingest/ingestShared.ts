const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

export function formatBytes(bytes: number): string {
  if (bytes < MB) return `${(bytes / KB).toFixed(0)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

export const STATUS_VARIANT = {
  ingested: "default"     as const,
  skipped:  "secondary"   as const,
  error:    "destructive" as const,
};
