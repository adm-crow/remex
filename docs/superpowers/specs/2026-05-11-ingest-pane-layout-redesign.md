# Ingest Pane Layout Redesign

**Date:** 2026-05-11
**Status:** Approved

## Goal

Gain vertical space in the Ingest pane without over-compacting it, and improve discoverability of the two settings users most commonly overlook: the embedding model and the incremental flag.

## Changes

### 1. Collection name — merge append-model toggle into the label row

**Before:** Collection name input on one row, append-model toggle on its own row below.

**After:** The toggle and its label ("+ model suffix") move to the right side of the collection name label row, on the same line. The "Will ingest into: `<name>`" preview text stays below the input when the toggle is on (current behavior kept).

```
[Collection name]          [○ +model suffix]   ← label row
[input: my-collection                       ]
Will ingest into: `my-collection-all-MiniLM-L6-v2`   ← only when toggle on
```

Saves 1 row unconditionally.

### 2. Embedding model — promoted out of Advanced as a segmented control

**Before:** Full preset picker (5 buttons + custom text input + links) buried inside the Advanced collapsible.

**After:** A 4-segment control sits in the main form, above the Advanced section:

```
[⚡ Light          ] [Balanced          ] [Multilingual      ] [More…]
[all-MiniLM-L6-v2 ] [bge-base-en-v1.5  ] [paraphrase-multi… ] [    ]
```

- Each segment shows the **tag** (bold, centered) on the first line and the **model name** (monospace, smaller, truncated) on the second line.
- The active segment is highlighted with the primary color.
- **"More…"** is a toggle button — clicking it opens an inline expansion panel below the control; clicking again collapses it. The panel shows all 5 presets (including Pro, with badge/speed/Pro tag), a custom model text input, and the HuggingFace / FastEmbed links — identical content to the current Advanced picker.
- When the selected model is **not** one of the 3 segmented presets (i.e., a Pro model or a custom string), a 5th segment showing that model's tag (or a truncated model name) is appended after "More…" so the active selection is always visible without expanding.

**Implementation:** `EmbeddingModelField` gains a `compact?: boolean` prop. When `compact={true}`, it renders the segmented control + collapsible expansion panel instead of the current always-visible preset list. The full-picker UI (presets + links) is reused unchanged inside the expansion panel. In compact mode, no text input is visible in the main form — the custom model input lives exclusively inside the "More…" panel.

Saves ~6 rows when the model picker is collapsed (which is almost always).

### 3. Incremental toggle — moved to the Start button row

**Before:** Inside the Advanced collapsible, easy to miss.

**After:** Sits to the left of the Start button on the same row:

```
[○ Incremental]  [▶ Start ingest ——————————————]
```

The toggle is compact (same size as today). The Start button takes the remaining flex width. No row is added — this replaces the existing standalone Start button row.

Saves 0 rows but makes Incremental always visible and impossible to miss.

### 4. Advanced section — slimmed down

**FilesTab Advanced (after):** chunk size + overlap only, as compact inline pairs (label + fixed-width number input, not stretched).

```
Advanced ▾ ─────────────────────────────
  Chunk size [1000]   Overlap [200]
```

**SQLiteTab Advanced (after):** columns, ID column, row template only. Incremental and embedding model have both been promoted out.

### 5. Both tabs get identical treatment

FilesTab and SQLiteTab both receive changes 1–4. The only difference is the Advanced content (Files: chunk/overlap; SQLite: columns, ID column, row template).

## Files affected

| File | Change |
|---|---|
| `studio/src/components/ingest/EmbeddingModelField.tsx` | Add `compact` prop; render segmented control in compact mode, full picker in expanded "More…" panel |
| `studio/src/components/ingest/FilesTab.tsx` | Merge toggle into label row; use `<EmbeddingModelField compact>`; move incremental next to Start; remove embedding model from Advanced |
| `studio/src/components/ingest/SQLiteTab.tsx` | Same as FilesTab; Advanced keeps columns/ID column/row template only |

## Out of scope

- Sharing collection name / embedding model state between tabs (each tab remains independent)
- Any changes to the progress log, alerts, or done banner
- Any changes to the IngestPane tab switcher
