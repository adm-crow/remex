import { useAppStore } from "@/store/app";

const STEPS = [
  "Preparing installer",
  "Installing Python 3.11",
  "Installing remex-cli",
  "Finalising",
];

export function SetupScreen() {
  const setupStep = useAppStore((s) => s.setupStep);
  const setupProgress = useAppStore((s) => s.setupProgress);
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  const setupError = useAppStore((s) => s.setupError);
  const triggerSidecarReconnect = useAppStore((s) => s.triggerSidecarReconnect);

  const isError = sidecarStatus === "setup_error";
  const pct = (setupProgress / STEPS.length) * 100;

  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-6 w-80 text-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 8 16"
          className="w-12 h-12"
          aria-hidden
        >
          <defs>
            <linearGradient id="sg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1CAC78" />
              <stop offset="100%" stopColor="#7EBD01" />
            </linearGradient>
          </defs>
          <path
            d="M0 0Q0 8 8 8 8 0 0 0M0 8q8 0 8 8-8 0-8-8M0 16"
            fill="url(#sg)"
          />
        </svg>

        <div>
          <h1 className="text-lg font-bold">Setting up Remex…</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isError ? setupError : setupStep || "Starting…"}
          </p>
        </div>

        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              isError
                ? "bg-destructive w-full"
                : "bg-gradient-to-r from-[#1CAC78] to-[#7EBD01]"
            }`}
            style={isError ? undefined : { width: `${pct}%` }}
          />
        </div>

        {isError ? (
          <button
            onClick={triggerSidecarReconnect}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        ) : (
          <p className="text-xs text-muted-foreground">
            This only runs once. Requires an internet connection.
          </p>
        )}
      </div>
    </div>
  );
}
