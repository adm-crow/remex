import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "sm" | "md";

export function ProBadge({ className, size = "sm" }: { className?: string; size?: Size }) {
  const box  = size === "md" ? "w-5 h-5"     : "w-4 h-4";
  const icon = size === "md" ? "w-3 h-3"     : "w-2.5 h-2.5";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        box,
        "bg-primary/15 border border-primary/25",
        className,
      )}
    >
      <Crown className={cn(icon, "text-primary")} />
    </span>
  );
}
