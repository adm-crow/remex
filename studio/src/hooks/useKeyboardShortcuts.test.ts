import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function fire(key: string, ctrlKey = false, shiftKey = false) {
  fireEvent.keyDown(window, { key, ctrlKey, shiftKey });
}

describe("useKeyboardShortcuts", () => {
  it("Ctrl+Shift+Q calls onViewChange('query')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("Q", true, true);
    expect(onViewChange).toHaveBeenCalledWith("query");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+I calls onViewChange('ingest')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("I", true, true);
    expect(onViewChange).toHaveBeenCalledWith("ingest");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+C calls onViewChange('collections')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("C", true, true);
    expect(onViewChange).toHaveBeenCalledWith("collections");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+S calls onViewChange('settings')", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("S", true, true);
    expect(onViewChange).toHaveBeenCalledWith("settings");
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("Ctrl+K calls onViewChange('query') and focusSearch()", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("k", true, false);
    expect(onViewChange).toHaveBeenCalledWith("query");
    expect(focusSearch).toHaveBeenCalled();
  });

  it("unrelated keys do not call any callback", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("a", false, false);
    fire("Enter", false, false);
    fire("Q", false, false); // no ctrl
    expect(onViewChange).not.toHaveBeenCalled();
    expect(focusSearch).not.toHaveBeenCalled();
  });

  it("cleans up the event listener on unmount", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardShortcuts({ onViewChange, focusSearch })
    );
    unmount();
    fire("Q", true, true);
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("uses the latest onViewChange callback after rerender", () => {
    const first = vi.fn();
    const second = vi.fn();
    const focusSearch = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: typeof first }) =>
        useKeyboardShortcuts({ onViewChange: cb, focusSearch }),
      { initialProps: { cb: first } }
    );
    rerender({ cb: second });
    fire("Q", true, true);
    expect(second).toHaveBeenCalledWith("query");
    expect(first).not.toHaveBeenCalled();
  });

  it("Ctrl+Shift+K does not trigger any shortcut", () => {
    const onViewChange = vi.fn();
    const focusSearch = vi.fn();
    renderHook(() => useKeyboardShortcuts({ onViewChange, focusSearch }));
    fire("k", true, true); // ctrlKey + shiftKey + "k"
    expect(onViewChange).not.toHaveBeenCalled();
    expect(focusSearch).not.toHaveBeenCalled();
  });
});
