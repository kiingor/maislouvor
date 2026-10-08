import { WebMusicManagementNotice } from "@/components/WebMusicManagementNotice";
import { useMusicManagement } from "@/hooks/useMusicManagement";
import { useState, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { SongCard, SongList, SongSearchField } from "@/components/SongCard";
import { AddSongModal } from "@/components/AddSongModal";
import { RepertorioModal } from "@/components/RepertorioModal";
import { SetlistGeneratorModal } from "@/components/SetlistGeneratorModal";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { PageHeader } from "@/components/shell/PageHeader";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Music, Plus, MoreHorizontal, Pencil, Trash2, Users, Sparkles, ListMusic, ChevronRight, type LucideIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { lazy, Suspense } from "react";

const RepertorioDashboard = lazy(() => import("@/components/RepertorioDashboard"));

/** Estado vazio (spec §5): símbolo 28pt terciário, título Body secundário e, se houver, uma ação. */
function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card bg-card px-6 py-10 text-center">
      <Icon className="mb-3 h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
      <h3 className="text-body text-muted-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-footnote text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Linhas-fantasma dentro de um grupo enquanto carrega. */
function SkeletonRows({ count, artwork = false }: { count: number; artwork?: boolean }) {
  return (
    <div className="overflow-hidden rounded-card bg-card" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="relative flex min-h-[60px] items-center gap-3 px-4 py-2.5">
          {i > 0 && <span className={`absolute right-0 top-0 border-t border-separator ${artwork ? "left-[72px]" : "left-[58px]"}`} />}
          <span className={`shrink-0 animate-pulse bg-fill-tertiary ${artwork ? "h-11 w-11 rounded-[10px]" : "h-[30px] w-[30px] rounded-[8px]"}`} />
          <span className="flex-1 space-y-1.5">
            <span className="block h-4 w-2/5 animate-pulse rounded-full bg-fill-tertiary" />
            <span className="block h-3 w-1/4 animate-pulse rounded-full bg-fill-quaternary" />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Repertorios() {
  const { currentTeam, can, loading: teamLoading } = useTeam();
  const canEdit = can("repertorios", "editar");
  const canEditSongs = can("musicas", "editar");
  const { canAuthorSongs, canCreateRepertoire, canShowSongWebNotice, canShowRepertoireWebNotice } = useMusicManagement();
  const [webNotice, setWebNotice] = useState<"song" | "repertoire" | null>(null);
  const showNewSong = () => canShowSongWebNotice ? setWebNotice("song") : setAddLibraryOpen(true);
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
        supabase.from("songs").select("id, title, artist, key_current, cover_path, theme, tags").eq("team_id", currentTeam.id).eq("is_draft" as never, false).order("title"),
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

  const openCreate = () => {
    if (canShowRepertoireWebNotice) { setWebNotice("repertoire"); return; } setEditId(null); setEditName(""); setCreateOpen(true); };

  // No team yet
  if (!teamLoading && !currentTeam) {
    return (
      <div className="animate-in-up">
        <PageHeader title="Repertórios" />
        <EmptyState
          icon={Users}
          title="Crie sua equipe"
          description="Crie uma equipe para começar a organizar seus repertórios."
          action={
            <Button onClick={() => setCreateTeamOpen(true)}>
              <Plus aria-hidden="true" /> Criar equipe
            </Button>
          }
        />
        <CreateTeamModal open={createTeamOpen} onOpenChange={setCreateTeamOpen} />
      </div>
    );
  }

  // Ações da barra superior: dependem do segmento ativo (HIG > Toolbars).
  const actions =
    activeTab === "repertorios" && (canCreateRepertoire || canShowRepertoireWebNotice) ? (
      <>
        {canCreateRepertoire && <ToolbarButton icon={<Sparkles />} aria-label="Gerar setlist" title="Gerar setlist" onClick={() => setGenerateOpen(true)} />}
        <ToolbarButton icon={<Plus strokeWidth={2.25} />} aria-label="Novo repertório" title="Novo repertório" onClick={openCreate} />
      </>
    ) : activeTab === "musicas" && (canAuthorSongs || canShowSongWebNotice) ? (
      <ToolbarButton icon={<Plus strokeWidth={2.25} />} aria-label="Nova música" title="Nova música" onClick={showNewSong} />
    ) : undefined;

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full animate-in-up">
      <PageHeader title="Repertórios" subtitle="Organize as músicas da sua equipe" actions={actions}>
        <TabsList className="grid w-full grid-cols-3 lg:max-w-md">
          <TabsTrigger value="repertorios">Repertórios</TabsTrigger>
          <TabsTrigger value="musicas">Músicas</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
        </TabsList>
      </PageHeader>

      <TabsContent value="repertorios" className="mt-0">
        {isLoading || teamLoading ? (
          <SkeletonRows count={3} />
        ) : repertorios.length === 0 ? (
          <EmptyState
            icon={Music}
            title="Nenhum repertório ainda"
            description={canCreateRepertoire ? "Crie seu primeiro repertório para começar." : "Seus repertórios aparecerão aqui."}
            action={
              (canCreateRepertoire || canShowRepertoireWebNotice) && (
                <Button onClick={openCreate}>
                  <Plus aria-hidden="true" /> Criar repertório
                </Button>
              )
            }
          />
        ) : (
          <ul className="overflow-hidden rounded-card bg-card" aria-label="Repertórios">
            {repertorios.map((r: any, i: number) => (
              // A linha toda navega (o clique do botão sobe até o <li>); o menu "…" fica fora do botão.
              <li
                key={r.id}
                onClick={() => navigate(`/app/repertorios/${r.id}`)}
                className="relative flex min-h-[60px] cursor-pointer items-center gap-3 py-2.5 pl-4 pr-3 transition-colors active:bg-fill-tertiary has-[[data-row-control]:active]:bg-transparent"
              >
                {i > 0 && <span aria-hidden="true" className="pointer-events-none absolute left-[58px] right-0 top-0 border-t border-separator" />}
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] text-left">
                  <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
                    <ListMusic className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-foreground">{r.name}</span>
                    <span className="block text-footnote text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </span>
                </button>
                {canEdit && (
                  <div
                    data-row-control=""
                    className="-my-1 -mx-1.5 flex shrink-0 items-center"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Mais ações para ${r.name}`}
                          title="Mais ações"
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-fill-tertiary"
                        >
                          <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditId(r.id); setEditName(r.name); setCreateOpen(true); }}>
                          <Pencil />
                          Renomear
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-ios-red focus:text-ios-red" onClick={() => setDeleteId(r.id)}>
                          <Trash2 />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
                {/* O menu "…" já é o acessório da linha; o chevron só aparece sem ele. */}
                {!canEdit && (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                )}
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="musicas" className="mt-0">
        <SongSearchField
          value={songSearch}
          onChange={setSongSearch}
          placeholder="Buscar por título ou artista…"
          className="mb-5 lg:max-w-md"
        />
        {libLoading || teamLoading ? (
          <SkeletonRows count={4} artwork />
        ) : filteredSongs.length === 0 ? (
          <EmptyState
            icon={ListMusic}
            title={songSearch.trim() ? "Nenhuma música encontrada" : "Nenhuma música cadastrada"}
            description={
              songSearch.trim()
                ? "Tente outro termo de busca."
                : canAuthorSongs
                ? "Cadastre músicas aqui — elas ficam disponíveis para qualquer repertório."
                : "As músicas da equipe aparecerão aqui."
            }
            action={
              (canAuthorSongs || canShowSongWebNotice) && !songSearch.trim() && (
                <Button onClick={showNewSong}>
                  <Plus aria-hidden="true" /> Nova música
                </Button>
              )
            }
          />
        ) : (
          <section aria-label="Biblioteca da equipe">
            <p className="mx-4 mb-1.5 text-footnote text-muted-foreground">
              {filteredSongs.length} música{filteredSongs.length !== 1 ? "s" : ""} na biblioteca da equipe
            </p>
            <SongList>
              {filteredSongs.map((s: any, i: number) => (
                <SongCard
                  key={s.id}
                  variant="row"
                  song={s}
                  index={i}
                  repertorios={library.repMap[s.id]}
                  onClick={() => navigate(`/app/songs/${s.id}`)}
                  chevron={!canEditSongs}
                  actions={canEditSongs ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={`Mais ações para ${s.title}`}
                          title="Mais ações"
                          className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition-colors active:bg-fill-tertiary"
                        >
                          <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-ios-red focus:text-ios-red" onClick={() => setDeleteSong({ id: s.id, title: s.title })}>
                          <Trash2 />
                          Excluir música
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : undefined}
                />
              ))}
            </SongList>
          </section>
        )}
      </TabsContent>

      <TabsContent value="dashboard" className="mt-0">
        <Suspense fallback={
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-card bg-card" />
            ))}
          </div>
        }>
          <RepertorioDashboard />
        </Suspense>
      </TabsContent>

      <WebMusicManagementNotice open={!!webNotice} onOpenChange={(open) => { if (!open) setWebNotice(null); }} resource={webNotice || "song"} />
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
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
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
    </Tabs>
  );
}
