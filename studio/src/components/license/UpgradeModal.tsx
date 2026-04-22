import { Crown, Check } from "lucide-react";
import { open } from "@tauri-apps/plugin-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app";

// One SKU. Price changes ship in a Studio release (see spec §Pricing).
const PRO_PRICE = "29€";
const CHECKOUT_URL =
  "https://getremex.lemonsqueezy.com/checkout/buy/6ade10f8-4f82-4f77-b139-c8b798629cae?checkout%5Bcustom%5D%5Bsource%5D=studio-in-app";

const PRO_BULLETS = [
  "Pro embedding models (bge-large, e5-large, nomic)",
  "Advanced exports: BibTeX, RIS, CSL-JSON, Obsidian vault",
  "Watch-folder auto-ingest",
  "Unlimited searchable query history",
  "Eight extra accent themes + Pro badge",
  "Aurora & network homepage backgrounds",
  "Priority email support (48 h SLA)",
];

export function UpgradeModal() {
  const { upgradeModalOpen, closeUpgradeModal, requestLicensePrompt } = useAppStore();

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
          {PRO_BULLETS.map((b) => (
            <li key={b} className="flex gap-2 text-sm">
              <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <p className="text-xs text-muted-foreground border-t pt-3">
          Remex is built and maintained by a solo developer. Your purchase directly
          funds ongoing development — thank you for supporting independent software. 🙏
        </p>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => void open(CHECKOUT_URL)?.catch((err) => console.error("[UpgradeModal] Failed to open URL:", err))}>
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
