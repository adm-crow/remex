import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Sun, Moon, Palette, Bot, Eye, EyeOff,
  Server, FolderOpen, ChevronRight, ExternalLink, BookOpen, Keyboard, MessageSquarePlus,
} from "lucide-react";
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
import { useAppStore, useIsPro } from "@/store/app";
import type { HomeBg, Theme } from "@/store/app";
import { cn } from "@/lib/utils";
import { LicenseCard } from "@/components/license/LicenseCard";
import { ProBadge } from "@/components/license/ProBadge";
import { WatchFoldersCard } from "./WatchFoldersCard";

type ThemeOpt = { value: Theme; label: string; color: string; pro?: boolean };

const THEME_OPTIONS: ThemeOpt[] = [
  { value: "default", label: "Indigo",  color: "#4050A8" },
  { value: "violet",  label: "Purple",  color: "#8535B0" },
  { value: "rose",    label: "Pink",    color: "#D030B5" },
  { value: "coral",   label: "Coral",   color: "#DC6C40" },
  { value: "green",   label: "Green",   color: "#1CAC78" },
  { value: "yellow",  label: "Yellow",  color: "#EAAD04" },
  { value: "lime",    label: "Lime",    color: "#7EBD01" },
  { value: "slate",   label: "Slate",   color: "#516572" },
  { value: "midnight", label: "Midnight", color: "#323C97", pro: true },
  { value: "forest",   label: "Forest",   color: "#297A53", pro: true },
  { value: "ocean",    label: "Ocean",    color: "#046D9E", pro: true },
  { value: "sunset",   label: "Sunset",   color: "#E26327", pro: true },
  { value: "rosegold", label: "Rosegold", color: "#C64B70", pro: true },
  { value: "teal",     label: "Teal",     color: "#0D8F8E", pro: true },
  { value: "amethyst", label: "Amethyst", color: "#7B2EC4", pro: true },
  { value: "graphite", label: "Graphite", color: "#52575F", pro: true },
];

const AUTO_PROVIDER = "__auto__";

const AI_PROVIDERS = [
  { value: AUTO_PROVIDER, label: "Auto-detect"    },
  { value: "anthropic",   label: "Anthropic"      },
  { value: "openai",      label: "OpenAI"         },
  { value: "ollama",      label: "Ollama (local)" },
];

type Tab = "appearance" | "ai" | "license";

const TABS: { id: Tab; label: string }[] = [
  { id: "appearance", label: "General"     },
  { id: "ai",         label: "AI & Server" },
  { id: "license",    label: "License"     },
];

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card p-3 space-y-2.5", className)}>
      {children}
    </div>
  );
}

function CardHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="size-5 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-3 h-3 text-muted-foreground" />
      </div>
      <h2 className="font-semibold text-sm">{title}</h2>
    </div>
  );
}

function Field({ label, htmlFor, children }: {
  label: string; htmlFor?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function SettingsPane() {
  const {
    apiUrl, setApiUrl,
    setCurrentDb, setCurrentCollection,
    darkMode, setDarkMode,
    theme, setTheme,
    homeBg, setHomeBg,
    aiProvider, setAiProvider,
    aiModel, setAiModel,
    aiApiKey, setAiApiKey,
    setOnboardingDone,
    setShortcutsOpen,
  } = useAppStore();

  const isPro = useIsPro();
  const openUpgradeModal = useAppStore((s) => s.openUpgradeModal);

  const licensePromptSeq = useAppStore((s) => s.licensePromptSeq);

  const [tab, setTab] = useState<Tab>("appearance");
  const [localApiUrl, setLocalApiUrl] = useState(apiUrl);

  useEffect(() => {
    if (licensePromptSeq === 0) return;
    setTab("license");
  }, [licensePromptSeq]);
  const [localModel,  setLocalModel]  = useState(aiModel);
  const [localApiKey, setLocalApiKey] = useState(aiApiKey);
  const [showKey,     setShowKey]     = useState(false);
  const [appVersion,  setAppVersion]  = useState<string>("");

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
  }, []);

  function handleSaveApi(e: FormEvent) {
    e.preventDefault();
    setApiUrl(localApiUrl.trim() || "http://localhost:8000");
  }

  function handleSaveAi(e: FormEvent) {
    e.preventDefault();
    setAiModel(localModel.trim());
    setAiApiKey(localApiKey.trim());
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b px-4 flex gap-0">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">

        {/* ── General ────────────────────────────────────────────────────── */}
        {tab === "appearance" && (
          <div className="grid grid-cols-2 gap-3 items-start">
            {/* Left — Appearance */}
            <Card>
              <CardHeader icon={Palette} title="Appearance" />

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
                  aria-label="Dark mode"
                />
              </div>

              <div className="h-px bg-border" />

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Accent colour</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {THEME_OPTIONS.map((opt) => {
                    const locked = opt.pro && !isPro;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          if (locked) { openUpgradeModal("theme"); return; }
                          setTheme(opt.value);
                        }}
                        className={cn(
                          "relative flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border transition-all duration-150",
                          theme === opt.value ? "border-primary bg-accent" : "border-border hover:bg-muted/50",
                          locked && "bg-primary/5 border-primary/25 hover:bg-primary/10"
                        )}
                        title={opt.label}
                        aria-label={opt.label}
                        aria-pressed={theme === opt.value}
                      >
                        <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                        <span className={cn(
                          "text-[10px] font-medium leading-none",
                          theme === opt.value ? "text-primary" : "text-muted-foreground"
                        )}>
                          {opt.label}
                        </span>
                        {locked && <ProBadge className="absolute -top-1 -right-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="h-px bg-border" />

              {/* Homepage background */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Homepage background</p>
                <div className="flex gap-2">
                  {(
                    [
                      {
                        id: "dotgrid" as HomeBg,
                        label: "Dot grid",
                        pro: false,
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
                        pro: true,
                        preview: (
                          <div className="absolute inset-0 rounded-md overflow-hidden">
                            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 20% 30%, oklch(0.68 0.28 278 / 0.55) 0%, transparent 55%)" }} />
                            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 80% 20%, oklch(0.70 0.24 218 / 0.45) 0%, transparent 50%)" }} />
                            <div className="absolute inset-0" style={{ background: "radial-gradient(circle at 50% 80%, oklch(0.66 0.30 322 / 0.40) 0%, transparent 55%)" }} />
                          </div>
                        ),
                      },
                      {
                        id: "network" as HomeBg,
                        label: "Network",
                        pro: true,
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
                    ] satisfies { id: HomeBg; label: string; pro: boolean; preview: React.ReactNode }[]
                  ).map(({ id, label, pro, preview }) => {
                    const locked = pro && !isPro;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          if (locked) { openUpgradeModal("theme"); return; }
                          setHomeBg(id);
                        }}
                        aria-label={label}
                        aria-pressed={homeBg === id}
                        className={cn(
                          "relative flex-1 flex flex-col items-center gap-1.5 pt-1.5 pb-1 rounded-lg border transition-all duration-150",
                          homeBg === id ? "border-primary bg-accent" : "border-border hover:bg-muted/50",
                          locked && "bg-primary/5 border-primary/25 hover:bg-primary/10"
                        )}
                      >
                        <div className="relative w-full h-10 rounded-md overflow-hidden bg-background/60">
                          {preview}
                        </div>
                        <span className={cn(
                          "text-[10px] font-medium leading-none pb-0.5",
                          homeBg === id ? "text-primary" : "text-muted-foreground"
                        )}>
                          {label}
                        </span>
                        {locked && <ProBadge className="absolute -top-1 -right-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </Card>

            {/* Right — Project & Help */}
            <Card className="p-0 space-y-0 overflow-hidden">
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
                onClick={() => { setCurrentDb(null); setCurrentCollection(null); }}
                aria-label="Change project"
              >
                <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Change project</p>
                  <p className="text-xs text-muted-foreground">Open a different database folder</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <div className="h-px bg-border mx-4" />
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setOnboardingDone(false)}
                aria-label="Show welcome guide"
              >
                <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Show welcome guide</p>
                  <p className="text-xs text-muted-foreground">Replay the getting-started walkthrough</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <div className="h-px bg-border mx-4" />
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
                onClick={() => setShortcutsOpen(true)}
                aria-label="Show keyboard shortcuts"
              >
                <Keyboard className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Keyboard shortcuts</p>
                  <p className="text-xs text-muted-foreground">View all keyboard shortcuts</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
              <div className="h-px bg-border mx-4" />
              <button
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
                onClick={() => open("https://github.com/adm-crow/remex/issues/new/choose")}
                aria-label="Report a bug or request a feature"
              >
                <MessageSquarePlus className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Report a bug / Request a feature</p>
                  <p className="text-xs text-muted-foreground">Open an issue on GitHub</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            </Card>
          </div>
        )}

        {/* ── AI & Server ────────────────────────────────────────────────── */}
        {tab === "ai" && (
          <div className="grid grid-cols-2 gap-3 items-start">
            {/* Left — AI Agent */}
            <Card>
              <CardHeader icon={Bot} title="AI Agent" />
              <form onSubmit={handleSaveAi} className="space-y-2.5">
                <Field label="Provider" htmlFor="ai-provider">
                  <Select
                    value={aiProvider || AUTO_PROVIDER}
                    onValueChange={(v) => setAiProvider(v === AUTO_PROVIDER ? "" : v)}
                  >
                    <SelectTrigger id="ai-provider" aria-label="AI provider" className="w-full h-8 text-sm">
                      <SelectValue placeholder="Auto-detect" />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_PROVIDERS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Model" htmlFor="ai-model">
                  <Input
                    id="ai-model"
                    value={localModel}
                    onChange={(e) => setLocalModel(e.target.value)}
                    placeholder="claude-opus-4-6 · gpt-4o · llama3"
                    aria-label="AI model"
                    className="font-mono text-xs h-8"
                  />
                </Field>

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
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Stored locally. Used only by the remex sidecar on your machine.
                  </p>
                </Field>

                <Button type="submit" size="sm" className="w-full">Save AI settings</Button>
              </form>
            </Card>

            {/* Right — API Server */}
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
                    onClick={() => open(`${localApiUrl || "http://localhost:8000"}/docs`)}
                    aria-label="Open API URL in browser"
                    title="Open in browser"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* ── License ────────────────────────────────────────────────────── */}
        {tab === "license" && (
          <div className="grid grid-cols-2 gap-3 items-start">
            {/* Left — License */}
            <LicenseCard />
            {/* Right — Watch folders */}
            <WatchFoldersCard />
          </div>
        )}

      </div>

      {/* ── Sticky version footer ────────────────────────────────────────── */}
      <div className="shrink-0 border-t px-4 py-2.5 flex items-center justify-between bg-background">
        <p className="text-xs text-muted-foreground">
          {appVersion ? `Remex Studio v${appVersion}` : "Remex Studio"}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2 gap-1.5 text-muted-foreground hover:text-foreground"
          onClick={() => open("https://github.com/adm-crow/remex/releases")}
          aria-label="Check for updates"
        >
          <ExternalLink className="w-3 h-3" />
          Check for updates
        </Button>
      </div>
    </div>
  );
}
