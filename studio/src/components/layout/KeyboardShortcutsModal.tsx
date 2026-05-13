import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "Navigation",
    items: [
      { keys: ["Ctrl", "Shift", "Q"], description: "Query pane" },
      { keys: ["Ctrl", "Shift", "I"], description: "Ingest pane" },
      { keys: ["Ctrl", "Shift", "C"], description: "Collections pane" },
      { keys: ["Ctrl", "Shift", "S"], description: "Settings pane" },
    ],
  },
  {
    group: "Search",
    items: [
      { keys: ["Ctrl", "K"], description: "Focus search input" },
      { keys: ["/"], description: "Focus search (from any pane)" },
      { keys: ["Esc"], description: "Clear search / close" },
    ],
  },
  {
    group: "Help",
    items: [
      { keys: ["?"], description: "Show this shortcuts reference" },
    ],
  },
];

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 rounded border border-border bg-muted text-xs font-mono font-medium text-muted-foreground min-w-[1.4rem]">
      {children}
    </kbd>
  );
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsModal({ open, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {SHORTCUTS.map(({ group, items }) => (
            <div key={group}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group}
              </p>
              <div className="space-y-2">
                {items.map(({ keys, description }) => (
                  <div key={description} className="flex items-center justify-between gap-4">
                    <span className="text-sm text-foreground">{description}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {keys.map((k, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <Kbd>{k}</Kbd>
                          {i < keys.length - 1 && (
                            <span className="text-xs text-muted-foreground">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
