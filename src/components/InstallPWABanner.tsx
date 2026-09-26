import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, X } from "lucide-react";
import { useState } from "react";
import { BrandMark } from "@/components/BrandMark";

/**
 * Convite flutuante para instalar o PWA. É um controle da camada funcional,
 * então usa Liquid Glass espesso (tem texto: HIG > Materials pede a variante mais opaca).
 */
export function InstallPWABanner() {
  const { canInstall, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  return (
    <div className="fixed inset-x-4 bottom-[max(env(safe-area-inset-bottom),16px)] z-50 animate-in-up">
      <div className="liquid-glass-thick mx-auto flex max-w-sm items-center gap-3 rounded-[28px] py-2 pl-2 pr-2">
        <div className="relative z-[4] flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-prominent dark:bg-card dark:ring-1 dark:ring-inset dark:ring-white/10">
          <BrandMark className="h-6 w-6 text-prominent-foreground" />
        </div>
        <div className="relative z-[4] min-w-0 flex-1">
          <p className="truncate text-headline">Instalar +Louvor</p>
          <p className="truncate text-footnote text-muted-foreground">Acesse direto da tela inicial</p>
        </div>
        <button
          type="button"
          onClick={install}
          className="relative z-[4] inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-prominent px-3.5 text-subhead font-semibold text-prominent-foreground transition-transform active:scale-[0.97] before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
        >
          <Download className="h-[15px] w-[15px]" strokeWidth={2.25} aria-hidden="true" />
          Instalar
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Fechar"
          className="relative z-[4] flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-fill-tertiary"
        >
          <X className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
