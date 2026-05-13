import { useEffect, useRef, useState } from "react";
import { Crown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useAppStore } from "@/store/app";
import { cn } from "@/lib/utils";
import { ProBadge } from "./ProBadge";

const Card = ({ children, className, id, cardRef }: {
  children: React.ReactNode; className?: string; id?: string;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}) => (
  <div ref={cardRef} id={id} className={cn("rounded-xl border bg-primary/10 border-primary/30 p-3 space-y-3", className)}>
    {children}
  </div>
);

function relative(ts: number | null): string {
  if (!ts) return "—";
  const diffDays = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 30) return `${diffDays}d ago`;
  const months = Math.floor(diffDays / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

export function LicenseCard() {
  const { license, activateLicense, deactivateLicense, revalidateLicense, openUpgradeModal, licensePromptSeq } = useAppStore();
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (licensePromptSeq === 0 || license.tier === "pro") return;
    setShowPaste(true);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Defer focus until after the paste input mounts.
    requestAnimationFrame(() => {
      (document.getElementById("license-paste") as HTMLInputElement | null)?.focus();
    });
  }, [licensePromptSeq, license.tier]);

  async function handleActivate() {
    setBusy(true);
    setError(null);
    const r = await activateLicense(paste.trim());
    setBusy(false);
    if (r.ok) {
      setPaste("");
      setShowPaste(false);
    } else {
      setError(r.error ?? "Activation failed.");
    }
  }

  async function handleDeactivate() {
    setBusy(true);
    await deactivateLicense();
    setBusy(false);
    setConfirmOpen(false);
  }

  if (license.tier === "pro") {
    return (
      <Card className="space-y-3" id="license-card">
        <div className="flex items-center gap-2">
          <Crown className="w-3.5 h-3.5 text-primary" />
          <h2 className="font-semibold text-sm">Remex Pro</h2>
          <ProBadge className="ml-auto" />
        </div>
        <div className="space-y-1 text-xs">
          <p><span className="text-muted-foreground">Licensed to</span> <span className="font-mono">{license.email ?? "—"}</span></p>
          <p className="text-muted-foreground">
            Activated {relative(license.activatedAt)} · last checked {relative(license.lastValidatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1"
                  onClick={() => void revalidateLicense()} disabled={busy}>
            Check license now
          </Button>
          <Button size="sm" variant="ghost" className="text-destructive"
                  onClick={() => setConfirmOpen(true)} disabled={busy}>
            Deactivate this machine
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Deactivate on this machine?</DialogTitle>
              <DialogDescription>
                Your Pro features will be disabled. You can reactivate any time with the same key.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setConfirmOpen(false)}>Cancel</Button>
              <Button variant="destructive" className="flex-1" onClick={() => void handleDeactivate()} disabled={busy}>
                Deactivate
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>
    );
  }

  return (
    <Card id="license-card" cardRef={cardRef} className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Crown className="w-3.5 h-3.5 text-primary" />
        <h2 className="font-semibold text-sm">Remex Pro</h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Unlock advanced exports, watch-folder auto-ingest, bigger embedding models, and more.
      </p>
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={() => openUpgradeModal("generic")}>
          Upgrade to Pro · 29€
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowPaste((v) => !v)}>
          I already have a key
        </Button>
      </div>
      {showPaste && (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="license-paste" className="text-xs text-muted-foreground">License key</Label>
          <div className="flex gap-1.5">
            <Input
              id="license-paste"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="h-8 font-mono text-xs"
              aria-label="License key"
            />
            <Button size="sm" onClick={() => void handleActivate()} disabled={busy || !paste.trim()}>
              Activate
            </Button>
          </div>
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-destructive pt-1">
              <X className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
