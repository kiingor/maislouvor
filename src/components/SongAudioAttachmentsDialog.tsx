import { Dialog, DialogContent, DialogDescription, DialogToolbar } from "@/components/ui/dialog";
import { SongAudioAttachments } from "@/components/SongAudioAttachments";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  songTitle: string;
  isDark?: boolean;
  onPlaybackStart?: () => void;
}

/**
 * Folha só de consulta com os áudios adicionais da música (sem Confirmar: só Fechar).
 * `isDark` reaplica o tema da Apresentação no portal, que fica fora da árvore dela.
 */
export function SongAudioAttachmentsDialog({ open, onOpenChange, songId, songTitle, isDark, onPlaybackStart }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {/* Tema escuro local: a folha só troca --card no escuro quando .dark é ancestral; aqui a
        classe fica no próprio conteúdo, então o cinza terciário dos grupos vem junto. */}
    <DialogContent className={cn("text-foreground", isDark && "dark [--card:240_3%_17%]")}>
      {/* Barra = o que a folha é; a música vai no subtítulo, então a seção esconde o próprio título. */}
      <DialogToolbar title="Áudios adicionais" />
      <DialogDescription className="-mt-1 break-words text-center">{songTitle}</DialogDescription>
      {open && <SongAudioAttachments key={songId} songId={songId} onPlaybackStart={onPlaybackStart} hideHeading />}
    </DialogContent>
  </Dialog>;
}
