import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { X } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

interface SongContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cifraText: string;
  lyricsText: string;
  title: string;
  defaultTab?: "cifra" | "lyrics";
}

/** Cifra/letra em tela cheia. Fonte monoespaçada para os acordes ficarem alinhados sobre a letra. */
export function SongContentModal({
  open,
  onOpenChange,
  cifraText,
  lyricsText,
  title,
  defaultTab = "cifra",
}: SongContentModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="fullscreen" hideClose className="gap-0 overflow-hidden px-0 pb-0">
        <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden>
        <Tabs defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-4">
            <ToolbarButton icon={<X strokeWidth={2.4} />} aria-label="Fechar" onClick={() => onOpenChange(false)} />
            <h2 className="truncate text-center text-headline text-foreground" aria-hidden="true">{title}</h2>
            <span aria-hidden="true" />
          </div>
          <div className="flex justify-center px-4 pb-3 pt-3">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="cifra">Cifra</TabsTrigger>
              <TabsTrigger value="lyrics">Letra</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="cifra"
            className="m-0 min-h-0 flex-1 overflow-auto rounded-none px-4 pb-[max(env(safe-area-inset-bottom),16px)]"
          >
            <pre className="whitespace-pre-wrap font-mono text-[15px] leading-relaxed text-foreground">
              {cifraText || "Nenhuma cifra disponível."}
            </pre>
          </TabsContent>

          <TabsContent
            value="lyrics"
            className="m-0 min-h-0 flex-1 overflow-auto rounded-none px-4 pb-[max(env(safe-area-inset-bottom),16px)]"
          >
            <pre className="whitespace-pre-wrap font-mono text-[15px] leading-relaxed text-foreground">
              {lyricsText || "Nenhuma letra disponível."}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
