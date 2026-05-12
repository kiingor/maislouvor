import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Music, Search, Check, Loader2, Sparkles, ArrowLeft } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cultoId: string;
}

interface AISuggestion {
  songId: string;
  title: string;
  artist: string | null;
  key: string | null;
  theme: string | null;
  tags: string[] | null;
  reason: string;
}

export function AddCultoSongModal({ open, onOpenChange, cultoId }: Props) {
  const { currentTeam } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState<string | null>(null);

  // AI mode states
  const [showAI, setShowAI] = useState(false);
  const [liturgy, setLiturgy] = useState("");
  const [songCount, setSongCount] = useState(5);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addingBulk, setAddingBulk] = useState(false);

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
        .select("id, title, artist, key_current, cover_path, tags, theme, lyrics_text")
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

  const generateSuggestions = async () => {
    if (!liturgy.trim()) {
      toast({ title: "Informe a liturgia do culto", variant: "destructive" });
      return;
    }
    if (allSongs.length === 0) {
      toast({ title: "Nenhuma música no repertório", variant: "destructive" });
      return;
    }

    setAiLoading(true);
    setSuggestions([]);
    setSelected(new Set());

    try {
      const songsPayload = allSongs.map((s: any) => ({
        id: s.id,
        title: s.title,
        artist: s.artist,
        key: s.key_current,
        theme: s.theme,
        tags: s.tags,
        lyrics: s.lyrics_text || "",
      }));

      const { data, error } = await supabase.functions.invoke("suggest-culto-songs", {
        body: { liturgy, songCount, songs: songsPayload },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const results: AISuggestion[] = data.suggestions || [];
      setSuggestions(results);
      setSelected(new Set(results.map((s) => s.songId)));
      if (results.length === 0) {
        toast({ title: "Nenhuma música encontrada", description: "Não há músicas no repertório que se encaixem nesse tema.", variant: "destructive" });
      }
    } catch (err: any) {
      console.error("AI suggestion error:", err);
      toast({ title: "Erro ao gerar sugestões", description: err.message, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const toggleSelect = (songId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  };

  const addSelectedSongs = async () => {
    const toAdd = suggestions.filter((s) => selected.has(s.songId) && !existingSongs.includes(s.songId));
    if (toAdd.length === 0) {
      toast({ title: "Nenhuma música nova para adicionar" });
      return;
    }

    setAddingBulk(true);
    const { data: maxOrder } = await supabase
      .from("culto_songs")
      .select("sort_order")
      .eq("culto_id", cultoId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();

    let nextOrder = (maxOrder?.sort_order ?? -1) + 1;

    const inserts = toAdd.map((s) => ({
      culto_id: cultoId,
      song_id: s.songId,
      sort_order: nextOrder++,
    }));

    const { error } = await supabase.from("culto_songs").insert(inserts);

    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${toAdd.length} música(s) adicionada(s)!` });
      qc.invalidateQueries({ queryKey: ["culto-songs", cultoId] });
      qc.invalidateQueries({ queryKey: ["culto-song-ids", cultoId] });
      setShowAI(false);
      setSuggestions([]);
    }
    setAddingBulk(false);
  };

  const resetAI = () => {
    setShowAI(false);
    setSuggestions([]);
    setSelected(new Set());
    setLiturgy("");
    setSongCount(5);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) resetAI(); }}>
      <DialogContent className="glass sm:rounded-2xl border-0 max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {showAI ? (
              <div className="flex items-center gap-2">
                <button onClick={resetAI} className="p-1 rounded-lg hover:bg-accent transition-colors">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <Sparkles className="h-4 w-4 text-primary" />
                Ajuda com IA
              </div>
            ) : (
              "Adicionar música ao culto"
            )}
          </DialogTitle>
        </DialogHeader>

        {!showAI ? (
          <>
            {/* Search + AI button */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <GlassInput
                  placeholder="Buscar música..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant="outline"
                className="rounded-xl gap-1.5 shrink-0"
                onClick={() => setShowAI(true)}
              >
                <Sparkles className="h-3.5 w-3.5" />
                IA
              </Button>
            </div>

            {/* Song list */}
            <div className="flex-1 overflow-y-auto space-y-1 mt-2 min-h-0 max-h-[50vh]">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">
                    {search ? "Nenhuma música encontrada." : "Nenhuma música no repertório geral."}
                  </p>
                </div>
              ) : (
                filtered.map((song: any) => {
                  const isAdded = existingSongs.includes(song.id);
                  return (
                    <div
                      key={song.id}
                      className="flex items-center gap-3 p-3 rounded-xl glass-subtle hover-lift transition-all"
                    >
                      <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <Music className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{song.title}</p>
                        {song.artist && <p className="text-xs text-muted-foreground truncate">{song.artist}</p>}
                        {((song.tags && song.tags.length > 0) || song.theme) && (
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {song.theme && (
                              <span className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{song.theme}</span>
                            )}
                            {song.tags?.map((tag: string, i: number) => (
                              <span key={i} className="text-[9px] font-medium bg-accent text-muted-foreground px-1.5 py-0.5 rounded-full">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      {song.key_current && (
                        <span className="text-[10px] font-bold bg-accent px-1.5 py-0.5 rounded">{song.key_current}</span>
                      )}
                      {isAdded ? (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Check className="h-3.5 w-3.5 text-green-500" /> Adicionada
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-lg text-xs h-7"
                          disabled={adding === song.id}
                          onClick={() => addSong(song.id)}
                        >
                          {adding === song.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Adicionar"}
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          /* AI Mode */
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {suggestions.length === 0 ? (
              /* Input form */
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Liturgia do culto</label>
                  <GlassInput
                    placeholder="Ex: Adoração e Gratidão, Natal, Santa Ceia..."
                    value={liturgy}
                    onChange={(e) => setLiturgy(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Quantidade de músicas</label>
                  <GlassInput
                    type="number"
                    min={1}
                    max={20}
                    value={songCount}
                    onChange={(e) => setSongCount(parseInt(e.target.value) || 1)}
                  />
                </div>
                <Button
                  className="w-full rounded-xl gap-2"
                  onClick={generateSuggestions}
                  disabled={aiLoading || !liturgy.trim()}
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analisando músicas...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Gerar sugestões
                    </>
                  )}
                </Button>
                {aiLoading && (
                  <p className="text-xs text-muted-foreground text-center">
                    A IA está analisando {allSongs.length} músicas do seu repertório...
                  </p>
                )}
              </div>
            ) : (
              /* Results */
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {suggestions.length} sugestão(ões) • {selected.size} selecionada(s)
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => {
                      if (selected.size === suggestions.length) {
                        setSelected(new Set());
                      } else {
                        setSelected(new Set(suggestions.map((s) => s.songId)));
                      }
                    }}
                  >
                    {selected.size === suggestions.length ? "Desmarcar todas" : "Selecionar todas"}
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[40vh]">
                  {suggestions.map((s, idx) => {
                    const isAdded = existingSongs.includes(s.songId);
                    return (
                      <div
                        key={s.songId}
                        className={`flex items-start gap-3 p-3 rounded-xl glass-subtle transition-all ${
                          isAdded ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2 pt-0.5">
                          <span className="text-xs font-bold text-muted-foreground w-4 text-right">
                            {idx + 1}
                          </span>
                          <Checkbox
                            checked={selected.has(s.songId)}
                            onCheckedChange={() => toggleSelect(s.songId)}
                            disabled={isAdded}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.title}</p>
                          {s.artist && (
                            <p className="text-xs text-muted-foreground truncate">{s.artist}</p>
                          )}
                          <p className="text-xs text-primary/80 mt-1 line-clamp-2">{s.reason}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {s.key && (
                              <span className="text-[9px] font-bold bg-accent px-1.5 py-0.5 rounded">{s.key}</span>
                            )}
                            {s.theme && (
                              <span className="text-[9px] font-medium bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{s.theme}</span>
                            )}
                          </div>
                          {isAdded && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-1">
                              <Check className="h-3 w-3 text-green-500" /> Já adicionada
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 rounded-xl"
                    onClick={() => { setSuggestions([]); setSelected(new Set()); }}
                  >
                    Refazer
                  </Button>
                  <Button
                    className="flex-1 rounded-xl gap-2"
                    onClick={addSelectedSongs}
                    disabled={addingBulk || selected.size === 0}
                  >
                    {addingBulk ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>Adicionar {selected.size}</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
