import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Sun, Moon, Palette, Bot, Eye, EyeOff,
  Server, FolderOpen, ChevronRight, ExternalLink,
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
import { useAppStore } from "@/store/app";
import type { Theme } from "@/store/app";
import { cn } from "@/lib/utils";

// Colors are the exact light-mode --primary values from index.css
const THEME_OPTIONS: { value: Theme; label: string; color: string }[] = [
  { value: "default", label: "Indigo", color: "oklch(0.47 0.27 262)"  },
  { value: "violet",  label: "Violet", color: "oklch(0.50 0.26 285)"  },
  { value: "rose",    label: "Rose",   color: "oklch(0.55 0.24 345)"  },
  { value: "coral",   label: "Coral",  color: "oklch(0.58 0.22 22)"   },
  { value: "green",   label: "Green",  color: "oklch(0.60 0.20 155)"  },
  { value: "yellow",  label: "Yellow", color: "oklch(0.75 0.20 92)"   },
  { value: "lime",    label: "Lime",   color: "oklch(0.62 0.22 122)"  },
  { value: "slate",   label: "Slate",  color: "oklch(0.50 0.08 240)"  },
];

const AUTO_PROVIDER = "__auto__";

const AI_PROVIDERS = [
  { value: AUTO_PROVIDER, label: "Auto-detect"    },
  { value: "anthropic",   label: "Anthropic"      },
  { value: "openai",      label: "OpenAI"         },
  { value: "ollama",      label: "Ollama (local)" },
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
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
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
    aiProvider, setAiProvider,
    aiModel, setAiModel,
    aiApiKey, setAiApiKey,
  } = useAppStore();

  const [localApiUrl, setLocalApiUrl] = useState(apiUrl);
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
    <div className="h-full p-4 overflow-hidden">
      <div className="grid grid-cols-2 gap-3 items-start h-full">

        {/* ── Left column ─────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Appearance */}
          <Card>
            <CardHeader icon={Palette} title="Appearance" />

            {/* Dark mode */}
            <div className="flex items-center justify-between py-0.5">
              <div className="flex items-center gap-2">
                {darkMode
                  ? <Moon className="w-3.5 h-3.5 text-muted-foreground" />
                  : <Sun  className="w-3.5 h-3.5 text-muted-foreground" />
                }
                <Label htmlFor="dark-mode" className="text-sm cursor-pointer">
                  Dark mode
                </Label>
              </div>
              <Switch
                id="dark-mode"
                checked={darkMode}
                onCheckedChange={setDarkMode}
                aria-label="Dark mode"
              />
            </div>

            <div className="h-px bg-border" />

            {/* Accent colour */}
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Accent colour</p>
              <div className="grid grid-cols-4 gap-1.5">
                {THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={cn(
                      "flex flex-col items-center gap-1 py-1.5 px-1 rounded-lg border transition-all duration-150",
                      theme === opt.value
                        ? "border-primary bg-accent"
                        : "border-border hover:bg-muted/50"
                    )}
                    title={opt.label}
                  >
                    <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: opt.color }} />
                    <span className={cn(
                      "text-[10px] font-medium leading-none",
                      theme === opt.value ? "text-primary" : "text-muted-foreground"
                    )}>
                      {opt.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Card>

          {/* API Server */}
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
                <Button type="submit" size="sm" className="flex-1">
                  Save
                </Button>
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

          {/* Project */}
          <Card className="p-0 space-y-0 overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
              onClick={() => { setCurrentDb(null); setCurrentCollection(null); }}
              aria-label="Change project"
            >
              <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Change project</p>
                <p className="text-xs text-muted-foreground">
                  Open a different database folder
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          </Card>

        </div>

        {/* ── Right column ────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* AI Agent */}
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
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
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
                    {showKey
                      ? <EyeOff className="w-3.5 h-3.5" />
                      : <Eye    className="w-3.5 h-3.5" />
                    }
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Stored locally. Used only by the remex sidecar on your machine to call the AI provider.
                </p>
              </Field>

              <Button type="submit" size="sm" className="w-full">
                Save AI settings
              </Button>
            </form>
          </Card>

          {appVersion && (
            <p className="text-xs text-muted-foreground text-center pt-1">
              Remex Studio v{appVersion}
            </p>
          )}

        </div>
      </div>
    </div>
  );
}
