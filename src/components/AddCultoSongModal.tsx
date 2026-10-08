import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Music, Search, Check, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cultoId: string;
}

// Lista agrupada dentro da folha (protótipo `.group`).
// Na folha, --card já vira branco (claro) / #2C2C2E (escuro) — ver ui/dialog.tsx.
const group = "overflow-hidden rounded-card bg-card";
// Separador recuado até o texto (16 + ícone 30 + 12).
const iconRowSeparator = "before:absolute before:top-0 before:right-0 before:left-[58px] before:border-t before:border-border";

export function AddCultoSongModal({ open, onOpenChange, cultoId }: Props) {
  const { currentTeam } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  // Fetch only songs that are in a repertório of this team
  const { data: allSongs = [], isLoading } = useQuery({
    queryKey: ["team-repertorio-songs", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      // Get all repertorio IDs for this team
      const { data: reps } = await supabase
        .from("repertorios")
        .select("id")
        .eq("team_id", currentTeam.id);
      if (!reps || reps.length === 0) return [];

      const repIds = reps.map((r: any) => r.id);

      // Get song IDs from repertorio_songs
      const { data: repSongs } = await supabase
        .from("repertorio_songs")
        .select("song_id")
        .in("repertorio_id", repIds);
      if (!repSongs || repSongs.length === 0) return [];

      const uniqueSongIds = [...new Set(repSongs.map((rs: any) => rs.song_id))];

      // Fetch the actual songs
      const { data: songs } = await supabase
        .from("songs")
        .select("id, title, artist, key_current, cover_path, tags, theme")
        .in("id", uniqueSongIds)
        .order("title");
      return songs ?? [];
    },
    enabled: !!currentTeam && open,
    staleTime: 0,
  });

  // Fetch songs already in this culto
  const { data: existingSongs = [] } = useQuery({
    queryKey: ["culto-song-ids", cultoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_songs")
        .select("song_id")
        .eq("culto_id", cultoId);
      return (data ?? []).map((cs: any) => cs.song_id);
    },
    enabled: open,
  });

  const filtered = allSongs.filter((s: any) => {
    const q = search.toLowerCase();
    return (s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q));
  });

  const addSong = async (songId: string) => {
    setAdding(songId);
    const { data: maxOrder } = await supabase
      .from("culto_songs")
      .select("sort_order")
      .eq("culto_id", cultoId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    const nextOrder = (maxOrder?.sort_order ?? -1) + 1;
    const { error } = await supabase.from("culto_songs").insert({
      culto_id: cultoId,
      song_id: songId,
      sort_order: nextOrder,
    });

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Música adicionada!" });
      qc.invalidateQueries({ queryKey: ["culto-songs", cultoId] });
      qc.invalidateQueries({ queryKey: ["culto-song-ids", cultoId] });
    }
    setAdding(null);
  };

  const chip = "inline-flex max-w-full items-center truncate rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar música ao culto</DialogTitle>
        </DialogHeader>

        {/* Busca no repertório da equipe */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground"
              strokeWidth={2.25}
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="Buscar música..."
              aria-label="Buscar música"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-full bg-fill-tertiary pl-9 pr-4 text-body text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ios-blue/40"
            />
          </div>
        </div>

        {/* Song list */}
        <div className="min-h-0 flex-1 overflow-y-auto max-h-[55vh] rounded-card">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando" />
            </div>
          ) : filtered.length === 0 ? (
            <div className={`${group} flex flex-col items-center gap-2 px-6 py-8 text-center`}>
              <Music className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
              <p className="text-body text-muted-foreground">
                {search ? "Nenhuma música encontrada." : "Nenhuma música no repertório geral."}
              </p>
            </div>
          ) : (
            <ul className={group}>
              {filtered.map((song: any, i: number) => {
                const isAdded = existingSongs.includes(song.id);
                return (
                  <li key={song.id} className={`relative flex min-h-[60px] items-center gap-3 px-4 py-2.5 ${i > 0 ? iconRowSeparator : ""}`}>
                    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary" aria-hidden="true">
                      <Music className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-foreground">{song.title}</p>
                      {song.artist && <p className="truncate text-footnote text-muted-foreground">{song.artist}</p>}
                      {(song.key_current || song.theme || (song.tags && song.tags.length > 0) || isAdded) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {song.key_current && <span className={`${chip} font-semibold text-foreground`}>{song.key_current}</span>}
                          {song.theme && <span className={chip}>{song.theme}</span>}
                          {song.tags?.map((tag: string, i: number) => (
                            <span key={i} className={chip}>{tag}</span>
                          ))}
                          {isAdded && (
                            <span
                              className="inline-flex items-center gap-0.5 text-caption1 text-muted-foreground"
                              title="Já está no roteiro — adicione de novo para repetir na sequência"
                            >
                              <Check className="h-3 w-3 text-ios-green" strokeWidth={2.5} aria-hidden="true" /> no culto
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isAdded ? "secondary" : "outline"}
                      className="shrink-0"
                      disabled={adding === song.id}
                      onClick={() => addSong(song.id)}
                    >
                      {adding === song.id ? (
                        <Loader2 className="animate-spin" aria-label="Adicionando" />
                      ) : isAdded ? (
                        "Repetir"
                      ) : (
                        "Adicionar"
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
