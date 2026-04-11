import "@testing-library/jest-dom";
import { vi } from "vitest";

// Node.js v25+ provides a built-in localStorage via --localstorage-file, but
// without a backing file path it lacks standard methods like .clear().
// Replace it with a fully-compliant in-memory implementation so tests work.
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

Object.defineProperty(globalThis, "localStorage", {
  value: createLocalStorageMock(),
  writable: true,
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

// Radix UI uses scrollIntoView in Select/Popover; jsdom doesn't implement it
Element.prototype.scrollIntoView = vi.fn();
