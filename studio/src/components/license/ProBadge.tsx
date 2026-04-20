import { Crown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center w-4 h-4 rounded-full",
        "bg-primary/15 border border-primary/25",
        className,
      )}
    >
      <Crown className="w-2.5 h-2.5 text-primary" />
    </span>
  );
}
