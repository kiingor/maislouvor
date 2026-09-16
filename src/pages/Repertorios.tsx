import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { GlassInput } from "@/components/GlassInput";
import { SongCard } from "@/components/SongCard";
import { AddSongModal } from "@/components/AddSongModal";
import { RepertorioModal } from "@/components/RepertorioModal";
import { SetlistGeneratorModal } from "@/components/SetlistGeneratorModal";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Music, Plus, MoreVertical, Pencil, Trash2, Users, BarChart3, Sparkles, ListMusic, Search } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense } from "react";

const RepertorioDashboard = lazy(() => import("@/components/RepertorioDashboard"));

export default function Repertorios() {
  const { currentTeam, can, loading: teamLoading } = useTeam();
  const canEdit = can("repertorios", "editar");
  const canEditSongs = can("musicas", "editar");
  const [activeTab, setActiveTab] = useState("repertorios");
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Aba "Músicas" — biblioteca global da equipe
  const [songSearch, setSongSearch] = useState("");
  const [addLibraryOpen, setAddLibraryOpen] = useState(false);
  const [deleteSong, setDeleteSong] = useState<{ id: string; title: string } | null>(null);

  const { data: library = { songs: [], repMap: {} as Record<string, string[]> }, isLoading: libLoading } = useQuery({
    queryKey: ["library-songs", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return { songs: [] as any[], repMap: {} as Record<string, string[]> };
      const [{ data: songs }, { data: reps }] = await Promise.all([
        supabase.from("songs").select("id, title, artist, key_current, cover_path, theme, tags").eq("team_id", currentTeam.id).order("title"),
        supabase.from("repertorios").select("id, name").eq("team_id", currentTeam.id),
      ]);
      const repNameById: Record<string, string> = Object.fromEntries((reps ?? []).map((r: any) => [r.id, r.name]));
      const repIds = (reps ?? []).map((r: any) => r.id);
      const repMap: Record<string, string[]> = {};
      if (repIds.length) {
        const { data: links } = await supabase.from("repertorio_songs").select("song_id, repertorio_id").in("repertorio_id", repIds);
        (links ?? []).forEach((l: any) => { (repMap[l.song_id] ||= []).push(repNameById[l.repertorio_id]); });
      }
      return { songs: songs ?? [], repMap };
    },
    enabled: !!currentTeam,
  });

  const filteredSongs = useMemo(() => {
    const q = songSearch.trim().toLowerCase();
    if (!q) return library.songs;
    return library.songs.filter((s: any) => s.title?.toLowerCase().includes(q) || s.artist?.toLowerCase().includes(q));
  }, [library.songs, songSearch]);

  const { data: repertorios = [], isLoading } = useQuery({
    queryKey: ["repertorios", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("repertorios")
        .select("*")
        .eq("team_id", currentTeam.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("repertorios").delete().eq("id", deleteId);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else { toast({ title: "Repertório excluído" }); qc.invalidateQueries({ queryKey: ["repertorios"] }); }
    setDeleteId(null);
  };

  const handleDeleteSong = async () => {
    if (!deleteSong) return;
    const { error } = await supabase.from("songs").delete().eq("id", deleteSong.id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Música excluída" });
      qc.invalidateQueries({ queryKey: ["library-songs"] });
      qc.invalidateQueries({ queryKey: ["repertorio-songs"] });
      qc.invalidateQueries({ queryKey: ["dashboard-songs"] });
    }
    setDeleteSong(null);
  };

  // No team yet
  if (!teamLoading && !currentTeam) {
    return (
      <div className="animate-in-up">
        <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
          <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-1">Crie sua equipe</h3>
          <p className="text-muted-foreground text-sm max-w-xs mb-6">
            Crie uma equipe para começar a organizar seus repertórios.
          </p>
          <Button className="rounded-xl gap-2" onClick={() => setCreateTeamOpen(true)}>
            <Plus className="h-4 w-4" /> Criar equipe
          </Button>
        </GlassCard>
        <CreateTeamModal open={createTeamOpen} onOpenChange={setCreateTeamOpen} />
      </div>
    );
  }

  return (
    <div className="animate-in-up">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repertórios</h1>
          <p className="text-muted-foreground text-sm mt-1">Organize as músicas da sua equipe</p>
        </div>
        {canEdit && activeTab === "repertorios" && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(true)} className="rounded-xl gap-2">
              <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">Gerar setlist</span>
            </Button>
            <Button onClick={() => { setEditId(null); setEditName(""); setCreateOpen(true); }} className="rounded-xl gap-2">
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>
        )}
        {canEditSongs && activeTab === "musicas" && (
          <Button onClick={() => setAddLibraryOpen(true)} className="rounded-xl gap-2">
            <Plus className="h-4 w-4" /> Nova música
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="repertorios" className="gap-1.5">
            <Music className="h-3.5 w-3.5" /> Repertórios
          </TabsTrigger>
          <TabsTrigger value="musicas" className="gap-1.5">
            <ListMusic className="h-3.5 w-3.5" /> Músicas
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" /> Dashboard
          </TabsTrigger>
        </TabsList>

        <TabsContent value="repertorios">
          {isLoading || teamLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <GlassCard key={i} className="p-6 h-28 animate-pulse" />
              ))}
            </div>
          ) : repertorios.length === 0 ? (
            <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
                <Music className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">Nenhum repertório ainda</h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                {canEdit ? "Crie seu primeiro repertório para começar." : "Seus repertórios aparecerão aqui."}
              </p>
              {canEdit && (
                <Button className="mt-6 rounded-xl gap-2" onClick={() => { setEditId(null); setEditName(""); setCreateOpen(true); }}>
                  <Plus className="h-4 w-4" /> Criar repertório
                </Button>
              )}
            </GlassCard>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {repertorios.map((r: any) => (
                <GlassCard
                  key={r.id}
                  className="p-6 cursor-pointer hover-lift group relative"
                  onClick={() => navigate(`/app/repertorios/${r.id}`)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
                        <Music className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <h3 className="font-medium text-sm">{r.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(r.created_at).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                    </div>
                    {canEdit && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="ghost" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditId(r.id); setEditName(r.name); setCreateOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Renomear
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteId(r.id); }}>
                            <Trash2 className="h-3.5 w-3.5 mr-2" /> Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="musicas">
          <div className="relative mb-4 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <GlassInput
              placeholder="Buscar por título ou artista…"
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          {libLoading || teamLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => <GlassCard key={i} className="h-16 animate-pulse" />)}
            </div>
          ) : filteredSongs.length === 0 ? (
            <GlassCard className="p-12 flex flex-col items-center justify-center text-center">
              <div className="h-16 w-16 rounded-2xl bg-accent flex items-center justify-center mb-4">
                <ListMusic className="h-7 w-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-1">
                {songSearch.trim() ? "Nenhuma música encontrada" : "Nenhuma música cadastrada"}
              </h3>
              <p className="text-muted-foreground text-sm max-w-xs">
                {songSearch.trim()
                  ? "Tente outro termo de busca."
                  : canEditSongs
                  ? "Cadastre músicas aqui — elas ficam disponíveis para qualquer repertório."
                  : "As músicas da equipe aparecerão aqui."}
              </p>
              {canEditSongs && !songSearch.trim() && (
                <Button className="mt-6 rounded-xl gap-2" onClick={() => setAddLibraryOpen(true)}>
                  <Plus className="h-4 w-4" /> Nova música
                </Button>
              )}
            </GlassCard>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-2 px-1">
                {filteredSongs.length} música{filteredSongs.length !== 1 ? "s" : ""} na biblioteca da equipe
              </p>
              <div className="space-y-2">
                {filteredSongs.map((s: any, i: number) => (
                  <SongCard
                    key={s.id}
                    song={s}
                    index={i}
                    repertorios={library.repMap[s.id]}
                    onClick={() => navigate(`/app/songs/${s.id}`)}
                    actions={canEditSongs ? (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteSong({ id: s.id, title: s.title }); }}
                        className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-accent/40 transition-colors"
                        title="Excluir música"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : undefined}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="dashboard">
          <Suspense fallback={
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <GlassCard key={i} className="p-6 h-24 animate-pulse" />
              ))}
            </div>
          }>
            <RepertorioDashboard />
          </Suspense>
        </TabsContent>
      </Tabs>

      <RepertorioModal open={createOpen} onOpenChange={setCreateOpen} editId={editId} editName={editName} />
      <SetlistGeneratorModal open={generateOpen} onOpenChange={setGenerateOpen} />
      <AddSongModal open={addLibraryOpen} onOpenChange={setAddLibraryOpen} repertorioId={null} />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir repertório?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteSong} onOpenChange={(o) => !o && setDeleteSong(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{deleteSong?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              A música será removida da biblioteca e de todos os repertórios e cultos onde aparece. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSong} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
