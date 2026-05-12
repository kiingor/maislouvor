import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function InstallPWABanner() {
  const { canInstall, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 z-50 animate-in-up">
      <div className="glass rounded-2xl p-4 flex items-center gap-3 max-w-sm mx-auto shadow-lg border border-border/50">
        <div className="h-10 w-10 rounded-xl bg-foreground flex items-center justify-center shrink-0">
          <span className="text-background text-xs font-bold">+L</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Instalar +Louvor</p>
          <p className="text-xs text-muted-foreground">Acesse direto da tela inicial</p>
        </div>
        <Button
          size="sm"
          className="rounded-xl gap-1.5 shrink-0"
          onClick={install}
        >
          <Download className="h-3.5 w-3.5" />
          Instalar
        </Button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg hover:bg-accent transition-colors shrink-0"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
