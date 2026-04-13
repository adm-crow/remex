import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Listens to the Tauri OS-level drag-drop event for the main window.
 * Calls onDrop with the first dropped path whenever a drop occurs.
 * Returns isDragging so callers can show a visual indicator.
 */
export function useDragDrop(onDrop: (path: string) => void): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false);
  // Use a ref so the effect never needs to re-register when onDrop changes.
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cleaned = false;

    getCurrentWindow()
      .onDragDropEvent((event) => {
        const payload = event.payload;
        if (payload.type === "enter") {
          setIsDragging(true);
        } else if (payload.type === "leave") {
          setIsDragging(false);
        } else if (payload.type === "drop") {
          setIsDragging(false);
          if (payload.paths.length > 0) {
            onDropRef.current(payload.paths[0]);
          }
        }
      })
      .then((fn) => {
        if (cleaned) fn(); // immediately call unlisten if already cleaned up
        else unlisten = fn;
      });

    return () => {
      cleaned = true;
      unlisten?.();
    };
  }, []); // empty — onDropRef keeps callback fresh without re-subscribing

  return { isDragging };
}
