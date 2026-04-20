import type { QueryResultItem } from "@/api/client";

const pad = (n: number) => String(n).padStart(2, "0");
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function citeKey(source: string, idx: number): string {
  const base = source.split(/[/\\]/).pop() ?? "source";
  const stem = base.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "_");
  return `${stem}_${idx}`;
}

export function toBibTeX(results: QueryResultItem[], query: string): string {
  return results.map((r, i) => {
    const key = citeKey(r.source, i);
    const title = r.source.split(/[/\\]/).pop() ?? r.source;
    const note = r.text.replace(/[{}]/g, "").replace(/\s+/g, " ").slice(0, 500);
    return [
      `@misc{${key},`,
      `  title       = {${title}},`,
      `  note        = {Score: ${r.score.toFixed(3)}; Query: ${query.replace(/[{}]/g, "")}},`,
      `  annotation  = {${note}},`,
      `  year        = {${new Date().getFullYear()}}`,
      `}`,
    ].join("\n");
  }).join("\n\n");
}

export function toRIS(results: QueryResultItem[], query: string): string {
  return results.map((r) => {
    const title = r.source.split(/[/\\]/).pop() ?? r.source;
    return [
      `TY  - GEN`,
      `TI  - ${title}`,
      `AB  - ${r.text.replace(/\n/g, " ").slice(0, 2000)}`,
      `N1  - Remex semantic search; score ${r.score.toFixed(3)}; query "${query}"`,
      `PY  - ${new Date().getFullYear()}`,
      `UR  - ${r.source}`,
      `ER  - `,
    ].join("\n");
  }).join("\n\n");
}

export function toCSLJson(results: QueryResultItem[], query: string): string {
  const items = results.map((r, i) => ({
    id:                citeKey(r.source, i),
    type:              "document",
    title:             r.source.split(/[/\\]/).pop() ?? r.source,
    "abstract":        r.text.slice(0, 2000),
    note:              `score=${r.score.toFixed(3)}; query=${query}`,
    issued:            { "date-parts": [[new Date().getFullYear()]] },
    URL:               r.source,
  }));
  return JSON.stringify(items, null, 2);
}

/** Build an in-memory Obsidian vault: one index file plus one note per result. */
export function toObsidianVault(results: QueryResultItem[], query: string): Record<string, string> {
  const safeQuery = query.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80);
  const date      = today();
  const folder    = `Remex — ${safeQuery} — ${date}`;
  const files: Record<string, string> = {};
  files[`${folder}/README.md`] = [
    `# ${safeQuery}`,
    ``,
    `Exported from Remex on ${date}.`,
    ``,
    `## Results`,
    ...results.map((r, i) => `- [[${citeKey(r.source, i)}]] — ${r.source}`),
  ].join("\n");
  results.forEach((r, i) => {
    const key = citeKey(r.source, i);
    files[`${folder}/${key}.md`] = [
      `---`,
      `source: ${r.source}`,
      `score: ${r.score.toFixed(3)}`,
      `chunk: ${r.chunk ?? ""}`,
      `query: ${query}`,
      `---`,
      ``,
      r.text,
    ].join("\n");
  });
  return files;
}
