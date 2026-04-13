import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragDrop } from "./useDragDrop";

// getCurrentWindow is mocked in setup.ts, but we need to capture the handler
// so we can simulate drag-drop events.

let registeredHandler: ((event: any) => void) | undefined;

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn((handler: (event: any) => void) => {
      registeredHandler = handler;
      return Promise.resolve(() => {});
    }),
  }),
}));

beforeEach(() => {
  registeredHandler = undefined;
});

describe("useDragDrop", () => {
  it("isDragging is false initially", () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    expect(result.current.isDragging).toBe(false);
  });

  it("isDragging becomes true on enter event", async () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    await act(async () => {});
    act(() => {
      registeredHandler?.({ payload: { type: "enter", paths: [] } });
    });
    expect(result.current.isDragging).toBe(true);
  });

  it("isDragging becomes false on leave event", async () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    await act(async () => {});
    act(() => {
      registeredHandler?.({ payload: { type: "enter", paths: [] } });
    });
    act(() => {
      registeredHandler?.({ payload: { type: "leave", paths: [] } });
    });
    expect(result.current.isDragging).toBe(false);
  });

  it("calls onDrop with first path on drop event", async () => {
    const onDrop = vi.fn();
    renderHook(() => useDragDrop(onDrop));
    await act(async () => {});
    act(() => {
      registeredHandler?.({ payload: { type: "drop", paths: ["/my/folder", "/other"] } });
    });
    expect(onDrop).toHaveBeenCalledWith("/my/folder");
  });

  it("does not call onDrop when drop paths is empty", async () => {
    const onDrop = vi.fn();
    renderHook(() => useDragDrop(onDrop));
    await act(async () => {});
    act(() => {
      registeredHandler?.({ payload: { type: "drop", paths: [] } });
    });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("isDragging becomes false on drop event", async () => {
    const { result } = renderHook(() => useDragDrop(vi.fn()));
    await act(async () => {});
    act(() => {
      registeredHandler?.({ payload: { type: "enter", paths: [] } });
    });
    act(() => {
      registeredHandler?.({ payload: { type: "drop", paths: ["/some/path"] } });
    });
    expect(result.current.isDragging).toBe(false);
  });
});
