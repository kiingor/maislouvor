import { ReportContentButton } from "@/components/moderation/ReportContentButton";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SongContentModal } from "@/components/SongContentModal";
import { SongAudioAttachmentsDialog } from "@/components/SongAudioAttachmentsDialog";
import { Music, FileText, Youtube, Volume2, ChevronRight, MessageSquare, Headphones } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

// Lista agrupada dentro da folha (protótipo `.group` / `.group-label`).
const group = "overflow-hidden rounded-card bg-card";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const row = "relative flex min-h-[48px] items-center gap-3 px-4";
const rowSeparator = "before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border";
// Separador recuado até o texto (16 + ícone 30 + 12).
const iconRowSeparator = "before:absolute before:top-0 before:right-0 before:left-[58px] before:border-t before:border-border";

interface SongSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  songId: string | null;
  cultoNotes?: string | null;
  cultoNotesAuthor?: { full_name: string | null; avatar_url: string | null } | null;
}

export function SongSummaryModal({ open, onOpenChange, songId, cultoNotes, cultoNotesAuthor }: SongSummaryModalProps) {
  const [contentOpen, setContentOpen] = useState(false);
  const [contentTab, setContentTab] = useState<"cifra" | "lyrics">("cifra");
  const [mediaOpen, setMediaOpen] = useState<"audio" | "video" | "additional" | null>(null);

  useEffect(() => {
    if (!open) setMediaOpen(null);
  }, [open]);

  useEffect(() => { setMediaOpen(null); }, [songId]);

  const { data: song } = useQuery({
    queryKey: ["song-summary", songId],
    queryFn: async () => {
      const { data } = await supabase.from("songs").select("*").eq("id", songId!).single();
      return data;
    },
    enabled: !!songId && open,
  });

  const { data: repertorios = [] } = useQuery({
    queryKey: ["song-repertorios-summary", songId],
    queryFn: async () => {
      const { data } = await supabase.from("repertorio_songs").select("repertorios(name)").eq("song_id", songId!);
      return (data ?? []).map((r: any) => r.repertorios?.name).filter(Boolean);
    },
    enabled: !!songId && open,
  });

  const { data: coverUrl } = useQuery({
    queryKey: ["cover-url", song?.cover_path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("covers").createSignedUrl(song!.cover_path!, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: !!song?.cover_path,
  });

  const { data: audioUrl } = useQuery({
    queryKey: ["audio-url", song?.audio_path],
    queryFn: async () => {
      const { data } = await supabase.storage.from("audio").createSignedUrl(song!.audio_path!, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: !!song?.audio_path,
  });

  const youtubeId = song?.media_url?.match(/(?:youtu\.be\/|v=)([\w-]{11})/)?.[1];

  if (!song) return null;

  const menuItems = [
    {
      key: "cifra",
      label: "Cifra",
      icon: FileText,
      available: !!song.cifra_text,
      onClick: () => { setContentTab("cifra"); setContentOpen(true); },
    },
    {
      key: "letra",
      label: "Letra",
      icon: FileText,
      available: !!song.lyrics_text,
      onClick: () => { setContentTab("lyrics"); setContentOpen(true); },
    },
    {
      key: "audio",
      label: "Áudio",
      icon: Volume2,
      available: !!audioUrl,
      onClick: () => setMediaOpen("audio"),
    },
    {
      key: "video",
      label: "Vídeo",
      icon: Youtube,
      available: !!youtubeId,
      onClick: () => setMediaOpen("video"),
    },
    {
      key: "additional",
      label: "Áudios adicionais",
      icon: Headphones,
      available: true,
      onClick: () => setMediaOpen("additional"),
    },
  ];

  const infoRows = [
    song.key_original ? { label: "Tom original", value: song.key_original } : null,
    song.key_current ? { label: "Tom atual", value: song.key_current } : null,
    song.theme ? { label: "Tema", value: song.theme } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const hasTags = !!(song.tags && song.tags.length > 0);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md gap-5">
          <VisuallyHidden>
            <DialogTitle>{song.title}</DialogTitle>
          </VisuallyHidden>

          {/* Capa + título (centralizados, como no app Música) */}
          <div data-dialog-header="" className="flex flex-col items-center px-10 text-center max-sm:touch-none">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={song.title}
                className="h-24 w-24 shrink-0 rounded-[16px] object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[16px] bg-fill-tertiary">
                <Music className="h-8 w-8 text-muted-foreground" strokeWidth={2} aria-hidden="true" />
              </div>
            )}
            <h2 className="mt-3 text-title3 text-foreground break-words">{song.title}</h2>
            {song.artist && <p className="mt-0.5 text-subhead text-muted-foreground">{song.artist}</p>}
            {repertorios.length > 0 && (
              <div className="mt-2 flex flex-wrap justify-center gap-1">
                {repertorios.map((name: string, i: number) => (
                  <span key={i} className="rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 font-medium text-muted-foreground">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Info details */}
          {(infoRows.length > 0 || hasTags) && (
            <div className={group}>
              {infoRows.map((r, i) => (
                <div key={r.label} className={`${row} justify-between ${i > 0 ? rowSeparator : ""}`}>
                  <span className="text-body text-foreground">{r.label}</span>
                  <span className="min-w-0 truncate text-body text-muted-foreground">{r.value}</span>
                </div>
              ))}
              {hasTags && (
                <div className={`relative flex flex-wrap gap-1.5 px-4 py-3 ${infoRows.length > 0 ? rowSeparator : ""}`}>
                  {song.tags.map((tag: string, i: number) => (
                    <span key={i} className="rounded-full bg-fill-tertiary px-2.5 py-0.5 text-footnote font-medium text-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Culto Notes */}
          {cultoNotes && (
            <div>
              <p className={`${groupLabel} flex items-center gap-1.5`}>
                <MessageSquare className="h-[13px] w-[13px]" strokeWidth={2.25} aria-hidden="true" /> Observação
              </p>
              <div className={group}>
                <p className="px-4 py-3 text-body text-foreground whitespace-pre-line break-words">{cultoNotes}</p>
                {cultoNotesAuthor?.full_name && (
                  <div className={`${row} min-h-[40px] gap-2 py-2 ${rowSeparator}`}>
                    <Avatar className="h-5 w-5">
                      {cultoNotesAuthor.avatar_url && <AvatarImage src={cultoNotesAuthor.avatar_url} />}
                      <AvatarFallback className="text-caption2">
                        {cultoNotesAuthor.full_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-footnote text-muted-foreground">por {cultoNotesAuthor.full_name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Menu list */}
          <div className={group}>
            {menuItems.map((item, i) => (
              <button
                key={item.key}
                type="button"
                disabled={!item.available}
                onClick={item.onClick}
                className={`relative flex w-full min-h-[52px] items-center gap-3 px-4 py-2 text-left transition-colors active:bg-fill-tertiary disabled:cursor-not-allowed disabled:opacity-40 ${
                  i > 0 ? iconRowSeparator : ""
                }`}
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary" aria-hidden="true">
                  <item.icon className="h-4 w-4 text-foreground" strokeWidth={2.25} />
                </span>
                <span className="flex-1 text-body text-foreground">{item.label}</span>
                {item.available && (
                  <ChevronRight className="h-[14px] w-[14px] text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                )}
              </button>
            ))}
          </div>
          <ReportContentButton songId={song.id} />
        </DialogContent>
      </Dialog>

      {/* Cifra/Letra fullscreen */}
      <SongContentModal
        open={contentOpen}
        onOpenChange={setContentOpen}
        cifraText={song.cifra_text || ""}
        lyricsText={song.lyrics_text || ""}
        title={song.title}
        defaultTab={contentTab}
      />

      {/* Additional recordings */}
      <SongAudioAttachmentsDialog
        open={open && mediaOpen === "additional"}
        onOpenChange={(o) => !o && setMediaOpen(null)}
        songId={song.id}
        songTitle={song.title}
      />

      {/* Audio popup */}
      <Dialog open={mediaOpen === "audio"} onOpenChange={(o) => !o && setMediaOpen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate">{song.title} — Áudio</DialogTitle>
          </DialogHeader>
          {audioUrl && (
            <audio controls autoPlay className="w-full" src={audioUrl} preload="metadata" />
          )}
        </DialogContent>
      </Dialog>

      {/* Video popup */}
      <Dialog open={mediaOpen === "video"} onOpenChange={(o) => !o && setMediaOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="truncate">{song.title} — Vídeo</DialogTitle>
          </DialogHeader>
          {youtubeId && (
            <div className="overflow-hidden rounded-[16px] bg-fill-tertiary">
              <AspectRatio ratio={16 / 9}>
                <iframe
                  src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube"
                />
              </AspectRatio>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
