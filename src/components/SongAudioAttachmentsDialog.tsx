import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SongAudioAttachments } from "@/components/SongAudioAttachments";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string;
  songTitle: string;
  isDark?: boolean;
  onPlaybackStart?: () => void;
}

export function SongAudioAttachmentsDialog({ open, onOpenChange, songId, songTitle, isDark, onPlaybackStart }: Props) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={`w-[calc(100%-2rem)] max-w-lg max-h-[85dvh] overflow-y-auto rounded-2xl bg-background text-foreground ${isDark ? "dark" : ""}`}>
      <DialogHeader>
        <DialogTitle className="pr-5 break-words">{songTitle}</DialogTitle>
        <DialogDescription>Ouça os materiais de apoio desta música.</DialogDescription>
      </DialogHeader>
      {open && <SongAudioAttachments key={songId} songId={songId} onPlaybackStart={onPlaybackStart} />}
    </DialogContent>
  </Dialog>;
}
