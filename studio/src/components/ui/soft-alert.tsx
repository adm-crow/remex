import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type SoftAlertTone = "info" | "warn";

/**
 * Inline info/warning banner used across Query / Settings / Ingest panes for
 * non-blocking messages (e.g. "No clear match", "AI provider is unreachable").
 * Keep tone count small — `warn` is amber, `info` is muted neutral.
 */
export function SoftAlert({
  children,
  tone = "warn",
  className,
  icon: Icon = Info,
}: {
  children: React.ReactNode;
  tone?: SoftAlertTone;
  className?: string;
  icon?: React.ElementType;
}) {
  const toneClasses =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
      : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border px-3 py-2 text-xs",
        toneClasses,
        className,
      )}
      role={tone === "warn" ? "alert" : "status"}
    >
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
