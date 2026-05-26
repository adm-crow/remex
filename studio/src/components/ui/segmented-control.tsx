import { cn } from "@/lib/utils";

interface SegmentedControlOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/**
 * Horizontal segmented control — single-select pill row. Replaces the
 * `flex rounded-md border overflow-hidden` + per-button bg-primary/text-muted
 * pattern that was reimplemented inline across Settings, FilesTab, and SQLiteTab.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
  ariaLabel,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly SegmentedControlOption<T>[];
  className?: string;
  size?: "sm" | "default";
  ariaLabel?: string;
}) {
  const sizeClass = size === "sm" ? "h-7 text-[11px]" : "h-8 text-xs";
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "flex rounded-md border overflow-hidden w-fit",
        sizeClass,
        className,
      )}
    >
      {options.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "px-2.5 transition-colors",
            value === v
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-accent",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
