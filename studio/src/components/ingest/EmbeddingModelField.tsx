import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore, useIsPro } from "@/store/app";
import { ProBadge } from "@/components/license/ProBadge";
import { cn } from "@/lib/utils";

type Preset = {
  tag: string;
  tagColor: string;
  model: string;
  desc: string;
  speed: string;
  pro?: boolean;
};

const PRESETS: Preset[] = [
  { tag: "Light",        tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    model: "all-MiniLM-L6-v2",
    desc: "90 MB · fast, works offline, no HuggingFace required",
    speed: "⚡ fastest" },
  { tag: "Balanced",     tagColor: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    model: "BAAI/bge-base-en-v1.5",
    desc: "210 MB · noticeably better retrieval than Light",
    speed: "~4× slower" },
  { tag: "Multilingual", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    model: "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    desc: "220 MB · 50+ languages",
    speed: "~4× slower" },
  { tag: "Large",        tagColor: "bg-primary/15 text-primary",
    model: "BAAI/bge-large-en-v1.5",
    desc: "1.2 GB · best English accuracy",
    speed: "~15× slower", pro: true },
  { tag: "Long ctx",     tagColor: "bg-primary/15 text-primary",
    model: "nomic-ai/nomic-embed-text-v1.5-Q",
    desc: "130 MB · long context window (8 192 tokens)",
    speed: "~6× slower", pro: true },
];

const SEGMENT_PRESETS = PRESETS.slice(0, 3);

const LINKS = [
  { label: "FastEmbed models", href: "https://qdrant.github.io/fastembed/examples/Supported_Models/" },
  { label: "HuggingFace",      href: "https://huggingface.co/models?pipeline_tag=sentence-similarity&sort=downloads" },
];

interface EmbeddingModelFieldProps {
  value: string;
  onChange: (value: string) => void;
  inputId?: string;
  compact?: boolean;
}

function shortName(model: string): string {
  return model.includes("/") ? model.split("/").pop()! : model;
}

function PresetList({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isPro = useIsPro();
  const openUpgradeModal = useAppStore((s) => s.openUpgradeModal);
  return (
    <>
      <div className="flex flex-col gap-1">
        {PRESETS.map(({ tag, tagColor, model, desc, speed, pro }) => {
          const locked = pro && !isPro;
          const isSelected = value === model;
          return (
            <button
              key={model}
              type="button"
              title={desc}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/10"
                  : locked
                    ? "border-dashed bg-muted/20 hover:bg-muted/40 cursor-pointer"
                    : "bg-muted/20 hover:bg-muted/50 border-transparent hover:border-border"
              )}
              onClick={() => {
                if (locked) { openUpgradeModal("embedding-model"); return; }
                onChange(model);
              }}
            >
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 ${tagColor}`}>{tag}</span>
              <span className="text-xs font-mono text-muted-foreground flex-1 truncate min-w-0">{model}</span>
              <span className="text-xs text-muted-foreground/60 shrink-0">{speed}</span>
              {locked && <ProBadge />}
            </button>
          );
        })}
      </div>
      <div className="flex flex-row gap-x-3">
        {LINKS.map(({ label, href }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            {label}
          </a>
        ))}
      </div>

    </>
  );
}

function CompactPicker({
  value,
  onChange,
  inputId,
}: {
  value: string;
  onChange: (v: string) => void;
  inputId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPro = useIsPro();
  const openUpgradeModal = useAppStore((s) => s.openUpgradeModal);

  const inSegment = SEGMENT_PRESETS.some((p) => p.model === value);
  const extraPreset = inSegment ? null : PRESETS.find((p) => p.model === value);

  const segBase =
    "flex-1 flex flex-col items-center justify-center border-r border-border px-1 py-1.5 gap-0.5 transition-colors min-w-0";

  return (
    <div className="space-y-1">
      <Label className="text-xs">Embedding model</Label>

      <div className="flex border border-border rounded-md overflow-hidden bg-background">
        {SEGMENT_PRESETS.map((preset) => (
          <button
            key={preset.model}
            type="button"
            className={cn(
              segBase,
              value === preset.model
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted/50"
            )}
            onClick={() => onChange(preset.model)}
          >
            <span className="text-[10px] font-bold leading-none whitespace-nowrap">
              {preset.tag}
            </span>
            <span className={cn(
              "text-[8.5px] font-mono leading-none w-full text-center truncate px-0.5",
              value === preset.model ? "opacity-85" : "text-muted-foreground opacity-70"
            )}>
              {shortName(preset.model)}
            </span>
          </button>
        ))}

        {!inSegment && (
          extraPreset === undefined ? (
            // Custom model string not in PRESETS — render as non-interactive display
            <div
              role="presentation"
              aria-label="Custom model (active)"
              data-testid="model-segment-extra"
              className={cn(segBase, "bg-primary text-primary-foreground")}
            >
              <span className="text-[10px] font-bold leading-none whitespace-nowrap truncate w-full text-center px-0.5">
                {shortName(value)}
              </span>
            </div>
          ) : (
            // Known preset (possibly Pro-locked) — render as interactive button
            <button
              type="button"
              data-testid="model-segment-extra"
              className={cn(segBase, "bg-primary text-primary-foreground relative")}
              onClick={() => {
                if (extraPreset?.pro && !isPro) { openUpgradeModal("embedding-model"); return; }
                onChange(extraPreset.model);
              }}
            >
              <span className="text-[10px] font-bold leading-none whitespace-nowrap truncate w-full text-center px-0.5">
                {extraPreset.tag}
              </span>
              <span className="text-[8.5px] font-mono leading-none w-full text-center truncate px-0.5 opacity-85">
                {shortName(extraPreset.model)}
              </span>
              {extraPreset.pro && !isPro && (
                <span className="absolute top-0.5 right-0.5">
                  <ProBadge />
                </span>
              )}
            </button>
          )
        )}

        <button
          type="button"
          className={cn(
            "flex items-center justify-center px-2.5 text-[10px] font-semibold whitespace-nowrap transition-colors border-l border-border",
            expanded
              ? "bg-primary text-primary-foreground"
              : "text-primary hover:bg-muted/30"
          )}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "More ▴" : "More…"}
        </button>
      </div>

      {expanded && (
        <div className="border border-border rounded-md p-2 space-y-2 bg-primary/5">
          <PresetList value={value} onChange={onChange} />
          <div className="space-y-1 pt-1.5 border-t border-border">
            <Label htmlFor={inputId} className="text-xs">Custom model</Label>
            <Input
              id={inputId}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 text-xs"
              placeholder="org/model-name"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function EmbeddingModelField({
  value,
  onChange,
  inputId = "embedding-model",
  compact = false,
}: EmbeddingModelFieldProps) {
  if (compact) {
    return <CompactPicker value={value} onChange={onChange} inputId={inputId} />;
  }

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId} className="text-xs">Embedding model</Label>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
      <div className="flex flex-col gap-1 pt-0.5">
        <PresetList value={value} onChange={onChange} />
      </div>
    </div>
  );
}
