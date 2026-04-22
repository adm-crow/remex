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
  speed: string;  // relative to all-MiniLM-L6-v2 on CPU
  pro?: boolean;
};

const PRESETS: Preset[] = [
  { tag: "Light",        tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    model: "all-MiniLM-L6-v2",
    desc: "22 MB · good accuracy, recommended for most cases",
    speed: "⚡ fastest" },
  { tag: "Balanced",     tagColor: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    model: "intfloat/e5-base-v2",
    desc: "438 MB · noticeably better retrieval than Light",
    speed: "~4× slower" },
  { tag: "Multilingual", tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    model: "paraphrase-multilingual-MiniLM-L12-v2",
    desc: "470 MB · 50+ languages",
    speed: "~4× slower" },
  { tag: "Large",        tagColor: "bg-primary/15 text-primary",
    model: "BAAI/bge-large-en-v1.5",
    desc: "1.3 GB · best English accuracy",
    speed: "~15× slower", pro: true },
  { tag: "E5 Large",     tagColor: "bg-primary/15 text-primary",
    model: "intfloat/e5-large-v2",
    desc: "1.3 GB · strong retrieval benchmark",
    speed: "~15× slower", pro: true },
  { tag: "Nomic",        tagColor: "bg-primary/15 text-primary",
    model: "nomic-ai/nomic-embed-text-v1.5",
    desc: "547 MB · long context window",
    speed: "~6× slower", pro: true },
];

const LINKS = [
  { label: "SBERT pretrained models",         href: "https://www.sbert.net/docs/pretrained_models.html" },
  { label: "HuggingFace sentence-similarity", href: "https://huggingface.co/models?pipeline_tag=sentence-similarity&sort=downloads" },
  { label: "Ollama embedding models",         href: "https://ollama.com/search?c=embedding" },
];

interface EmbeddingModelFieldProps {
  value: string;
  onChange: (value: string) => void;
  inputId?: string;
}

export function EmbeddingModelField({ value, onChange, inputId = "embedding-model" }: EmbeddingModelFieldProps) {
  const isPro = useIsPro();
  const openUpgradeModal = useAppStore((s) => s.openUpgradeModal);

  return (
    <div className="space-y-1">
      <Label htmlFor={inputId} className="text-xs">Embedding model</Label>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
      <div className="pt-1 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map(({ tag, tagColor, model, desc, speed, pro }) => {
            const locked = pro && !isPro;
            const isSelected = value === model;
            return (
              <button
                key={model}
                type="button"
                className={cn(
                  "flex items-center gap-1.5 rounded-full border pl-1.5 pr-2.5 py-0.5 transition-colors",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : locked
                      ? "bg-primary/5 border-primary/25 hover:bg-primary/10 cursor-pointer"
                      : "bg-muted/30 hover:bg-muted/60"
                )}
                onClick={() => {
                  if (locked) { openUpgradeModal("embedding-model"); return; }
                  onChange(model);
                }}
                title={`${desc} · CPU speed: ${speed}`}
              >
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${tagColor}`}>
                  {tag}
                </span>
                <span className="text-[11px] text-muted-foreground font-mono truncate">{model.split("/").pop()}</span>
                <span className="text-[10px] text-muted-foreground/60 shrink-0">{speed}</span>
                {locked && <ProBadge className="ml-1" />}
              </button>
            );
          })}
        </div>
        <div className="flex flex-row flex-wrap gap-x-3 gap-y-1">
          {LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[11px] text-primary hover:underline w-fit"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
