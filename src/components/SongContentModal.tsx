import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
      <DialogContent className="max-w-none w-screen h-screen m-0 p-0 rounded-none border-none flex flex-col bg-background [&>button.absolute]:hidden">
        <VisuallyHidden>
          <DialogTitle>{title}</DialogTitle>
        </VisuallyHidden>
        <Tabs defaultValue={defaultTab} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
            <h2 className="text-sm font-semibold truncate mr-4">{title}</h2>
            <div className="flex items-center gap-3">
              <TabsList>
                <TabsTrigger value="cifra">Cifra</TabsTrigger>
                <TabsTrigger value="lyrics">Letra</TabsTrigger>
              </TabsList>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <TabsContent value="cifra" className="flex-1 overflow-auto m-0 p-4">
            <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {cifraText || "Nenhuma cifra disponível."}
            </pre>
          </TabsContent>

          <TabsContent value="lyrics" className="flex-1 overflow-auto m-0 p-4">
            <pre className="font-mono text-sm leading-relaxed whitespace-pre-wrap">
              {lyricsText || "Nenhuma letra disponível."}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
