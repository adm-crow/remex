import { useEffect } from "react";
import type { View } from "@/components/layout/Sidebar";

interface UseKeyboardShortcutsOptions {
  onViewChange: (v: View) => void;
  focusSearch: () => void;
}

/**
 * Registers global keyboard shortcuts for pane navigation and search focus.
 * `onViewChange` and `focusSearch` should be stable references (e.g. from
 * `useCallback`) to avoid re-registering the event listener on every render.
 */
export function useKeyboardShortcuts({
  onViewChange,
  focusSearch,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && e.key === "k") {
        e.preventDefault();
        onViewChange("query");
        focusSearch();
        return;
      }
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key) {
          case "Q":
            e.preventDefault();
            onViewChange("query");
            break;
          case "I":
            e.preventDefault();
            onViewChange("ingest");
            break;
          case "C":
            e.preventDefault();
            onViewChange("collections");
            break;
          case "S":
            e.preventDefault();
            onViewChange("settings");
            break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onViewChange, focusSearch]);
}
