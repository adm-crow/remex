import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import {
  Sun, Moon, Palette, Bot, Eye, EyeOff,
  Server, FolderOpen, ExternalLink, BookOpen, Keyboard, MessageSquarePlus,
  HardDrive, Copy, Check, Package,
  Sliders, Cpu, Trash2, Plus, Eye as Watch, MoreHorizontal,
  Settings as SettingsIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { open } from "@tauri-apps/plugin-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/app";
import type { HomeBg, Theme } from "@/store/app";
import { cn } from "@/lib/utils";
import { WatchFoldersCard } from "./WatchFoldersCard";
import { WatchDatabasesCard } from "./WatchDatabasesCard";
import { SegmentedControl } from "@/components/ui/segmented-control";

type ThemeOpt = { value: Theme; label: string; color: string };

const THEME_OPTIONS: ThemeOpt[] = [
  { value: "default",  label: "Indigo",    color: "#324A83" },
  { value: "violet",   label: "Purple",    color: "#8637BB" },
  { value: "rose",     label: "Pink",      color: "#D420D5" },
  { value: "coral",    label: "Coral",     color: "#F05560" },
  { value: "green",    label: "Green",     color: "#00A461" },
  { value: "yellow",   label: "Yellow",    color: "#ED9400" },
  { value: "lime",     label: "Lime",      color: "#82B900" },
  { value: "slate",    label: "Slate",     color: "#406169" },
  { value: "midnight", label: "Midnight",  color: "#0057C0" },
  { value: "forest",   label: "Forest",    color: "#007700" },
  { value: "ocean",    label: "Ocean",     color: "#0076BA" },
  { value: "sunset",   label: "Sunset",    color: "#C96C00" },
  { value: "rosegold", label: "Rosegold",  color: "#C86556" },
  { value: "teal",     label: "Teal",      color: "#00A586" },
  { value: "amethyst", label: "Amethyst",  color: "#6900EB" },
  { value: "graphite", label: "Graphite",  color: "#6B5550" },
];

const AUTO_PROVIDER = "__auto__";

const AI_PROVIDERS = [
  { value: AUTO_PROVIDER, label: "Auto-detect"    },
  { value: "anthropic",   label: "Anthropic"      },
  { value: "openai",      label: "OpenAI"         },
  { value: "ollama",      label: "Ollama (local)" },
];

const OFFLINE_MODELS = [
  {
    name: "BAAI/bge-base-en-v1.5",
    size: "~86 MB",
    file: "model_optimized.onnx",
    url: "https://huggingface.co/qdrant/bge-base-en-v1.5-onnx-q/resolve/main/model_optimized.onnx",
  },
  {
    name: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    size: "~120 MB",
    file: "model_optimized.onnx",
    url: "https://huggingface.co/qdrant/paraphrase-multilingual-MiniLM-L12-v2-onnx-Q/resolve/main/model_optimized.onnx",
  },
  {
    name: "BAAI/bge-large-en-v1.5",
    size: "~290 MB",
    file: "model_optimized.onnx",
    url: "https://huggingface.co/qdrant/bge-large-en-v1.5-onnx-q/resolve/main/model_optimized.onnx",
  },
  {
    name: "nomic-ai/nomic-embed-text-v1.5-Q",
    size: "~130 MB",
    file: "model_optimized.onnx",
    url: "https://huggingface.co/nomic-ai/nomic-embed-text-v1.5-Q/resolve/main/model_optimized.onnx",
  },
  {
    name: "intfloat/multilingual-e5-large",
    size: "~560 MB",
    file: "model.onnx",
    url: "https://huggingface.co/qdrant/multilingual-e5-large-onnx/resolve/main/model.onnx",
  },
] as const;

type Tab = "general" | "personalization" | "ai" | "watchers" | "references";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "general",         label: "General",         icon: SettingsIcon },
  { id: "personalization", label: "Personalization", icon: Palette      },
  { id: "ai",              label: "AI & Server",     icon: Bot          },
  { id: "watchers",        label: "Auto-ingest",     icon: Watch        },
  { id: "references",      label: "References",      icon: BookOpen     },
];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 space-y-3", className)}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-5 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0">
        <h2 className="font-semibold text-sm leading-none">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function Field({ label, htmlFor, children, className }: {
  label: string; htmlFor?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// One-line summary of the current tab's configured state. Helps users see
// what they have without scanning every card.
function TabStatusHeader({ text }: { text: string }) {
  return (
    <p className="text-xs text-muted-foreground truncate" title={text}>
      {text}
    </p>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
        {children}
      </p>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ─── Provider marks ────────────────────────────────────────────────────────
// Brand logos shipped in /public — referenced by URL so Vite serves them as-is.

function AnthropicLogo() {
  return <img src="/claude.svg" alt="" className="w-5 h-5" aria-hidden="true" />;
}

function OpenAILogo() {
  return <img src="/openai.svg" alt="" className="w-5 h-5" aria-hidden="true" />;
}

function OllamaLogo() {
  return <img src="/ollama.svg" alt="" className="w-5 h-5" aria-hidden="true" />;
}

export function SettingsPane() {
  const {
    apiUrl, setApiUrl,
    currentDb,
    darkMode, setDarkMode,
    darkModeAuto, setDarkModeAuto,
    theme, setTheme,
    homeBg, setHomeBg,
    aiProvider, setAiProvider,
    aiModel, setAiModel,
    aiApiKey, setAiApiKey,
    agentPersonas, activePersonaId, setActivePersonaId,
    addAgentPersona, updateAgentPersona, removeAgentPersona,
    projectDefaults, setProjectDefaults,
    customEmbeddingPresets, addCustomEmbeddingPreset, removeCustomEmbeddingPreset,
    customProviders, activeCustomProviderId,
    addCustomProvider, updateCustomProvider, removeCustomProvider,
    setActiveCustomProviderId, setCustomApiKey,
    customApiKeys,
    setupExtras, setSetupExtras,
    triggerSidecarReconnect,
    setOnboardingDone, setShortcutsOpen,
  } = useAppStore();
  const activePersona = agentPersonas.find((p) => p.id === activePersonaId) ?? null;
  const activeCustomProvider = customProviders.find((p) => p.id === activeCustomProviderId) ?? null;
  const watchFolders = useAppStore((s) => s.watchFolders);
  const watchDatabases = useAppStore((s) => s.watchDatabases);

  // ─── Status header summaries (one-line per tab) ──────────────────────────
  const themeLabel = THEME_OPTIONS.find((t) => t.value === theme)?.label ?? theme;
  const darkLabel = darkModeAuto ? "Auto" : darkMode ? "On" : "Off";
  const bgLabel =
    homeBg === "dotgrid" ? "Dot grid" : homeBg === "aurora" ? "Aurora" : "Network";
  const personalizationStatus =
    `Theme: ${themeLabel} · Dark: ${darkLabel} · Background: ${bgLabel}`;
  const generalStatus =
    setupExtras.length > 0
      ? `Installed extras: ${setupExtras.join(", ")}`
      : "No optional extras installed";

  const providerLabel =
    aiProvider === "custom"
      ? (activeCustomProvider?.name ?? "Custom (none selected)")
      : (!aiProvider
          ? "Auto-detect"
          : AI_PROVIDERS.find((p) => p.value === aiProvider)?.label ?? aiProvider);
  const effectiveModel =
    aiProvider === "custom"
      ? (activeCustomProvider?.defaultModel ?? "")
      : aiModel;
  const personaName = activePersona?.name || "Default";

  const watchersStatus =
    `Watching ${watchFolders.length} folder${watchFolders.length === 1 ? "" : "s"}, ` +
    `${watchDatabases.length} database${watchDatabases.length === 1 ? "" : "s"}`;

  const [localExtras, setLocalExtras] = useState<string[]>(setupExtras);
  const extrasChanged = [...localExtras].sort().join() !== [...setupExtras].sort().join();

  const [tab, setTab] = useState<Tab>("general");
  const [manageTab, setManageTab] = useState<"personas" | "providers" | "embeddings">("personas");
  const [localApiUrl, setLocalApiUrl] = useState(apiUrl);
  const [localModel,        setLocalModel]        = useState(aiModel);
  const [localApiKey,       setLocalApiKey]       = useState(aiApiKey);

  // Sync form fields if store values change externally (e.g. license deactivation reset)
  useEffect(() => { setLocalModel(aiModel); },               [aiModel]);
  useEffect(() => { setLocalApiKey(aiApiKey); },             [aiApiKey]);
  useEffect(() => { setLocalApiUrl(apiUrl); },               [apiUrl]);
  useEffect(() => { setLocalExtras(setupExtras); },          [setupExtras]);
  const [showKey,      setShowKey]      = useState(false);
  const [appVersion,   setAppVersion]   = useState<string>("");
  const [cachePath,    setCachePath]    = useState<string>("");
  const [copiedPath,   setCopiedPath]   = useState(false);
  const [copiedUrl,    setCopiedUrl]    = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
    invoke<string>("get_fastembed_cache_path").then(setCachePath).catch(() => {});
  }, []);

  function handleCopyPath() {
    navigator.clipboard.writeText(cachePath).then(() => {
      setCopiedPath(true);
      setTimeout(() => setCopiedPath(false), 2000);
    });
  }

  function handleCopyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  }

  function handleSaveApi(e: FormEvent) {
    e.preventDefault();
    setApiUrl(localApiUrl.trim() || "http://localhost:8000");
  }

  function handleSaveAi(e: FormEvent) {
    e.preventDefault();
    setAiModel(localModel.trim());
    setAiApiKey(localApiKey.trim());
  }

  function handleAddPersona() {
    const id = crypto.randomUUID();
    addAgentPersona({ id, name: "New persona", systemPrompt: "" });
  }
  function handleDeleteActivePersona() {
    if (activePersona) removeAgentPersona(activePersona.id);
  }

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── Vertical tab rail ────────────────────────────────────────────── */}
      <nav className="shrink-0 w-44 border-r bg-muted/20 flex flex-col">
        <div className="p-2 space-y-0.5 flex-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-pressed={tab === id}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium text-left transition-colors",
                tab === id
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* ── Right column: scrollable content + sticky footer ─────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">

        {/* ── General — install/config + per-project defaults ─────────────── */}
        {tab === "general" && (
          <div className="space-y-3">
            <TabStatusHeader text={generalStatus} />

            <div className="grid grid-cols-2 gap-3 items-start">
              <Card>
                <CardHeader icon={Package} title="Optional packages" subtitle="Requires reinstall — needs internet" />
                <div className="space-y-2">
                  {([
                    { id: "formats",  label: "Extra file formats",       desc: ".pptx, .xlsx, .epub, .html, .odt" },
                    { id: "ai",       label: "AI integrations",          desc: "OpenAI & Anthropic embeddings / generation" },
                    { id: "sentence", label: "Sentence-aware chunking",  desc: "Splits text at sentence boundaries (NLTK)" },
                  ] as const).map(({ id, label, desc }) => (
                    <label key={id} className="flex items-start gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-primary shrink-0"
                        checked={localExtras.includes(id)}
                        onChange={() =>
                          setLocalExtras((prev) =>
                            prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                          )
                        }
                      />
                      <div>
                        <p className="text-xs font-medium group-hover:text-foreground transition-colors">{label}</p>
                        <p className="text-[10px] text-muted-foreground">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {extrasChanged && (
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSetupExtras(localExtras);
                      triggerSidecarReconnect();
                    }}
                  >
                    Apply & reinstall
                  </Button>
                )}
              </Card>

              {/* Project defaults — right column when a project is open. */}
              {currentDb ? (
                <ProjectDefaultsCard
                  currentDb={currentDb}
                  defaults={projectDefaults[currentDb] ?? {}}
                  onChange={(d) => setProjectDefaults(currentDb, d)}
                />
              ) : (
                <Card>
                  <CardHeader icon={Sliders} title="Project defaults" subtitle="Per-project ingest pre-fills" />
                  <p className="text-xs text-muted-foreground">
                    Open a project from the sidebar to set defaults that pre-fill the Ingest pane.
                  </p>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── Personalization — appearance / accent / background ──────────── */}
        {tab === "personalization" && (
          <div className="space-y-3">
            <TabStatusHeader text={personalizationStatus} />

            <div className="grid grid-cols-2 gap-3 items-start">
              <Card>
                <CardHeader icon={Palette} title="Theme" />

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      {darkMode
                        ? <Moon className="w-3.5 h-3.5 text-muted-foreground" />
                        : <Sun  className="w-3.5 h-3.5 text-muted-foreground" />
                      }
                      <Label htmlFor="dark-mode" className="text-sm cursor-pointer">Dark mode</Label>
                    </div>
                    <Switch
                      id="dark-mode"
                      checked={darkMode}
                      onCheckedChange={setDarkMode}
                      disabled={darkModeAuto}
                      aria-label="Dark mode"
                    />
                  </div>

                  <div className="flex items-center justify-between py-0.5">
                    <Label htmlFor="dark-mode-auto" className="text-sm cursor-pointer text-muted-foreground">
                      Follow system
                    </Label>
                    <Switch
                      id="dark-mode-auto"
                      checked={darkModeAuto}
                      onCheckedChange={setDarkModeAuto}
                      aria-label="Follow system dark mode"
                    />
                  </div>
                </div>

                <div className="h-px bg-border" />

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Accent colour</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {THEME_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className={cn(
                          "relative flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border transition-all duration-150",
                          theme === opt.value ? "border-primary bg-accent" : "border-border hover:bg-muted/50"
                        )}
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={theme === opt.value}
                      >
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                        <span className={cn(
                          "text-xs font-medium leading-none",
                          theme === opt.value ? "text-primary" : "text-muted-foreground"
                        )}>
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Homepage background — its own card on the right */}
              <Card>
                <CardHeader icon={Sun} title="Homepage background" subtitle="Pattern shown on the Home pane" />
                <div className="flex gap-2">
                  {(
                    [
                      {
                        id: "dotgrid" as HomeBg,
                        label: "Dot grid",
                        preview: (
                          <div className="absolute inset-0 rounded-md overflow-hidden">
                            <div
                              className="absolute inset-0"
                              style={{
                                backgroundImage: "radial-gradient(circle, oklch(from var(--primary) l c h / 0.6) 1px, transparent 1px)",
                                backgroundSize: "8px 8px",
                              }}
                            />
                            <div
                              className="absolute inset-0"
                              style={{ background: "radial-gradient(ellipse 60% 55% at 50% 50%, oklch(from var(--primary) l c h / 0.15) 0%, transparent 70%)" }}
                            />
                          </div>
                        ),
                      },
                      {
                        id: "aurora" as HomeBg,
                        label: "Aurora",
                        preview: (
                          <div className="absolute inset-0 rounded-md overflow-hidden">
                            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 20% 30%, oklch(from var(--primary) 0.65 0.22 h / 0.55) 0%, transparent 55%)" }} />
                            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 80% 20%, oklch(from var(--primary) 0.62 0.20 calc(h + 50) / 0.45) 0%, transparent 50%)" }} />
                            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 80%, oklch(from var(--primary) 0.60 0.24 calc(h - 40) / 0.40) 0%, transparent 55%)" }} />
                          </div>
                        ),
                      },
                      {
                        id: "network" as HomeBg,
                        label: "Network",
                        preview: (
                          <div className="absolute inset-0 rounded-md overflow-hidden flex items-center justify-center">
                            <svg width="100%" height="100%" viewBox="0 0 56 40" xmlns="http://www.w3.org/2000/svg" className="absolute inset-0">
                              <line x1="8"  y1="10" x2="28" y2="20" stroke="oklch(from var(--primary) l c h / 0.35)" strokeWidth="0.8" />
                              <line x1="28" y1="20" x2="48" y2="8"  stroke="oklch(from var(--primary) l c h / 0.30)" strokeWidth="0.8" />
                              <line x1="28" y1="20" x2="40" y2="34" stroke="oklch(from var(--primary) l c h / 0.28)" strokeWidth="0.8" />
                              <line x1="8"  y1="10" x2="18" y2="32" stroke="oklch(from var(--primary) l c h / 0.22)" strokeWidth="0.8" />
                              <line x1="48" y1="8"  x2="40" y2="34" stroke="oklch(from var(--primary) l c h / 0.25)" strokeWidth="0.8" />
                              <circle cx="8"  cy="10" r="2" fill="oklch(from var(--primary) l c h / 0.55)" />
                              <circle cx="28" cy="20" r="2" fill="oklch(from var(--primary) l c h / 0.55)" />
                              <circle cx="48" cy="8"  r="2" fill="oklch(from var(--primary) l c h / 0.55)" />
                              <circle cx="40" cy="34" r="2" fill="oklch(from var(--primary) l c h / 0.55)" />
                              <circle cx="18" cy="32" r="1.5" fill="oklch(from var(--primary) l c h / 0.45)" />
                            </svg>
                          </div>
                        ),
                      },
                    ] satisfies { id: HomeBg; label: string; preview: React.ReactNode }[]
                  ).map(({ id, label, preview }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setHomeBg(id)}
                      aria-label={label}
                      aria-pressed={homeBg === id}
                      className={cn(
                        "relative flex-1 flex flex-col items-center gap-1.5 pt-1.5 pb-1 rounded-lg border transition-all duration-150",
                        homeBg === id ? "border-primary bg-accent" : "border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="relative w-full h-10 rounded-md overflow-hidden bg-background/60">
                        {preview}
                      </div>
                      <span className={cn(
                        "text-xs font-medium leading-none pb-0.5",
                        homeBg === id ? "text-primary" : "text-muted-foreground"
                      )}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* ── AI & Server ────────────────────────────────────────────────── */}
        {tab === "ai" && (
          <div className="space-y-3">
            {/* Status chips — clicking provider/persona jumps to the right Manage sub-tab */}
            <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
              <span>{providerLabel}</span>
              {effectiveModel && (
                <>
                  <span>·</span>
                  <span>{effectiveModel}</span>
                </>
              )}
              <span>·</span>
              <span>Persona:</span>
              <button
                type="button"
                onClick={() => setManageTab("personas")}
                className="text-foreground/80 hover:text-primary underline-offset-2 hover:underline"
                title="Manage personas"
              >
                {personaName}
              </button>
              {aiProvider === "custom" && (
                <>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => setManageTab("providers")}
                    className="text-foreground/80 hover:text-primary underline-offset-2 hover:underline"
                    title="Manage custom providers"
                  >
                    Edit provider
                  </button>
                </>
              )}
            </div>

            {/* Active configuration — what the app is using right now */}
            <div className="grid grid-cols-2 gap-3 items-start">
              <Card>
                <CardHeader icon={Bot} title="Active AI provider" />
                <form onSubmit={handleSaveAi} className="space-y-2.5">
                  <div className="flex gap-2">
                    <Field label="Provider" htmlFor="ai-provider" className="w-[140px] shrink-0">
                      <Select
                        value={
                          aiProvider === "custom" && activeCustomProviderId
                            ? `custom:${activeCustomProviderId}`
                            : (aiProvider || AUTO_PROVIDER)
                        }
                        onValueChange={(v) => {
                          if (v.startsWith("custom:")) {
                            setAiProvider("custom");
                            setActiveCustomProviderId(v.slice("custom:".length));
                          } else {
                            setAiProvider(v === AUTO_PROVIDER ? "" : v);
                            setActiveCustomProviderId(null);
                          }
                        }}
                      >
                        <SelectTrigger id="ai-provider" aria-label="AI provider" className="w-full h-8 text-sm">
                          <SelectValue placeholder="Auto-detect" />
                        </SelectTrigger>
                        <SelectContent>
                          {AI_PROVIDERS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                          {customProviders.map((p) => (
                            <SelectItem key={p.id} value={`custom:${p.id}`}>{p.name || "(unnamed)"}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Model" htmlFor="ai-model" className="flex-1 min-w-0">
                      <Input
                        id="ai-model"
                        value={localModel}
                        onChange={(e) => setLocalModel(e.target.value)}
                        placeholder="claude-sonnet-4-5 · gpt-4o · llama3"
                        aria-label="AI model"
                        className="font-mono text-xs h-8"
                        disabled={aiProvider === "custom"}
                      />
                    </Field>
                  </div>

                  <Field label="API Key" htmlFor="ai-key">
                    <div className="flex gap-1.5">
                      <Input
                        id="ai-key"
                        type={showKey ? "text" : "password"}
                        value={localApiKey}
                        onChange={(e) => setLocalApiKey(e.target.value)}
                        placeholder="sk-…"
                        className="flex-1 font-mono text-xs h-8"
                        aria-label="AI API key"
                        disabled={aiProvider === "custom"}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-8 p-0 shrink-0"
                        onClick={() => setShowKey((v) => !v)}
                        aria-label={showKey ? "Hide API key" : "Show API key"}
                        disabled={aiProvider === "custom"}
                      >
                        {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                    {aiProvider === "custom" ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Set in <span className="font-medium">Custom providers</span> below — each provider has its own model and API key.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        Stored in your OS keyring (Windows Credential Manager / macOS Keychain / libsecret).
                        Used only by the remex sidecar on your machine.
                      </p>
                    )}
                  </Field>

                  <Button
                    type="submit"
                    size="sm"
                    className="w-full"
                    disabled={aiProvider === "custom"}
                  >
                    Save AI settings
                  </Button>
                </form>
              </Card>

              <Card>
                <CardHeader icon={Server} title="API Server" />
                <form onSubmit={handleSaveApi} className="space-y-3">
                  <Field label="URL" htmlFor="api-url">
                    <Input
                      id="api-url"
                      value={localApiUrl}
                      onChange={(e) => setLocalApiUrl(e.target.value)}
                      placeholder="http://localhost:8000"
                      aria-label="API URL"
                      className="font-mono text-xs h-8"
                    />
                  </Field>
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" className="flex-1">Save</Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => void open(`${localApiUrl || "http://localhost:8000"}/docs`)}
                      aria-label="Open API URL in browser"
                      title="Open in browser"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </form>
              </Card>
            </div>

            {/* Manage section — one editor at a time to avoid scroll */}
            <SectionLabel>Manage</SectionLabel>
            <div className="flex gap-1">
              {([
                { id: "personas",   label: "Personas",          icon: MessageSquarePlus },
                { id: "providers",  label: "Custom providers",  icon: Plug },
                { id: "embeddings", label: "Embedding presets", icon: Cpu },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setManageTab(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                    manageTab === id
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-card border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {manageTab === "personas" && (
              <Card>
                <CardHeader
                  icon={MessageSquarePlus}
                  title="AI personas"
                  subtitle="Save multiple agent prompts and switch from the Query pane"
                />
                <div className="space-y-2.5">
                  {/* Persona picker row + add/delete */}
                  <div className="flex gap-2">
                    <Select
                      value={activePersonaId ?? ""}
                      onValueChange={(v) => setActivePersonaId(v || null)}
                      disabled={agentPersonas.length === 0}
                    >
                      <SelectTrigger className="h-8 text-sm flex-1" aria-label="Active persona">
                        <SelectValue placeholder={agentPersonas.length === 0 ? "No personas yet — click +" : "Select…"} />
                      </SelectTrigger>
                      <SelectContent>
                        {agentPersonas.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name || "(unnamed)"}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="sm" variant="outline" onClick={handleAddPersona} aria-label="Add persona">
                      +
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleDeleteActivePersona}
                      disabled={!activePersona}
                      aria-label="Delete persona"
                    >
                      ✕
                    </Button>
                  </div>

                  {/* Edit fields for the currently-selected persona */}
                  {activePersona ? (
                    <>
                      <Field label="Name" htmlFor="persona-name">
                        <Input
                          id="persona-name"
                          value={activePersona.name}
                          onChange={(e) => updateAgentPersona(activePersona.id, { name: e.target.value })}
                          placeholder="e.g. Researcher"
                          className="h-8 text-sm"
                        />
                      </Field>
                      <Field label="System prompt" htmlFor="persona-prompt">
                        <textarea
                          id="persona-prompt"
                          value={activePersona.systemPrompt}
                          onChange={(e) =>
                            updateAgentPersona(activePersona.id, { systemPrompt: e.target.value })
                          }
                          placeholder={"You are a helpful assistant specialized in…\nAlways answer in French.\nCite your sources."}
                          rows={5}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          aria-label="Agent system prompt"
                        />
                      </Field>
                      <p className="text-xs text-muted-foreground">
                        The active persona is sent on every AI answer in Query. Changes save automatically.
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Personas let you save different agent voices (Researcher, Code Q&amp;A, Summariser…)
                      and switch between them from the Query pane. Click <b>+</b> to add your first.
                    </p>
                  )}
                </div>
              </Card>
            )}

            {manageTab === "providers" && (
              <CustomProvidersCard
                apiUrl={apiUrl}
                providers={customProviders}
                activeProviderId={activeCustomProviderId}
                apiKeys={customApiKeys}
                onAdd={addCustomProvider}
                onUpdate={updateCustomProvider}
                onRemove={removeCustomProvider}
                onSetActive={setActiveCustomProviderId}
                onSetApiKey={setCustomApiKey}
              />
            )}

            {manageTab === "embeddings" && (
              <CustomPresetsCard
                presets={customEmbeddingPresets}
                onAdd={addCustomEmbeddingPreset}
                onRemove={removeCustomEmbeddingPreset}
              />
            )}

          </div>
        )}

        {/* ── Auto-ingest (watch folders + watch databases) ──────────────── */}
        {tab === "watchers" && (
          <div className="space-y-3">
            <TabStatusHeader text={watchersStatus} />
            <div className="grid grid-cols-2 gap-3 items-start">
              <WatchFoldersCard />
              <WatchDatabasesCard />
            </div>
          </div>
        )}

        {/* ── References — provider docs + offline-install guide ──────────── */}
        {tab === "references" && (
          <div className="space-y-3">
            <TabStatusHeader text="Provider documentation and offline-install guide" />

            <div className="grid grid-cols-2 gap-3 items-start">
            <Card>
              <CardHeader
                icon={BookOpen}
                title="Find models"
                subtitle="Browse available models for each provider"
              />
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: "Anthropic", icon: <AnthropicLogo />, desc: "Claude models",  url: "https://docs.anthropic.com/en/docs/about-claude/models/overview" },
                  { label: "OpenAI",    icon: <OpenAILogo />,    desc: "GPT & o-series", url: "https://platform.openai.com/docs/models" },
                  { label: "Ollama",    icon: <OllamaLogo />,    desc: "Local models",   url: "https://ollama.com/library" },
                ] as const).map(({ label, icon, desc, url }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void open(url)}
                    title={label}
                    aria-label={label}
                    className="flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 hover:bg-muted/50 hover:border-border transition-colors border-border bg-muted/20"
                  >
                    <span className="text-foreground/80">{icon}</span>
                    <span className="text-xs font-medium">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{desc}</span>
                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader
                icon={HardDrive}
                title="Offline models"
                subtitle="Manual install for restricted networks"
              />

              <div className="space-y-1 text-xs text-muted-foreground">
                <p>If downloads fail (e.g. corporate network), install manually:</p>
                <ol className="list-decimal list-inside space-y-0.5 pl-1">
                  <li>On a machine with internet, download the file using the URL below</li>
                  <li>On this machine, start an ingest with that model — the error shows the exact destination path</li>
                  <li>Place the downloaded file at that path, then retry</li>
                </ol>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Cache folder</p>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-2 py-1 text-xs font-mono text-foreground/80">
                    {cachePath || "…"}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => cachePath && void open(cachePath)}
                    title="Open in Explorer"
                    aria-label="Open cache folder"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={handleCopyPath}
                    title="Copy path"
                    aria-label="Copy cache folder path"
                  >
                    {copiedPath ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </Button>
                </div>
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Supported models</p>
                <div className="grid grid-cols-2 xl:grid-cols-3 gap-1.5">
                  {OFFLINE_MODELS.map((m) => {
                    const shortName = m.name.includes("/") ? m.name.split("/").pop()! : m.name;
                    return (
                      <div
                        key={m.name}
                        className="flex flex-col gap-1 rounded-md border px-2.5 py-2 bg-muted/20"
                        title={m.name}
                      >
                        <p className="text-[11px] font-mono truncate text-foreground leading-tight">{shortName}</p>
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[10px] text-muted-foreground">{m.size}</p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 shrink-0 text-[10px] gap-1"
                            onClick={() => handleCopyUrl(m.url)}
                            title="Copy download URL"
                            aria-label={`Copy download URL for ${m.name}`}
                          >
                            {copiedUrl === m.url
                              ? <Check className="w-2.5 h-2.5 text-emerald-500" />
                              : <Copy className="w-2.5 h-2.5" />
                            }
                            {copiedUrl === m.url ? "Copied" : "URL"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
            </div>
          </div>
        )}

      </div>

      {/* ── Sticky version footer ────────────────────────────────────────── */}
      <div className="shrink-0 border-t px-4 py-1.5 flex items-center justify-between gap-2 bg-background">
        <p className="text-xs text-muted-foreground shrink-0">
          {appVersion ? `Remex Studio v${appVersion}` : "Remex Studio"}
        </p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              aria-label="More actions"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuItem onSelect={() => setOnboardingDone(false)} aria-label="Show welcome guide">
              <BookOpen />
              Welcome guide
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShortcutsOpen(true)} aria-label="Keyboard shortcuts">
              <Keyboard />
              Shortcuts
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => void open("https://github.com/adm-crow/remex/issues/new/choose")}
              aria-label="Report a bug"
            >
              <MessageSquarePlus />
              Report a bug
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => void open("https://github.com/adm-crow/remex/releases")}
              aria-label="Check for updates"
            >
              <ExternalLink />
              Check for updates
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </div>
    </div>
  );
}

// ─── Project Defaults card ─────────────────────────────────────────────────
import type { ProjectDefaults, CustomEmbeddingPreset, CustomProvider } from "@/store/app";
import { api } from "@/api/client";
import { errMsg } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Loader2, Plug } from "lucide-react";

function ProjectDefaultsCard({
  defaults,
  onChange,
}: {
  currentDb: string;
  defaults: ProjectDefaults;
  onChange: (next: ProjectDefaults) => void;
}) {
  const patch = (delta: Partial<ProjectDefaults>) => onChange({ ...defaults, ...delta });
  const chunking = defaults.chunking ?? "recursive";

  return (
    <Card>
      <CardHeader
        icon={Sliders}
        title="Project defaults"
        subtitle="Pre-fill Ingest fields for this project"
      />
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Ingest</p>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <Field label="Chunk size" htmlFor="pd-chunk-size">
            <Input
              id="pd-chunk-size"
              type="number"
              value={defaults.chunkSize ?? 768}
              onChange={(e) => patch({ chunkSize: Number(e.target.value) || undefined })}
              className="h-8 w-20 text-xs"
            />
          </Field>
          <Field label="Overlap" htmlFor="pd-overlap">
            <Input
              id="pd-overlap"
              type="number"
              value={defaults.overlap ?? 150}
              onChange={(e) => patch({ overlap: Number(e.target.value) || undefined })}
              className="h-8 w-20 text-xs"
            />
          </Field>
          <Field label="Mode">
            <SegmentedControl
              value={chunking}
              onChange={(v) => patch({ chunking: v })}
              ariaLabel="Chunking mode"
              options={[
                { value: "recursive", label: "Recursive" },
                { value: "sentence",  label: "Sentence"  },
                { value: "word",      label: "Word"      },
              ] as const}
            />
          </Field>
          <Field label="Embedding model" htmlFor="pd-embedding-model" className="flex-1 min-w-[180px]">
            <Input
              id="pd-embedding-model"
              value={defaults.embeddingModel ?? "all-MiniLM-L6-v2"}
              onChange={(e) => patch({ embeddingModel: e.target.value })}
              placeholder="all-MiniLM-L6-v2"
              className="h-8 text-xs font-mono"
            />
          </Field>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Query</p>
        <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
          <Field label="Max results" htmlFor="pd-n-results">
            <Input
              id="pd-n-results"
              type="number"
              min={1}
              max={50}
              value={defaults.nResults ?? 5}
              onChange={(e) => patch({ nResults: Number(e.target.value) || undefined })}
              className="h-8 w-20 text-xs"
            />
          </Field>
          <Field label="Min score" htmlFor="pd-min-score">
            <Input
              id="pd-min-score"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={defaults.minScore ?? 0}
              onChange={(e) => patch({ minScore: Number(e.target.value) || undefined })}
              className="h-8 w-20 text-xs"
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

// ─── Custom embedding presets card ─────────────────────────────────────────

function CustomPresetsCard({
  presets,
  onAdd,
  onRemove,
}: {
  presets: CustomEmbeddingPreset[];
  onAdd:    (p: CustomEmbeddingPreset) => void;
  onRemove: (model: string) => void;
}) {
  const [tag,   setTag]   = useState("");
  const [model, setModel] = useState("");

  const canAdd = tag.trim().length > 0 && model.trim().length > 0;

  function handleAdd() {
    if (!canAdd) return;
    onAdd({ tag: tag.trim(), model: model.trim() });
    setTag("");
    setModel("");
  }

  return (
    <Card>
      <CardHeader
        icon={Cpu}
        title="Custom embedding models"
        subtitle="Shows alongside Light / Balanced / Multilingual in the picker"
      />
      <div className="space-y-2">
        {presets.length > 0 && (
          <ul className="space-y-1">
            {presets.map((p) => (
              <li key={p.model} className="flex items-center gap-2">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary shrink-0">
                  {p.tag}
                </span>
                <span className="text-xs font-mono text-muted-foreground flex-1 truncate" title={p.model}>
                  {p.model}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(p.model)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label={`Remove ${p.tag}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid grid-cols-[80px_1fr_auto] gap-1.5 items-center">
          <Input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Tag"
            className="h-7 text-xs"
            aria-label="Preset tag"
          />
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="org/model-name"
            className="h-7 text-xs font-mono"
            aria-label="Preset model"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <Button size="sm" variant="outline" onClick={handleAdd} disabled={!canAdd} aria-label="Add preset">
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ─── Custom OpenAI-compatible Providers card ───────────────────────────────

function CustomProvidersCard({
  apiUrl,
  providers,
  activeProviderId,
  apiKeys,
  onAdd,
  onUpdate,
  onRemove,
  onSetActive,
  onSetApiKey,
}: {
  apiUrl:           string;
  providers:        CustomProvider[];
  activeProviderId: string | null;
  apiKeys:          Record<string, string>;
  onAdd:            (p: CustomProvider) => void;
  onUpdate:         (id: string, patch: Partial<Omit<CustomProvider, "id">>) => void;
  onRemove:         (id: string) => void;
  onSetActive:      (id: string | null) => void;
  onSetApiKey:      (id: string, key: string) => void;
}) {
  // Which provider is being edited in the form — independent of which one is
  // the project-wide "active" choice, so users can edit a non-active provider
  // without flipping their active selection.
  const [editId, setEditId] = useState<string | null>(
    activeProviderId ?? providers[0]?.id ?? null
  );
  const editing = providers.find((p) => p.id === editId) ?? null;

  const [showKey,    setShowKey]    = useState(false);
  const [testStatus, setTestStatus] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ok"; models: string[] }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function handleAdd() {
    const id = crypto.randomUUID();
    onAdd({
      id,
      name:         "New provider",
      baseUrl:      "",
      headerName:   "Authorization",
      headerPrefix: "Bearer ",
    });
    setEditId(id);
    setTestStatus({ kind: "idle" });
  }

  function handleDelete() {
    if (!editing) return;
    onRemove(editing.id);
    const remaining = providers.filter((p) => p.id !== editing.id);
    setEditId(remaining[0]?.id ?? null);
    setTestStatus({ kind: "idle" });
  }

  async function handleTest() {
    if (!editing) return;
    if (!editing.baseUrl.trim()) {
      setTestStatus({ kind: "error", message: "Base URL is required." });
      return;
    }
    setTestStatus({ kind: "loading" });
    try {
      const resp = await api.testCustomProvider(apiUrl, {
        base_url:      editing.baseUrl.trim(),
        api_key:       apiKeys[editing.id] || undefined,
        header_name:   editing.headerName,
        header_prefix: editing.headerPrefix,
      });
      setTestStatus({ kind: "ok", models: resp.models });
      // If the user hasn't picked a default model yet and the endpoint
      // returned at least one, populate it automatically.
      if (!editing.defaultModel && resp.models.length > 0) {
        onUpdate(editing.id, { defaultModel: resp.models[0] });
      }
    } catch (e) {
      setTestStatus({ kind: "error", message: errMsg(e) });
    }
  }

  return (
    <Card>
      <CardHeader
        icon={Plug}
        title="Custom providers"
        subtitle="Point Remex at any OpenAI-Chat-Completions-compatible endpoint"
      />
      <div className="space-y-2.5">
        {/* Picker row + add/delete */}
        <div className="flex gap-2">
          <Select
            value={editId ?? ""}
            onValueChange={(v) => { setEditId(v || null); setTestStatus({ kind: "idle" }); }}
            disabled={providers.length === 0}
          >
            <SelectTrigger className="h-8 text-sm flex-1" aria-label="Edit custom provider">
              <SelectValue placeholder={providers.length === 0 ? "No providers yet — click +" : "Select…"} />
            </SelectTrigger>
            <SelectContent>
              {providers.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name || "(unnamed)"}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" variant="outline" onClick={handleAdd} aria-label="Add custom provider">+</Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={!editing}
            aria-label="Delete custom provider"
          >
            ✕
          </Button>
        </div>

        {/* Edit form for the selected provider */}
        {editing ? (
          <>
            <Field label="Name" htmlFor="cp-name">
              <Input
                id="cp-name"
                value={editing.name}
                onChange={(e) => onUpdate(editing.id, { name: e.target.value })}
                placeholder="Acme Corp Gateway"
                className="h-8 text-sm"
              />
            </Field>
            <Field label="Base URL" htmlFor="cp-base-url">
              <Input
                id="cp-base-url"
                value={editing.baseUrl}
                onChange={(e) => onUpdate(editing.id, { baseUrl: e.target.value })}
                placeholder="https://ai.acme.corp/v1"
                className="h-8 text-sm font-mono"
              />
            </Field>
            <Field label="API key" htmlFor="cp-api-key">
              <div className="flex gap-1.5">
                <Input
                  id="cp-api-key"
                  type={showKey ? "text" : "password"}
                  value={apiKeys[editing.id] ?? ""}
                  onChange={(e) => onSetApiKey(editing.id, e.target.value)}
                  placeholder="Stored in your OS keyring — persists across launches"
                  className="flex-1 font-mono text-xs h-8"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0 shrink-0"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </Button>
              </div>
            </Field>

            {/* Advanced: header name + prefix */}
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground select-none">Advanced header config</summary>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="Header name" htmlFor="cp-header-name">
                  <Input
                    id="cp-header-name"
                    value={editing.headerName}
                    onChange={(e) => onUpdate(editing.id, { headerName: e.target.value })}
                    placeholder="Authorization"
                    className="h-7 text-xs font-mono"
                  />
                </Field>
                <Field label="Header prefix" htmlFor="cp-header-prefix">
                  <Input
                    id="cp-header-prefix"
                    value={editing.headerPrefix}
                    onChange={(e) => onUpdate(editing.id, { headerPrefix: e.target.value })}
                    placeholder="Bearer "
                    className="h-7 text-xs font-mono"
                  />
                </Field>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Default sends <code>Authorization: Bearer &lt;key&gt;</code>. Set to e.g. <code>api-key</code> + empty prefix for Azure OpenAI.
              </p>
            </details>

            {/* Default model — populated by Test Connection or typed by hand */}
            <Field label="Default model" htmlFor="cp-default-model">
              {testStatus.kind === "ok" && testStatus.models.length > 0 ? (
                <Select
                  value={editing.defaultModel ?? ""}
                  onValueChange={(v) => onUpdate(editing.id, { defaultModel: v })}
                >
                  <SelectTrigger id="cp-default-model" className="h-8 text-sm" aria-label="Default model">
                    <SelectValue placeholder="Pick a discovered model…" />
                  </SelectTrigger>
                  <SelectContent>
                    {testStatus.models.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id="cp-default-model"
                  value={editing.defaultModel ?? ""}
                  onChange={(e) => onUpdate(editing.id, { defaultModel: e.target.value })}
                  placeholder="gpt-4-acme"
                  className="h-8 text-sm font-mono"
                />
              )}
            </Field>

            {/* Test connection */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleTest()}
                disabled={testStatus.kind === "loading"}
              >
                {testStatus.kind === "loading"
                  ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Testing…</>
                  : "Test connection"}
              </Button>
              {testStatus.kind === "ok" && (
                <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {testStatus.models.length} model{testStatus.models.length !== 1 ? "s" : ""} discovered
                </span>
              )}
              {testStatus.kind === "error" && (
                <span className="flex items-center gap-1 text-xs text-destructive truncate" title={testStatus.message}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {testStatus.message}
                </span>
              )}
            </div>

            {/* "Use this provider" — sets it as the global active provider */}
            <Button
              type="button"
              size="sm"
              className="w-full"
              variant={activeProviderId === editing.id ? "default" : "outline"}
              onClick={() => onSetActive(editing.id)}
              disabled={activeProviderId === editing.id}
            >
              {activeProviderId === editing.id ? "Active provider" : "Use this provider"}
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Add an OpenAI-Chat-Completions-compatible endpoint (corporate AI gateway,
            Azure OpenAI, LiteLLM proxy, vLLM, etc.). API keys are kept in memory
            only — never written to disk.
          </p>
        )}
      </div>
    </Card>
  );
}
