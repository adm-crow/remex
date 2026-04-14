import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  {
    tag: "Light",
    tagColor: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    model: "all-MiniLM-L6-v2",
    desc: "22 MB · fast, good for most cases",
  },
  {
    tag: "Large",
    tagColor: "bg-primary/15 text-primary",
    model: "BAAI/bge-large-en-v1.5",
    desc: "1.3 GB · best English accuracy",
  },
  {
    tag: "Multilingual",
    tagColor: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    model: "paraphrase-multilingual-MiniLM-L12-v2",
    desc: "470 MB · 50+ languages",
  },
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
  return (
    <div className="space-y-1">
      <Label htmlFor={inputId} className="text-xs">Embedding model</Label>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 text-xs"
      />
      <div className="space-y-1.5 pt-1">
        <p className="text-xs text-muted-foreground">
          The model used at ingest time <strong className="text-foreground">must match</strong> query time.
        </p>
        {PRESETS.map(({ tag, tagColor, model, desc }) => (
          <button
            key={model}
            type="button"
            className="w-full text-left rounded border bg-muted/30 px-2 py-1 hover:bg-muted/60 transition-colors"
            onClick={() => onChange(model)}
            title={`Use ${model}`}
          >
            <div className="flex items-center gap-1.5">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${tagColor}`}>
                {tag}
              </span>
              <span className="font-mono text-[11px] truncate">{model}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
          </button>
        ))}
        <div className="flex flex-row flex-wrap gap-x-3 gap-y-1 pt-0.5">
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
