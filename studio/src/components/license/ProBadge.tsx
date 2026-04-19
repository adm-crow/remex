import { cn } from "@/lib/utils";

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
        "bg-primary/15 text-primary border border-primary/25",
        className,
      )}
    >
      Pro
    </span>
  );
}
