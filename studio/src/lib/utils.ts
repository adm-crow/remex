import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Extract a human-readable string from anything thrown — Error, string, or other. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Get the file basename from a Windows or POSIX path. Returns the full string if no separator. */
export function basename(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
