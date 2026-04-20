import { Crown, Check } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";

// One SKU. Price changes ship in a Studio release (see spec §Pricing).
const PRO_PRICE = "29€";
const CHECKOUT_URL =
  "https://getremex.lemonsqueezy.com/checkout/buy/6ade10f8-4f82-4f77-b139-c8b798629cae?checkout%5Bcustom%5D%5Bsource%5D=studio-in-app";

const BULLETS_BY_CONTEXT: Record<string, string[]> = {
  generic: [
    "Pro embedding models (bge-large, e5-large, nomic)",
    "Advanced exports: BibTeX, RIS, CSL-JSON, Obsidian vault",
    "Watch-folder auto-ingest",
    "Unlimited searchable query history",
    "Eight extra accent themes + Pro badge",
    "Priority email support (48 h SLA)",
  ],
  "embedding-model": [
    "Pro-size embedding models (bge-large, e5-large, nomic)",
    "Better retrieval quality on long-form documents",
    "All other Pro features included",
  ],
  theme: [
    "Eight additional accent colours",
    "Pro badge in the sidebar",
    "All other Pro features included",
  ],
  "watch-folder": [
    "Watch-folder auto-ingest: Studio re-ingests changes automatically",
    "Unlimited searchable query history",
    "Advanced exports and bigger embedding models included",
  ],
  export: [
    "Export to BibTeX, RIS, CSL-JSON, or an Obsidian vault folder",
    "Unlimited searchable query history",
    "All other Pro features included",
  ],
};

export function UpgradeModal() {
  const { upgradeModalOpen, upgradeModalContext, closeUpgradeModal, requestLicensePrompt } = useAppStore();
  const bullets = BULLETS_BY_CONTEXT[upgradeModalContext ?? "generic"] ?? BULLETS_BY_CONTEXT.generic;

  return (
    <Dialog open={upgradeModalOpen} onOpenChange={(v) => !v && closeUpgradeModal()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-4 h-4 text-primary" />
            Upgrade to Remex Pro
          </DialogTitle>
          <DialogDescription>
            One-time {PRO_PRICE}. Lifetime updates on the v1.x line. No subscription.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2 text-sm">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => open(CHECKOUT_URL)}>
            Buy Pro · {PRO_PRICE}
          </Button>
          <Button variant="outline" onClick={() => {
            closeUpgradeModal();
            requestLicensePrompt();
          }}>
            I already have a key
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
