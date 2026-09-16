import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { SongCard } from "@/components/SongCard";
import { AddSongModal } from "@/components/AddSongModal";
import { SetlistGeneratorModal } from "@/components/SetlistGeneratorModal";
import { RepertorioBulkBar } from "@/components/RepertorioBulkBar";
import { Button } from "@/components/ui/button";
import { GlassInput } from "@/components/GlassInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Music, Plus, Search, Trash2, X, Share2, Loader2, MonitorPlay, GripVertical, Tags, CheckCircle2, CheckSquare, Sparkles } from "lucide-react";

export default function RepertorioDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useTeam();
  const canEdit = can("repertorios", "editar");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addSongOpen, setAddSongOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterKey, setFilterKey] = useState<string>("");
  const [filterTheme, setFilterTheme] = useState<string>("");
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [readyOnly, setReadyOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ rsId: string; songTitle: string } | null>(null);
  const [sharing, setSharing] = useState(false);

  // Selection mode (bulk actions)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedRsIds, setSelectedRsIds] = useState<string[]>([]);

  // Drag reorder
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const { data: repertorio, isLoading } = useQuery({
    queryKey: ["repertorio", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("repertorios")
        .select("*, public_token, is_public")
        .eq("id", id!)
        .single();
      return data;
    },
    enabled: !!id,
  });

  const { data: songs = [] } = useQuery({
    queryKey: ["repertorio-songs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("repertorio_songs")
        .select("*, songs(id, title, artist, key_current, cover_path, tags, theme, audio_path, cifra_text)")
        .eq("repertorio_id", id!)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!id,
  });

  // Distinct tags across the songs in this repertório
  const allTags = useMemo(() => {
    const set = new Set<string>();
    songs.forEach((rs: any) => (rs.songs?.tags || []).forEach((t: string) => t && set.add(t)));
    return [...set].sort();
  }, [songs]);

  const filtersActive = !!search || !!filterKey || !!filterTheme || filterTags.length > 0 || readyOnly;

  const filtered = useMemo(() => {
    return songs.filter((rs: any) => {
      const s = rs.songs;
      if (!s) return true;
      const matchSearch =
        !search ||
        s.title?.toLowerCase().includes(search.toLowerCase()) ||
        s.artist?.toLowerCase().includes(search.toLowerCase());
      const matchKey = !filterKey || s.key_current === filterKey;
      const matchTheme = !filterTheme || s.theme === filterTheme;
      const matchTags = filterTags.length === 0 || filterTags.every((t) => (s.tags || []).includes(t));
      const matchReady = !readyOnly || (!!s.cifra_text && !!s.audio_path);
      return matchSearch && matchKey && matchTheme && matchTags && matchReady;
    });
  }, [songs, search, filterKey, filterTheme, filterTags, readyOnly]);

  const toggleTag = (tag: string) => {
    setFilterTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const toggleSelect = (rsId: string) => {
    setSelectedRsIds((prev) => (prev.includes(rsId) ? prev.filter((x) => x !== rsId) : [...prev, rsId]));
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedRsIds([]);
  };

  // ---- Drag reorder (mirrors CultoDetail). Disabled when filters active or in selection mode. ----
  const dragEnabled = canEdit && !selectionMode && !filtersActive;

  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOverIdx(idx);
  };
  const handleDrop = async (idx: number) => {
    if (dragIdx === null || dragIdx === idx) {
      setDragIdx(null);
      setOverIdx(null);
      return;
    }
    const items = [...songs];
    const [moved] = items.splice(dragIdx, 1);
    items.splice(idx, 0, moved);

    // Optimistically reflect the new order, then persist sort_order.
    queryClient.setQueryData(["repertorio-songs", id], items);
    const updates = items.map((rs: any, i: number) =>
      supabase.from("repertorio_songs").update({ sort_order: i } as any).eq("id", rs.id)
    );
    await Promise.all(updates);
    queryClient.invalidateQueries({ queryKey: ["repertorio-songs", id] });

    setDragIdx(null);
    setOverIdx(null);
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  if (isLoading) {
    return (
      <div className="animate-in-up space-y-4">
        <div className="h-8 w-48 bg-accent rounded-lg animate-pulse" />
        <GlassCard className="h-32 animate-pulse" />
      </div>
    );
  }

  if (!repertorio) {
    return (
      <div className="animate-in-up text-center py-16">
        <p className="text-muted-foreground">Repertório não encontrado.</p>
        <Button variant="outline" className="mt-4 rounded-xl" onClick={() => navigate("/app/repertorios")}>
          Voltar
        </Button>
      </div>
    );
  }

  const selectedSongIds = songs
    .filter((rs: any) => selectedRsIds.includes(rs.id))
    .map((rs: any) => rs.song_id ?? rs.songs?.id)
    .filter(Boolean);

  return (
    <div className="animate-in-up pb-24">
      <div className="mb-8">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => navigate("/app/repertorios")}
              aria-label="Voltar"
              title="Voltar"
              className="shrink-0 -ml-1.5 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate">{repertorio.name}</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Criado em {new Date(repertorio.created_at).toLocaleDateString("pt-BR")}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 justify-end shrink-0">
            {songs.length > 0 && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl sm:hidden h-9 w-9"
                  onClick={() => navigate(`/app/repertorios/${id}/present`)}
                  title="Iniciar ensaio"
                >
                  <MonitorPlay className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl gap-2 hidden sm:inline-flex"
                  onClick={() => navigate(`/app/repertorios/${id}/present`)}
                >
                  <MonitorPlay className="h-4 w-4" /> Ensaio
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl h-9 w-9"
              disabled={sharing}
              onClick={async () => {
                if (!repertorio) return;
                setSharing(true);
                try {
                  let publicToken = (repertorio as any).public_token;
                  if (!(repertorio as any).is_public || !publicToken) {
                    publicToken = crypto.randomUUID();
                    const { error } = await supabase
                      .from("repertorios")
                      .update({ is_public: true, public_token: publicToken } as any)
                      .eq("id", repertorio.id);
                    if (error) throw error;
                    queryClient.invalidateQueries({ queryKey: ["repertorio", id] });
                  }
                  const url = `${window.location.origin}/playlist/${publicToken}`;
                  await navigator.clipboard.writeText(url);
                  toast({ title: "Link copiado!", description: "Compartilhe com quem quiser." });
                } catch {
                  toast({ title: "Erro ao compartilhar", variant: "destructive" });
                } finally {
                  setSharing(false);
                }
              }}
            >
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
            </Button>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  size="icon"
                  className="rounded-xl sm:hidden h-9 w-9"
                  onClick={() => setGenerateOpen(true)}
                  title="Gerar setlist"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl gap-2 hidden sm:inline-flex"
                  onClick={() => setGenerateOpen(true)}
                >
                  <Sparkles className="h-4 w-4" /> Gerar setlist
                </Button>
                <Button onClick={() => setAddSongOpen(true)} size="icon" className="rounded-xl sm:hidden h-9 w-9">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button onClick={() => setAddSongOpen(true)} className="rounded-xl gap-2 hidden sm:inline-flex">
                  <Plus className="h-4 w-4" /> Adicionar música
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filters + selection toggle */}
      {songs.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <GlassInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar música ou artista..."
                className="pl-9"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
            <Select value={filterKey || "all"} onValueChange={(v) => setFilterKey(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-32 rounded-xl">
                <SelectValue placeholder="Tom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tons</SelectItem>
                {[...new Set(songs.map((rs: any) => rs.songs?.key_current).filter(Boolean))].sort().map((k: string) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterTheme || "all"} onValueChange={(v) => setFilterTheme(v === "all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-36 rounded-xl">
                <SelectValue placeholder="Tema" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os temas</SelectItem>
                {[...new Set(songs.map((rs: any) => rs.songs?.theme).filter(Boolean))].sort().map((t: string) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tag filter + ready toggle + selection mode */}
          <div className="flex flex-wrap items-center gap-2">
            {allTags.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
                    <Tags className="h-3.5 w-3.5" />
                    Tags
                    {filterTags.length > 0 && (
                      <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                        {filterTags.length}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[calc(100vw-2rem)] max-w-[14rem] p-2">
                  <p className="text-xs text-muted-foreground px-1 pb-1.5">Filtrar por tag</p>
                  <div className="space-y-0.5 max-h-60 overflow-auto">
                    {allTags.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent transition-colors text-sm"
                      >
                        <Checkbox checked={filterTags.includes(tag)} className="pointer-events-none" />
                        <span className="truncate">{tag}</span>
                      </button>
                    ))}
                  </div>
                  {filterTags.length > 0 && (
                    <Button variant="ghost" size="sm" className="w-full mt-1 rounded-lg" onClick={() => setFilterTags([])}>
                      Limpar tags
                    </Button>
                  )}
                </PopoverContent>
              </Popover>
            )}

            <Button
              variant={readyOnly ? "default" : "outline"}
              size="sm"
              className="rounded-xl gap-1.5"
              onClick={() => setReadyOnly((v) => !v)}
              title="Música com cifra e áudio"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Pronta pra tocar
            </Button>

            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl gap-1.5 text-muted-foreground"
                onClick={() => { setSearch(""); setFilterKey(""); setFilterTheme(""); setFilterTags([]); setReadyOnly(false); }}
              >
                <X className="h-3.5 w-3.5" /> Limpar filtros
              </Button>
            )}

            {canEdit && (
              <Button
                variant={selectionMode ? "default" : "outline"}
                size="sm"
                className="rounded-xl gap-1.5 sm:ml-auto"
                onClick={() => (selectionMode ? exitSelection() : setSelectionMode(true))}
              >
                <CheckSquare className="h-3.5 w-3.5" /> {selectionMode ? "Cancelar seleção" : "Selecionar"}
              </Button>
            )}
          </div>

          {dragEnabled && songs.length > 1 && (
            <p className="text-[11px] text-muted-foreground">Arraste as músicas para reordenar.</p>
          )}
        </div>
      )}

      {songs.length === 0 ? (
        <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <Music className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Nenhuma música</h3>
          <p className="text-muted-foreground text-sm max-w-xs">
            {canEdit ? "Adicione músicas a este repertório." : "Nenhuma música foi adicionada ainda."}
          </p>
          {canEdit && (
            <div className="mt-6 flex gap-2">
              <Button className="rounded-xl gap-2" onClick={() => setAddSongOpen(true)}>
                <Plus className="h-4 w-4" /> Adicionar música
              </Button>
              <Button variant="outline" className="rounded-xl gap-2" onClick={() => setGenerateOpen(true)}>
                <Sparkles className="h-4 w-4" /> Gerar setlist
              </Button>
            </div>
          )}
        </GlassCard>
      ) : filtered.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Nenhuma música encontrada com os filtros aplicados.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rs: any, idx: number) => {
            const s = rs.songs;
            const isSelected = selectedRsIds.includes(rs.id);
            return (
              <div
                key={rs.id}
                draggable={dragEnabled}
                onDragStart={dragEnabled ? handleDragStart(idx) : undefined}
                onDragOver={dragEnabled ? handleDragOver(idx) : undefined}
                onDrop={dragEnabled ? () => handleDrop(idx) : undefined}
                onDragEnd={dragEnabled ? handleDragEnd : undefined}
                className={`relative group rounded-xl transition-all ${
                  dragIdx === idx ? "opacity-40" : ""
                } ${overIdx === idx && dragIdx !== idx ? "ring-2 ring-primary/40 ring-offset-1" : ""}`}
              >
                <div className="flex items-center gap-2">
                  {dragEnabled && (
                    <div className="shrink-0 cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors">
                      <GripVertical className="h-4 w-4" />
                    </div>
                  )}
                  {selectionMode && (
                    <div className="shrink-0 pl-1">
                      <Checkbox checked={isSelected} onCheckedChange={() => toggleSelect(rs.id)} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <SongCard
                      song={s || { id: rs.song_id, title: "—" }}
                      index={idx}
                      onClick={
                        selectionMode
                          ? () => toggleSelect(rs.id)
                          : () => navigate(`/app/songs/${s?.id || rs.song_id}`)
                      }
                      actions={
                        canEdit && !selectionMode ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget({ rsId: rs.id, songTitle: s?.title || "esta música" });
                            }}
                            className="shrink-0 p-2 rounded-xl bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 hover:bg-destructive/20 transition-all"
                            title="Remover do repertório"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : undefined
                      }
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectionMode && selectedRsIds.length > 0 && (
        <RepertorioBulkBar
          selectedRsIds={selectedRsIds}
          selectedSongIds={selectedSongIds}
          currentRepertorioId={id!}
          onClearSelection={exitSelection}
          onDone={exitSelection}
        />
      )}

      <AddSongModal open={addSongOpen} onOpenChange={setAddSongOpen} repertorioId={id!} />
      <SetlistGeneratorModal open={generateOpen} onOpenChange={setGenerateOpen} repertorioId={id!} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover música</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover <strong>{deleteTarget?.songTitle}</strong> deste repertório? A música não será excluída do sistema, apenas removida do repertório.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                const { error } = await supabase
                  .from("repertorio_songs")
                  .delete()
                  .eq("id", deleteTarget.rsId);
                if (error) {
                  toast({ title: "Erro", description: "Não foi possível remover a música.", variant: "destructive" });
                } else {
                  toast({ title: "Música removida do repertório" });
                  queryClient.invalidateQueries({ queryKey: ["repertorio-songs", id] });
                }
                setDeleteTarget(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
