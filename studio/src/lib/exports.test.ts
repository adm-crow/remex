import { describe, it, expect } from "vitest";
import { toBibTeX, toRIS, toCSLJson, toObsidianVault } from "./exports";

const results = [
  { source: "/docs/intro.md", chunk: 0, score: 0.912, text: "hello world" },
  { source: "/docs/api.md",   chunk: 1, score: 0.734, text: "an api reference" },
] as any;

describe("exports", () => {
  it("toBibTeX produces one @misc entry per result", () => {
    const out = toBibTeX(results, "what is this");
    expect(out.match(/@misc\{/g)?.length).toBe(2);
    expect(out).toContain("intro_0");
  });

  it("toRIS produces ER terminators", () => {
    const out = toRIS(results, "q");
    expect(out.match(/^ER {2}- $/gm)?.length).toBe(2);
  });

  it("toCSLJson is valid JSON array", () => {
    const parsed = JSON.parse(toCSLJson(results, "q"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toHaveProperty("id");
  });

  it("toObsidianVault builds a folder with README and per-result notes", () => {
    const files = toObsidianVault(results, "semantic search");
    const keys = Object.keys(files);
    expect(keys.some((k) => k.endsWith("/README.md"))).toBe(true);
    expect(keys.filter((k) => k.endsWith(".md")).length).toBe(3);
  });
});
