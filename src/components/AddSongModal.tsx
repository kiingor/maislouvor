import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Music, Globe, Loader2, ListMusic, Search } from "lucide-react";

interface AddSongModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando presente, a música criada/selecionada é vinculada a este repertório.
   *  Quando ausente/null, a música é só criada na biblioteca da equipe (sem vínculo). */
  repertorioId?: string | null;
}

export function AddSongModal({ open, onOpenChange, repertorioId }: AddSongModalProps) {
  const navigate = useNavigate();
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  const inRepertorio = !!repertorioId;
  const [mode, setMode] = useState<"choose" | "search" | "manual" | "import">("choose");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  // Busca de músicas já cadastradas (só faz sentido quando vinculando a um repertório)
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reset = () => { setMode("choose"); setTitle(""); setUrl(""); setLoading(false); setSearch(""); setSelected(new Set()); };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const invalidateLists = () => {
    if (repertorioId) qc.invalidateQueries({ queryKey: ["repertorio-songs", repertorioId] });
    qc.invalidateQueries({ queryKey: ["library-songs"] });
    qc.invalidateQueries({ queryKey: ["dashboard-songs"] });
  };

  // Próximo sort_order do repertório (para anexar no fim)
  const nextSortOrder = async (repId: string) => {
    const { data } = await supabase
      .from("repertorio_songs")
      .select("sort_order")
      .eq("repertorio_id", repId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    return ((data as any)?.sort_order ?? -1) + 1;
  };

  const createSong = async (songData: { title: string; artist?: string | null; key_original?: string | null; key_current?: string | null; cifra_text?: string | null }) => {
    if (!currentTeam) return null;

    const { data: song, error } = await supabase
      .from("songs")
      .insert([{ team_id: currentTeam.id, created_by: profileId, title: songData.title, artist: songData.artist, key_original: songData.key_original, key_current: songData.key_current, cifra_text: songData.cifra_text }])
      .select("id")
      .single();

    if (error || !song) {
      toast({ title: "Erro ao criar música", description: error?.message, variant: "destructive" });
      return null;
    }

    if (repertorioId) {
      await supabase.from("repertorio_songs").insert({
        repertorio_id: repertorioId,
        song_id: song.id,
        sort_order: await nextSortOrder(repertorioId),
      });
    }

    invalidateLists();
    return song.id;
  };

  const handleManual = async () => {
    if (!title.trim()) return;
    setLoading(true);
    const songId = await createSong({ title: title.trim() });
    setLoading(false);
    if (songId) {
      handleClose(false);
      navigate(`/app/songs/${songId}`);
    }
  };

  const handleImport = async () => {
    if (!url.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("import-cifra", { body: { url: url.trim() } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Falha na importação");
      const parsed = data.data;
      const songId = await createSong({
        title: parsed.title || "Sem título",
        artist: parsed.artist || null,
        key_original: parsed.key_original || null,
        key_current: parsed.key_original || null,
        cifra_text: parsed.cifra_text || null,
      });
      setLoading(false);
      if (songId) {
        toast({ title: "Música importada com sucesso!" });
        handleClose(false);
        navigate(`/app/songs/${songId}`);
      }
    } catch (e: any) {
      setLoading(false);
      toast({ title: "Erro na importação", description: e.message, variant: "destructive" });
    }
  };

  // ===== Modo "Buscar cadastradas": biblioteca da equipe + quais já estão neste repertório =====
  const { data: lib, isLoading: libLoading } = useQuery({
    queryKey: ["add-song-search", currentTeam?.id, repertorioId],
    queryFn: async () => {
      if (!currentTeam) return { songs: [], already: new Set<string>() };
      const [{ data: songs }, { data: links }] = await Promise.all([
        supabase
          .from("songs")
          .select("id, title, artist, key_current, cover_path, theme, tags")
          .eq("team_id", currentTeam.id)
          .order("title"),
        supabase.from("repertorio_songs").select("song_id").eq("repertorio_id", repertorioId!),
      ]);
      return { songs: songs ?? [], already: new Set((links ?? []).map((l: any) => l.song_id)) };
    },
    enabled: open && mode === "search" && inRepertorio && !!currentTeam,
    staleTime: 0,
  });

  const filteredLib = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = lib?.songs ?? [];
    if (!q) return all;
    return all.filter((s: any) =>
      s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q)
    );
  }, [lib?.songs, search]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAddSelected = async () => {
    if (!repertorioId || selected.size === 0) return;
    setLoading(true);
    try {
      let order = await nextSortOrder(repertorioId);
      const rows = [...selected]
        .filter((sid) => !lib?.already.has(sid))
        .map((sid) => ({ repertorio_id: repertorioId, song_id: sid, sort_order: order++ }));
      if (rows.length > 0) {
        const { error } = await supabase.from("repertorio_songs").insert(rows);
        if (error) throw error;
      }
      invalidateLists();
      toast({ title: rows.length === 1 ? "Música adicionada" : `${rows.length} músicas adicionadas` });
      handleClose(false);
    } catch (e: any) {
      toast({ title: "Erro ao adicionar", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const newSelectedCount = [...selected].filter((sid) => !lib?.already.has(sid)).length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass sm:rounded-2xl border-0">
        <DialogHeader>
          <DialogTitle>
            {mode === "choose"
              ? (inRepertorio ? "Adicionar música" : "Nova música")
              : mode === "search"
              ? "Buscar músicas cadastradas"
              : mode === "manual"
              ? "Criar manualmente"
              : "Importar do Cifra Club"}
          </DialogTitle>
        </DialogHeader>

        {mode === "choose" && (
          <div className="grid gap-3 pt-2">
            {inRepertorio && (
              <button
                onClick={() => setMode("search")}
                className="flex items-center gap-4 p-4 rounded-xl glass-subtle hover-lift text-left transition-all"
              >
                <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                  <ListMusic className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Buscar cadastradas</p>
                  <p className="text-xs text-muted-foreground">Escolha músicas já existentes na sua biblioteca</p>
                </div>
              </button>
            )}
            <button
              onClick={() => setMode("manual")}
              className="flex items-center gap-4 p-4 rounded-xl glass-subtle hover-lift text-left transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                <Music className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Criar nova</p>
                <p className="text-xs text-muted-foreground">Preencha título, cifra e detalhes</p>
              </div>
            </button>
            <button
              onClick={() => setMode("import")}
              className="flex items-center gap-4 p-4 rounded-xl glass-subtle hover-lift text-left transition-all"
            >
              <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Importar do Cifra Club</p>
                <p className="text-xs text-muted-foreground">Cole o link e importe automaticamente</p>
              </div>
            </button>
          </div>
        )}

        {mode === "search" && (
          <div className="space-y-3 pt-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <GlassInput
                placeholder="Buscar por título ou artista…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            <ScrollArea className="h-[300px] -mx-1 px-1">
              {libLoading ? (
                <div className="space-y-2">{[1, 2, 3, 4].map((i) => <div key={i} className="h-12 rounded-xl glass-subtle animate-pulse" />)}</div>
              ) : filteredLib.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {search.trim() ? "Nenhuma música encontrada." : "Nenhuma música cadastrada ainda."}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filteredLib.map((s: any) => {
                    const already = lib?.already.has(s.id);
                    const checked = already || selected.has(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-center gap-3 rounded-xl glass-subtle px-3 py-2.5 ${already ? "opacity-50" : "cursor-pointer hover-lift"}`}
                      >
                        <Checkbox checked={checked} disabled={already} onCheckedChange={() => toggleSelect(s.id)} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.title}</p>
                          {s.artist && <p className="text-xs text-muted-foreground truncate">{s.artist}</p>}
                        </div>
                        {already && <span className="text-[10px] text-muted-foreground shrink-0">já no repertório</span>}
                        {s.key_current && !already && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent text-muted-foreground shrink-0">{s.key_current}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setMode("choose")} disabled={loading}>
                Voltar
              </Button>
              <Button className="rounded-xl" onClick={handleAddSelected} disabled={newSelectedCount === 0 || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Adicionar{newSelectedCount > 0 ? ` (${newSelectedCount})` : ""}
              </Button>
            </div>
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-4 pt-2">
            <GlassInput placeholder="Nome da música" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setMode("choose")}>Voltar</Button>
              <Button className="rounded-xl" onClick={handleManual} disabled={!title.trim() || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Criar
              </Button>
            </div>
          </div>
        )}

        {mode === "import" && (
          <div className="space-y-4 pt-2">
            <GlassInput placeholder="https://www.cifraclub.com.br/..." value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
            {loading && (
              <div className="flex items-center gap-3 p-4 rounded-xl glass-subtle">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Importando do Cifra Club...</span>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => setMode("choose")} disabled={loading}>Voltar</Button>
              <Button className="rounded-xl" onClick={handleImport} disabled={!url.trim() || loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Importar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
