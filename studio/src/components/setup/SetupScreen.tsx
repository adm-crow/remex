import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/app";
import { parseUrl } from "@/hooks/useSidecar";

const STEPS = [
  "Preparing installer",
  "Installing Python 3.13",
  "Installing remex-cli",
  "Finalising",
];

const EXTRAS_OPTIONS = [
  {
    id: "formats",
    label: "Extra file formats",
    description: "Read .pptx, .xlsx, .epub files (python-pptx, openpyxl, ebooklib)",
  },
  {
    id: "ai",
    label: "AI integrations",
    description: "OpenAI & Anthropic embedding / generation support",
  },
  {
    id: "sentence",
    label: "Sentence-aware chunking",
    description: "Splits text at sentence boundaries (requires NLTK download on first use)",
  },
];

function Logo() {
  return (
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
  );
}

export function SetupScreen() {
  const apiUrl = useAppStore((s) => s.apiUrl);
  const setupStep = useAppStore((s) => s.setupStep);
  const setupProgress = useAppStore((s) => s.setupProgress);
  const sidecarStatus = useAppStore((s) => s.sidecarStatus);
  const setupError = useAppStore((s) => s.setupError);
  const setupExtras = useAppStore((s) => s.setupExtras);
  const setSetupExtras = useAppStore((s) => s.setSetupExtras);
  const setupLogLines = useAppStore((s) => s.setupLogLines);
  const triggerSidecarReconnect = useAppStore((s) => s.triggerSidecarReconnect);

  const [selectedExtras, setSelectedExtras] = useState<string[]>(setupExtras);
  const [installing, setInstalling] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Start elapsed timer when installation begins
  useEffect(() => {
    if (sidecarStatus === "setup") {
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }
      const id = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current!) / 1000));
      }, 1000);
      return () => clearInterval(id);
    } else {
      startTimeRef.current = null;
      setElapsed(0);
    }
  }, [sidecarStatus]);

  // Auto-scroll log tail
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [setupLogLines]);

  function toggleExtra(id: string) {
    setSelectedExtras((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleInstall() {
    setInstalling(true);
    const { host, port } = parseUrl(apiUrl);
    try {
      await invoke("spawn_sidecar", { host, port, extras: selectedExtras });
      // Persist the extras selection and trigger reconnect in one batch so the
      // useSidecar effect only re-runs once — after the install is done and the
      // server is healthy. Calling setSetupExtras before the invoke would cause
      // an early effect re-run that races check_needs_setup against setup://started
      // and can wipe the progress bar.
      setSetupExtras(selectedExtras);
      triggerSidecarReconnect();
    } catch {
      // setup://error event handles the error UI; just re-enable the button.
      setInstalling(false);
    }
  }

  function formatElapsed(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  const pct = (setupProgress / STEPS.length) * 100;

  // ── starting ──────────────────────────────────────────────────────────────
  if (sidecarStatus === "starting") {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Starting…</p>
        </div>
      </div>
    );
  }

  // ── extras selection ──────────────────────────────────────────────────────
  if (sidecarStatus === "setup_config") {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-start gap-6 w-96">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <h1 className="text-lg font-bold">Install Remex</h1>
              <p className="text-sm text-muted-foreground">First-time setup — requires internet</p>
            </div>
          </div>

          <div className="w-full flex flex-col gap-3">
            <p className="text-sm font-medium">Optional packages</p>
            {EXTRAS_OPTIONS.map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={selectedExtras.includes(opt.id)}
                  onChange={() => toggleExtra(opt.id)}
                />
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>

          <button
            onClick={handleInstall}
            disabled={installing}
            className="w-full py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {installing ? "Starting…" : "Install"}
          </button>
        </div>
      </div>
    );
  }

  // ── setup_error ───────────────────────────────────────────────────────────
  if (sidecarStatus === "setup_error") {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="flex flex-col items-center gap-6 w-96 text-center">
          <Logo />
          <div>
            <h1 className="text-lg font-bold text-destructive">Installation failed</h1>
            <p className="text-sm text-muted-foreground mt-1 break-words">{setupError}</p>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full w-full rounded-full bg-destructive" />
          </div>
          {setupLogLines.length > 0 && (
            <div className="w-full max-h-40 overflow-y-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-muted-foreground space-y-0.5">
              {setupLogLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
          <button
            onClick={triggerSidecarReconnect}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── setup (installing) ────────────────────────────────────────────────────
  return (
    <div className="flex items-center justify-center h-screen bg-background">
      <div className="flex flex-col items-center gap-6 w-96 text-center">
        <Logo />

        <div>
          <h1 className="text-lg font-bold">Setting up Remex…</h1>
          <p className="text-sm text-muted-foreground mt-1">{setupStep || "Starting…"}</p>
        </div>

        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full animate-progress-shimmer transition-all duration-500"
            style={{ width: `${Math.max(pct, 8)}%` }}
          />
        </div>

        <div className="w-full flex justify-between text-xs text-muted-foreground">
          <span>Step {setupProgress} / {STEPS.length}</span>
          {elapsed > 0 && <span>Elapsed: {formatElapsed(elapsed)}</span>}
        </div>

        {setupLogLines.length > 0 && (
          <div className="w-full max-h-48 overflow-y-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-muted-foreground space-y-0.5">
            {setupLogLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div ref={logEndRef} />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          This only runs once. Requires an internet connection.
        </p>
      </div>
    </div>
  );
}
