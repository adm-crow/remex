import { describe, it, expect } from "vitest";
import { formatDuration } from "./formatDuration";

describe("formatDuration", () => {
  it("shows milliseconds under 1 second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("shows seconds from 1 000 ms up to 59 999 ms", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(1499)).toBe("1s");   // rounds to 1s
    expect(formatDuration(1500)).toBe("2s");   // rounds to 2s
    expect(formatDuration(45000)).toBe("45s");
    expect(formatDuration(59499)).toBe("59s");
  });

  it("shows whole minutes when remainder is zero", () => {
    expect(formatDuration(60000)).toBe("1min");
    expect(formatDuration(120000)).toBe("2min");
    expect(formatDuration(600000)).toBe("10min");
  });

  it("shows minutes and seconds when remainder is non-zero", () => {
    expect(formatDuration(61000)).toBe("1min 1s");
    expect(formatDuration(125000)).toBe("2min 5s");
    expect(formatDuration(3661000)).toBe("61min 1s");
  });
});
