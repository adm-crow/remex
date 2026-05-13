import { Search, Bot, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAppStore } from "@/store/app";

export function OnboardingModal() {
  const { onboardingDone, setOnboardingDone } = useAppStore();

  if (onboardingDone) return null;

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <div className="flex flex-col items-center gap-4 py-2 text-center">
          <img src="/remex.svg" alt="" aria-hidden="true" className="h-12 w-6 select-none" draggable={false} />
          <div className="space-y-1">
            <DialogTitle className="text-lg font-semibold">Welcome to Remex Studio</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Unleash the power of your files with local AI.
            </p>
          </div>
          <ol className="text-left space-y-3 w-full text-sm">
            <li className="flex items-start gap-3">
              <span className="size-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-semibold">1</span>
              <div>
                <p className="font-medium">Open or create a project</p>
                <p className="text-xs text-muted-foreground">Use the sidebar to pick a database folder.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="size-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-semibold">2</span>
              <div>
                <p className="font-medium flex items-center gap-1.5">
                  <Search className="w-3.5 h-3.5 text-muted-foreground" /> Ingest your documents
                </p>
                <p className="text-xs text-muted-foreground">Files, folders, or SQLite databases.</p>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="size-5 rounded-full bg-primary/15 text-primary text-xs flex items-center justify-center shrink-0 mt-0.5 font-semibold">3</span>
              <div>
                <p className="font-medium flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-muted-foreground" /> Search or ask the AI
                </p>
                <p className="text-xs text-muted-foreground">Semantic search or AI answers using your data.</p>
              </div>
            </li>
          </ol>
          <Button className="w-full gap-2" onClick={() => setOnboardingDone(true)}>
            Get Started
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
