# Ingest Pane Layout Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce vertical space in the Ingest pane by promoting the embedding model to a compact segmented control, merging the append-model toggle into the collection name label row, and moving the incremental toggle next to the Start button.

**Architecture:** Three files change. `EmbeddingModelField` gains a `compact` prop that renders a 4-segment control instead of the current full preset list; FilesTab and SQLiteTab receive pure layout restructuring — no new state, no new components, no shared state between tabs.

**Tech Stack:** React, TypeScript, Tailwind CSS v4, shadcn/ui (Switch, Button, Input, Label, Collapsible), Vitest + Testing Library

---

## Task 1: EmbeddingModelField — compact segmented control

**Files:**
- Modify: `studio/src/components/ingest/EmbeddingModelField.tsx`
- Modify: `studio/src/components/ingest/EmbeddingModelField.test.tsx`

- [ ] **Step 1.1: Write failing tests for compact mode**

Add a second `describe` block at the end of `studio/src/components/ingest/EmbeddingModelField.test.tsx`:

```tsx
describe("EmbeddingModelField — compact mode", () => {
  beforeEach(() => {
    useAppStore.setState({
      license: { tier: "free", email: null, activatedAt: null, lastValidatedAt: null },
      upgradeModalOpen: false,
    });
  });

  it("renders 4 segment buttons", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /balanced/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /multilingual/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /more/i })).toBeInTheDocument();
  });

  it("clicking a segment calls onChange with the correct model", () => {
    let selected = "";
    render(
      <EmbeddingModelField
        value="all-MiniLM-L6-v2"
        onChange={(v) => { selected = v; }}
        compact
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /balanced/i }));
    expect(selected).toBe("BAAI/bge-base-en-v1.5");
  });

  it("expansion panel is hidden by default", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    expect(screen.queryByTitle(/best English accuracy/)).not.toBeInTheDocument();
  });

  it("clicking More… shows the full preset list", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByTitle(/best English accuracy/)).toBeInTheDocument();
  });

  it("clicking More… again collapses the expansion panel", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.getByTitle(/best English accuracy/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    expect(screen.queryByTitle(/best English accuracy/)).not.toBeInTheDocument();
  });

  it("shows a 5th segment when a Pro model is selected", () => {
    render(
      <EmbeddingModelField value="BAAI/bge-large-en-v1.5" onChange={() => {}} compact />
    );
    expect(screen.getByTestId("model-segment-extra")).toHaveTextContent("Large");
  });

  it("shows a 5th segment when a custom model string is selected", () => {
    render(
      <EmbeddingModelField value="my-org/my-custom-model" onChange={() => {}} compact />
    );
    expect(screen.getByTestId("model-segment-extra")).toBeInTheDocument();
  });

  it("Pro preset in expansion panel triggers upgrade modal for free tier", () => {
    render(<EmbeddingModelField value="all-MiniLM-L6-v2" onChange={() => {}} compact />);
    fireEvent.click(screen.getByRole("button", { name: /more/i }));
    fireEvent.click(screen.getByTitle(/best English accuracy/));
    expect(useAppStore.getState().upgradeModalOpen).toBe(true);
    expect(useAppStore.getState().upgradeModalContext).toBe("embedding-model");
  });
});
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd studio && npx vitest run src/components/ingest/EmbeddingModelField.test.tsx
```

Expected: compact mode suite fails with type errors on `compact` prop.

- [ ] **Step 1.3: Implement compact mode**

Replace the entire contents of `studio/src/components/ingest/EmbeddingModelField.tsx` with:

```tsx
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
  inputId,
}: {
  value: string;
  onChange: (v: string) => void;
  inputId: string;
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

  const inSegment = SEGMENT_PRESETS.some((p) => p.model === value);
  const extraPreset = inSegment ? null : PRESETS.find((p) => p.model === value);

  const segBase =
    "flex-1 flex flex-col items-center justify-center border-r border-border px-1 py-1.5 gap-0.5 transition-colors min-w-0";

  return (
    <div className="space-y-1.5">
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
          <button
            type="button"
            data-testid="model-segment-extra"
            className={cn(segBase, "bg-primary text-primary-foreground")}
          >
            <span className="text-[10px] font-bold leading-none whitespace-nowrap truncate w-full text-center px-0.5">
              {extraPreset ? extraPreset.tag : shortName(value)}
            </span>
            {extraPreset && (
              <span className="text-[8.5px] font-mono leading-none w-full text-center truncate px-0.5 opacity-85">
                {shortName(extraPreset.model)}
              </span>
            )}
          </button>
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
          <PresetList value={value} onChange={onChange} inputId={inputId} />
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
    <div className="space-y-1.5">
      <Label htmlFor={inputId} className="text-xs">Embedding model</Label>
      <Input
        id={inputId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-xs"
      />
      <div className="flex flex-col gap-1 pt-0.5">
        <PresetList value={value} onChange={onChange} inputId={inputId} />
      </div>
    </div>
  );
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
cd studio && npx vitest run src/components/ingest/EmbeddingModelField.test.tsx
```

Expected: all tests pass including both describe blocks.

- [ ] **Step 1.5: Commit**

```bash
git add studio/src/components/ingest/EmbeddingModelField.tsx studio/src/components/ingest/EmbeddingModelField.test.tsx
git commit -m "feat(ingest): add compact segmented control to EmbeddingModelField"
```

---

## Task 2: FilesTab — layout changes

**Files:**
- Modify: `studio/src/components/ingest/FilesTab.tsx`
- Modify: `studio/src/components/ingest/FilesTab.test.tsx`

- [ ] **Step 2.1: Update existing incremental test + add new layout tests**

In `FilesTab.test.tsx`, find the test `"sends incremental:true when toggle is on"` and remove the two lines that open the Advanced section:

```tsx
// DELETE these two lines:
// fireEvent.click(screen.getByRole("button", { name: /advanced/i }));
// const toggle = await screen.findByRole("switch", { name: /incremental/i });

// REPLACE with (synchronous now — toggle is in the main form):
const toggle = screen.getByRole("switch", { name: /incremental/i });
fireEvent.click(toggle);
```

The full updated test:

```tsx
it("sends incremental:true when toggle is on", async () => {
  vi.mocked(api.ingestFilesStream).mockReturnValue(
    makeStream([
      { type: "done", result: { sources_found: 1, sources_ingested: 1, sources_skipped: 0, chunks_stored: 3, skipped_reasons: [] } },
    ]) as any
  );
  useAppStore.setState({ currentDb: "./remex_db", currentCollection: "col", apiUrl: "http://localhost:8000" } as any);
  renderWithProviders(<FilesTab />);
  fireEvent.change(screen.getByRole("textbox", { name: /source directory/i }), { target: { value: "/docs" } });

  const toggle = screen.getByRole("switch", { name: /incremental/i });
  fireEvent.click(toggle);

  fireEvent.click(screen.getByRole("button", { name: /start ingest/i }));
  await waitFor(() => {
    expect(vi.mocked(api.ingestFilesStream)).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), expect.any(String),
      expect.objectContaining({ incremental: true }),
      expect.any(AbortSignal)
    );
  });
});
```

Add these three tests at the end of `describe("FilesTab")`:

```tsx
it("incremental toggle is visible without opening Advanced", () => {
  renderWithProviders(<FilesTab />);
  expect(screen.getByRole("switch", { name: /incremental/i })).toBeInTheDocument();
});

it("embedding model segmented control is visible without opening Advanced", () => {
  renderWithProviders(<FilesTab />);
  expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
});

it("toggling append-model shows the effective collection name preview", () => {
  renderWithProviders(<FilesTab />);
  expect(screen.queryByText(/will ingest into/i)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("switch", { name: /append embedding model/i }));
  expect(screen.getByText(/will ingest into/i)).toBeInTheDocument();
});
```

- [ ] **Step 2.2: Confirm new tests fail**

```bash
cd studio && npx vitest run src/components/ingest/FilesTab.test.tsx
```

Expected: the 3 new tests fail; the updated incremental test also fails (toggle not found without opening Advanced).

- [ ] **Step 2.3: Replace the return block in FilesTab**

In `studio/src/components/ingest/FilesTab.tsx`, replace the entire `return (...)` starting at line 213 with:

```tsx
  return (
    <div className="flex flex-col h-full p-4 gap-3 overflow-y-auto">
      {/* Directory picker */}
      <div
        className={cn(
          "space-y-1 rounded-lg p-1 -m-1 transition-colors",
          isDragging && "bg-primary/5 ring-2 ring-dashed ring-primary/50"
        )}
      >
        <Label className="text-xs text-muted-foreground">Source directory</Label>
        <div className="flex gap-2">
          <Input
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="/path/to/docs"
            className="flex-1 h-8"
            aria-label="Source directory"
          />
          <Button variant="outline" size="sm" onClick={handleBrowse} aria-label="Browse">
            Browse
          </Button>
        </div>
      </div>

      {/* Collection name — append-model toggle merged into label row */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="collection-name" className="text-xs text-muted-foreground">
            Collection name
          </Label>
          <div className="flex items-center gap-1.5">
            <Switch
              id="append-model"
              checked={appendModel}
              onCheckedChange={setAppendModel}
              aria-label="Append embedding model to collection name"
            />
            <Label htmlFor="append-model" className="text-xs text-muted-foreground cursor-pointer">
              +model suffix
            </Label>
          </div>
        </div>
        <Input
          id="collection-name"
          value={collectionName}
          onChange={(e) => setCollectionName(e.target.value)}
          placeholder={currentCollection ?? "collection"}
          className="h-8 text-sm"
        />
        {appendModel && (
          <p className="text-xs text-muted-foreground">
            Will ingest into:{" "}
            <span className="font-mono font-medium text-foreground">
              {effectiveCollection || "—"}
            </span>
          </p>
        )}
      </div>

      {/* Embedding model — compact segmented control, promoted out of Advanced */}
      <EmbeddingModelField
        value={embeddingModel}
        onChange={setEmbeddingModel}
        compact
      />

      {/* Advanced — chunk size + overlap only */}
      <Collapsible>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground px-0 h-7 shrink-0">
              Advanced ▾
            </Button>
          </CollapsibleTrigger>
          <div className="h-px bg-border flex-1" />
        </div>
        <CollapsibleContent className="mt-2 bg-primary/5 rounded-lg p-3">
          <div className="flex items-center gap-x-4">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="chunk-size" className="text-xs whitespace-nowrap">Chunk size</Label>
              <Input
                id="chunk-size"
                type="number"
                value={chunkSize}
                onChange={(e) => setChunkSize(Number(e.target.value))}
                className="h-8 w-20 text-xs"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="overlap" className="text-xs whitespace-nowrap">Overlap</Label>
              <Input
                id="overlap"
                type="number"
                value={overlap}
                onChange={(e) => setOverlap(Number(e.target.value))}
                className="h-8 w-20 text-xs"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Incremental toggle + Start/Stop on same row */}
      <div className="flex items-center gap-2">
        <Switch
          id="incremental"
          checked={incremental}
          onCheckedChange={setIncremental}
          aria-label="Incremental ingest"
        />
        <Label htmlFor="incremental" className="text-xs text-muted-foreground whitespace-nowrap">
          Incremental
        </Label>
        <Button
          onClick={handleStart}
          disabled={ingestRunning || !sourcePath || !effectiveCollection}
          aria-label="Start ingest"
          className="flex-1"
        >
          <Play className="w-4 h-4 mr-2" />
          {ingestRunning ? "Ingesting…" : "Start ingest"}
        </Button>
        {ingestRunning && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => abortRef.current?.abort()}
            aria-label="Stop"
            className="shrink-0"
          >
            Stop
          </Button>
        )}
      </div>

      {(ingestRunning || (ingestFilesTotal > 0 && !ingestStreamError)) && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{ingestRunning ? "Ingesting…" : "Done"}</span>
            <span className="tabular-nums">
              {ingestFilesTotal === 0
                ? "Loading model…"
                : `${ingestFilesDone} / ${ingestFilesTotal}`}
            </span>
          </div>
          <div
            className="h-1.5 w-full rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={ingestFilesTotal || 1}
            aria-valuenow={ingestFilesDone}
            aria-label="Ingest progress"
          >
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{
                width: ingestFilesTotal > 0
                  ? `${Math.round((ingestFilesDone / ingestFilesTotal) * 100)}%`
                  : ingestRunning ? "5%" : "0%",
              }}
            />
          </div>
          {ingestRunning && eta && (
            <p className="text-xs text-muted-foreground text-right tabular-nums">
              ~{eta} remaining
            </p>
          )}
        </div>
      )}

      {ingestStreamError && (
        <div
          className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{ingestStreamError}</span>
        </div>
      )}

      {wasCancelled && (
        <div
          className="flex items-start justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5"
          role="alert"
        >
          <div className="flex items-start gap-2.5 text-amber-700 dark:text-amber-400 min-w-0">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Incomplete</p>
              <p className="text-xs opacity-80">
                Ingestion was stopped early — {ingestFilesDone} file{ingestFilesDone !== 1 ? "s" : ""} ingested.
                The collection is partially populated.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWasCancelled(false)}
            className="shrink-0 text-amber-700 dark:text-amber-400 hover:opacity-70 transition-opacity mt-0.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-1">
          {ingestProgress.map((p, i) => (
            <div
              key={`${p.filename}-${i}`}
              className="flex items-center gap-2 text-xs p-1"
            >
              <Badge variant={STATUS_VARIANT[p.status]} className="text-xs shrink-0">
                {p.status}
              </Badge>
              <span className="font-mono truncate flex-1">{p.filename}</span>
              <span className="text-muted-foreground shrink-0">
                {p.chunks_stored} chunks
              </span>
            </div>
          ))}
          {ingestRunning && (
            <div className="flex items-center gap-2 text-xs p-1 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary" />
              <span className="truncate flex-1">
                {ingestFilesTotal === 0
                  ? showModelHint
                    ? "Downloading embedding model… (first use only)"
                    : "Starting ingestion…"
                  : ingestFilesDone >= ingestFilesTotal
                    ? "Storing embeddings…"
                    : `Processing file ${ingestFilesDone} of ${ingestFilesTotal}…`}
              </span>
            </div>
          )}
        </div>
      </ScrollArea>

      {showDoneAlert && lastIngestResult && (
        <div
          className="flex items-start justify-between gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3"
          role="alert"
        >
          <div className="flex items-start gap-2.5 text-emerald-700 dark:text-emerald-400 min-w-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-medium">Ingest complete</p>
              <p className="text-xs opacity-80">
                {lastIngestResult.sourcesIngested} ingested · {lastIngestResult.sourcesSkipped} skipped ·{" "}
                {lastIngestResult.chunksStored} chunks stored
              </p>
              <p className="text-xs opacity-80">
                Duration:{" "}
                <span className="font-medium">
                  {formatDuration(
                    new Date(lastIngestResult.completedAt).getTime() -
                    new Date(lastIngestResult.startedAt).getTime()
                  )}
                </span>
              </p>
              <p className="text-xs opacity-60 font-mono">
                {new Date(lastIngestResult.completedAt).toLocaleString()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDoneAlert(false)}
            className="shrink-0 text-emerald-700 dark:text-emerald-400 hover:opacity-70 transition-opacity mt-0.5"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
```

- [ ] **Step 2.4: Run all FilesTab tests**

```bash
cd studio && npx vitest run src/components/ingest/FilesTab.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```bash
git add studio/src/components/ingest/FilesTab.tsx studio/src/components/ingest/FilesTab.test.tsx
git commit -m "feat(ingest): FilesTab — compact model picker, merged toggle, inline incremental"
```

---

## Task 3: SQLiteTab — layout changes

**Files:**
- Modify: `studio/src/components/ingest/SQLiteTab.tsx`
- Modify: `studio/src/components/ingest/SQLiteTab.test.tsx`

- [ ] **Step 3.1: Add layout tests**

Add these two tests at the end of `describe("SQLiteTab")` in `SQLiteTab.test.tsx`:

```tsx
it("incremental toggle is visible without opening Advanced", () => {
  renderWithProviders(<SQLiteTab />);
  expect(screen.getByRole("switch", { name: /incremental/i })).toBeInTheDocument();
});

it("embedding model segmented control is visible without opening Advanced", () => {
  renderWithProviders(<SQLiteTab />);
  expect(screen.getByRole("button", { name: /light/i })).toBeInTheDocument();
});
```

- [ ] **Step 3.2: Confirm new tests fail**

```bash
cd studio && npx vitest run src/components/ingest/SQLiteTab.test.tsx
```

Expected: the 2 new tests fail.

- [ ] **Step 3.3: Apply layout changes to SQLiteTab**

In `studio/src/components/ingest/SQLiteTab.tsx`, make four targeted replacements inside `return (...)`:

**Replace** the collection name block + standalone append-model toggle + conditional preview (currently three separate `<div>` elements, lines ~325–359) **with**:

```tsx
{/* Collection name — append-model toggle merged into label row */}
<div className="space-y-1">
  <div className="flex items-center justify-between">
    <Label htmlFor="sqlite-collection" className="text-xs text-muted-foreground">
      Collection name
    </Label>
    <div className="flex items-center gap-1.5">
      <Switch
        id="sqlite-append-model"
        checked={appendModel}
        onCheckedChange={setAppendModel}
        aria-label="Append embedding model to collection name"
      />
      <Label htmlFor="sqlite-append-model" className="text-xs text-muted-foreground cursor-pointer">
        +model suffix
      </Label>
    </div>
  </div>
  <Input
    id="sqlite-collection"
    value={collectionName}
    onChange={(e) => setCollectionName(e.target.value)}
    placeholder={currentCollection ?? "collection"}
    className="h-8 text-sm"
    aria-label="SQLite collection"
  />
  {appendModel && (
    <p className="text-xs text-muted-foreground">
      Will ingest into:{" "}
      <span className="font-mono font-medium text-foreground">
        {effectiveCollection || "—"}
      </span>
    </p>
  )}
</div>
```

**Add** after the collection name block, before the `<Collapsible>`:

```tsx
{/* Embedding model — compact segmented control, promoted out of Advanced */}
<EmbeddingModelField
  inputId="sqlite-embedding-model"
  value={embeddingModel}
  onChange={setEmbeddingModel}
  compact
/>
```

**Replace** the `<CollapsibleContent>` (currently contains columns, ID column, row template, incremental switch, and EmbeddingModelField) **with** columns, ID column, and row template only:

```tsx
<CollapsibleContent className="space-y-3 mt-2 bg-primary/5 rounded-lg p-3">
  <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
    <div className="flex-1 min-w-[120px] space-y-1">
      <Label htmlFor="sqlite-columns" className="text-xs">Columns (comma-sep.)</Label>
      <Input
        id="sqlite-columns"
        value={columns}
        onChange={(e) => setColumns(e.target.value)}
        placeholder="title, body, author"
        className="h-8 text-xs"
      />
    </div>
    <div className="w-24 space-y-1">
      <Label htmlFor="sqlite-id-col" className="text-xs">ID column</Label>
      <Input
        id="sqlite-id-col"
        value={idColumn}
        onChange={(e) => setIdColumn(e.target.value)}
        placeholder="id"
        className="h-8 text-xs"
      />
    </div>
  </div>
  <div className="space-y-1">
    <Label htmlFor="sqlite-template" className="text-xs">Row template (optional)</Label>
    <Input
      id="sqlite-template"
      value={rowTemplate}
      onChange={(e) => setRowTemplate(e.target.value)}
      placeholder="{title}: {body}"
      className="h-8 text-xs"
    />
  </div>
</CollapsibleContent>
```

**Replace** the standalone Start button `<div>` (currently `<div className="flex gap-2">`) **with** incremental toggle + Start/Stop on same row:

```tsx
<div className="flex items-center gap-2">
  <Switch
    id="sqlite-incremental"
    checked={incremental}
    onCheckedChange={setIncremental}
    aria-label="Incremental ingest"
  />
  <Label htmlFor="sqlite-incremental" className="text-xs text-muted-foreground whitespace-nowrap">
    Incremental
  </Label>
  <Button onClick={handleRun} disabled={!canRun} aria-label="Run ingest" className="flex-1">
    <Play className="w-4 h-4 mr-2" />
    {sqliteIngestRunning ? "Ingesting…" : "Start ingest"}
  </Button>
  {sqliteIngestRunning && (
    <Button
      type="button"
      variant="destructive"
      onClick={() => runAbortRef.current?.abort()}
      aria-label="Stop"
      className="shrink-0"
    >
      Stop
    </Button>
  )}
</div>
```

- [ ] **Step 3.4: Run all SQLiteTab tests**

```bash
cd studio && npx vitest run src/components/ingest/SQLiteTab.test.tsx src/components/ingest/SQLiteTab.cancel.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3.5: Run the full test suite**

```bash
cd studio && npx vitest run
```

Expected: all tests pass with no regressions.

- [ ] **Step 3.6: Commit**

```bash
git add studio/src/components/ingest/SQLiteTab.tsx studio/src/components/ingest/SQLiteTab.test.tsx
git commit -m "feat(ingest): SQLiteTab — compact model picker, merged toggle, inline incremental"
```
