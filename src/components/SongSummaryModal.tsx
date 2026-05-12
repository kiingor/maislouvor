import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { SongContentModal } from "@/components/SongContentModal";
import { Music, FileText, Youtube, Volume2, ChevronRight, MessageSquare } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

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
  const [mediaOpen, setMediaOpen] = useState<"audio" | "video" | null>(null);

  useEffect(() => {
    if (!open) setMediaOpen(null);
  }, [open]);

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
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl">
          <VisuallyHidden>
            <DialogTitle>{song.title}</DialogTitle>
          </VisuallyHidden>

          {/* Cover + Info card */}
          <div className="p-5 pb-4">
            <div className="flex gap-4 items-start">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={song.title}
                  className="h-24 w-24 rounded-xl object-cover shrink-0"
                />
              ) : (
                <div className="h-24 w-24 rounded-xl bg-accent flex items-center justify-center shrink-0">
                  <Music className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold leading-tight">{song.title}</h2>
                {song.artist && (
                  <p className="text-sm text-muted-foreground mt-0.5">{song.artist}</p>
                )}
                {repertorios.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {repertorios.map((name: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">
                        {name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Info details */}
            {(song.key_original || song.key_current || song.theme || (song.tags && song.tags.length > 0)) && (
              <div className="mt-4 p-3 rounded-xl bg-accent/50 space-y-2">
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {song.key_original && (
                    <div>
                      <span className="text-muted-foreground text-xs">Tom original</span>
                      <p className="font-medium">{song.key_original}</p>
                    </div>
                  )}
                  {song.key_current && (
                    <div>
                      <span className="text-muted-foreground text-xs">Tom atual</span>
                      <p className="font-medium">{song.key_current}</p>
                    </div>
                  )}
                  {song.theme && (
                    <div>
                      <span className="text-muted-foreground text-xs">Tema</span>
                      <p className="font-medium">{song.theme}</p>
                    </div>
                  )}
                </div>
                {song.tags && song.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {song.tags.map((tag: string, i: number) => (
                      <span key={i} className="text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Culto Notes */}
            {cultoNotes && (
              <div className="mt-4 p-3 rounded-xl bg-accent/50">
                <div className="flex items-center gap-2 mb-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Observação</span>
                </div>
                <p className="text-sm leading-relaxed">{cultoNotes}</p>
                {cultoNotesAuthor?.full_name && (
                  <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
                    <Avatar className="h-5 w-5">
                      {cultoNotesAuthor.avatar_url && <AvatarImage src={cultoNotesAuthor.avatar_url} />}
                      <AvatarFallback className="text-[8px] bg-accent">
                        {cultoNotesAuthor.full_name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[11px] text-muted-foreground">por {cultoNotesAuthor.full_name}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Menu list */}
          <div className="border-t border-border">
            {menuItems.map((item) => (
              <button
                key={item.key}
                disabled={!item.available}
                onClick={item.onClick}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-accent/60 disabled:opacity-40 disabled:cursor-not-allowed border-b border-border last:border-b-0"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-left">{item.label}</span>
                {item.available && <ChevronRight className="h-4 w-4 text-muted-foreground/60" />}
              </button>
            ))}
          </div>
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

      {/* Audio popup */}
      <Dialog open={mediaOpen === "audio"} onOpenChange={(o) => !o && setMediaOpen(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogTitle className="text-base font-semibold">{song.title} — Áudio</DialogTitle>
          {audioUrl && (
            <audio controls autoPlay className="w-full mt-2" src={audioUrl} preload="metadata" />
          )}
        </DialogContent>
      </Dialog>

      {/* Video popup */}
      <Dialog open={mediaOpen === "video"} onOpenChange={(o) => !o && setMediaOpen(null)}>
        <DialogContent className="max-w-lg rounded-2xl p-0 overflow-hidden">
          <VisuallyHidden>
            <DialogTitle>{song.title} — Vídeo</DialogTitle>
          </VisuallyHidden>
          {youtubeId && (
            <AspectRatio ratio={16 / 9}>
              <iframe
                src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="YouTube"
              />
            </AspectRatio>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
