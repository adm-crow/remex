import { useEffect } from "react";
import type { View } from "@/components/layout/Sidebar";

interface UseKeyboardShortcutsOptions {
  onViewChange: (v: View) => void;
  focusSearch: () => void;
  onShowShortcuts?: () => void;
}

/**
 * Registers global keyboard shortcuts for pane navigation and search focus.
 * All callbacks should be stable references (e.g. from `useCallback`) to avoid
 * re-registering the event listener on every render.
 */
export function useKeyboardShortcuts({
  onViewChange,
  focusSearch,
  onShowShortcuts,
}: UseKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore when typing in an input/textarea/contenteditable
      const tag = (e.target as HTMLElement).tagName;
      const isEditable =
        tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;

      if (e.ctrlKey && !e.shiftKey && e.key === "k") {
        e.preventDefault();
        onViewChange("query");
        focusSearch();
        return;
      }
      if (e.ctrlKey && e.shiftKey) {
        switch (e.key.toUpperCase()) {
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
        return;
      }
      // ? — show keyboard shortcuts (only when not typing)
      if (!isEditable && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "?") {
        e.preventDefault();
        onShowShortcuts?.();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onViewChange, focusSearch, onShowShortcuts]);
}
