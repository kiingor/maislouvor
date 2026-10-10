import { warmPresentation } from "@/lib/routeLoaders";
import { useEffect, useState, useMemo, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { SongCard, SongList, SongSearchField } from "@/components/SongCard";
import { AddSongModal } from "@/components/AddSongModal";
import { SetlistGeneratorModal } from "@/components/SetlistGeneratorModal";
import { RepertorioBulkBar } from "@/components/RepertorioBulkBar";
import { PageHeader } from "@/components/shell/PageHeader";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Music, Plus, Trash2, X, Share, Loader2, Play, Menu, Tags, CheckCircle2, CircleCheck, Sparkles,
  MoreHorizontal, ChevronDown, ListMusic, Check, type LucideIcon,
} from "lucide-react";

/** Estado vazio (spec §5): símbolo 28pt terciário, título Body secundário e ações. */
function EmptyState({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card bg-card px-6 py-10 text-center">
      <Icon className="mb-3 h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
      <h3 className="text-body text-muted-foreground">{title}</h3>
      {description && <p className="mt-1 max-w-xs text-footnote text-muted-foreground">{description}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

/** Linhas-fantasma da lista de músicas enquanto carrega. */
function SongRowsSkeleton() {
  return (
    <div className="overflow-hidden rounded-card bg-card" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <div key={i} className="relative flex min-h-[64px] items-center gap-3 py-2.5 pl-4 pr-3">
          {i > 1 && <span className="absolute left-[104px] right-0 top-0 border-t border-separator" />}
          <span className="w-5 shrink-0" />
          <span className="h-11 w-11 shrink-0 animate-pulse rounded-[10px] bg-fill-tertiary" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-4 w-2/5 animate-pulse rounded-full bg-fill-tertiary" />
            <span className="block h-3 w-1/4 animate-pulse rounded-full bg-fill-quaternary" />
          </span>
        </div>
      ))}
    </div>
  );
}

/** Pílula de filtro (pull-down/alternância) — compacta 36pt com área de toque de 44pt. */
const chipClass = (active: boolean) =>
  cn(
    "relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-subhead font-medium transition-colors",
    "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
    "[&_svg]:h-[15px] [&_svg]:w-[15px] [&_svg]:shrink-0",
    active ? "bg-prominent text-prominent-foreground" : "bg-fill-tertiary text-foreground active:bg-fill-secondary",
  );

/** Círculo de seleção do modo de edição (iOS). */
function SelectionCircle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors",
        checked ? "border-transparent bg-prominent text-prominent-foreground" : "border-label-tertiary",
      )}
    >
      {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </span>
  );
}

export default function RepertorioDetail() {
  // Baixa o Modo ensaio em segundo plano: tocar em "Ensaio" abre sem espera.
  useEffect(warmPresentation, []);
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

  const { data: songs = [], isLoading: songsLoading } = useQuery({
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
      <div className="animate-in-up" aria-busy="true">
        {/* Título real para leitores de tela (e Voltar no shell); visualmente, um marcador. */}
        <PageHeader title="Repertório" back="/app/repertorios" className="sr-only" />
        <div aria-hidden="true">
          <div className="mb-4 h-[41px] w-56 max-w-[70%] animate-pulse rounded-full bg-fill-tertiary" />
          <div className="mb-6 h-[88px] animate-pulse rounded-card bg-card" />
          <SongRowsSkeleton />
        </div>
      </div>
    );
  }

  if (!repertorio) {
    return (
      <div className="animate-in-up">
        <PageHeader title="Repertório" back="/app/repertorios" />
        <EmptyState icon={ListMusic} title="Repertório não encontrado.">
          <Button variant="secondary" onClick={() => navigate("/app/repertorios")}>
            Voltar
          </Button>
        </EmptyState>
      </div>
    );
  }

  const selectedSongIds = songs
    .filter((rs: any) => selectedRsIds.includes(rs.id))
    .map((rs: any) => rs.song_id ?? rs.songs?.id)
    .filter(Boolean);

  const handleShare = async () => {
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
      toast({ title: "Link copiado!", description: "Compartilhe a lista. Os áudios ficam restritos à equipe." });
    } catch {
      toast({ title: "Erro ao compartilhar", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  };

  const keyOptions = [...new Set(songs.map((rs: any) => rs.songs?.key_current).filter(Boolean))].sort() as string[];
  const themeOptions = [...new Set(songs.map((rs: any) => rs.songs?.theme).filter(Boolean))].sort() as string[];
  const clearFilters = () => { setSearch(""); setFilterKey(""); setFilterTheme(""); setFilterTags([]); setReadyOnly(false); };

  // Barra superior (HIG > Toolbars): no modo de seleção fica só a saída do modo.
  const actions = selectionMode ? (
    <ToolbarButton label="Cancelar seleção" onClick={exitSelection} />
  ) : (
    <>
      <ToolbarButton
        icon={sharing ? <Loader2 className="animate-spin" /> : <Share />}
        aria-label="Compartilhar"
        title="Compartilhar link"
        disabled={sharing}
        onClick={handleShare}
      />
      {canEdit && (
        <ToolbarButton icon={<Plus strokeWidth={2.25} />} aria-label="Adicionar música" title="Adicionar música" onClick={() => setAddSongOpen(true)} />
      )}
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton icon={<MoreHorizontal />} aria-label="Mais ações" title="Mais ações" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8}>
            <DropdownMenuItem onClick={() => setGenerateOpen(true)}>
              <Sparkles />
              Gerar setlist
            </DropdownMenuItem>
            {songs.length > 0 && (
              <DropdownMenuItem onClick={() => setSelectionMode(true)}>
                <CircleCheck />
                Selecionar
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );

  return (
    <div className="animate-in-up">
      <PageHeader title={repertorio.name} back="/app/repertorios" actions={actions} />

      {/* Resumo: contagem, data e a ação principal (Ensaio) — como o cabeçalho de playlist do Música. */}
      <section className="mb-6 flex flex-col gap-4 rounded-card bg-card p-4 sm:flex-row sm:items-center" aria-label="Resumo do repertório">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-fill-tertiary text-muted-foreground">
            <ListMusic className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            {songsLoading ? (
              <span className="my-[3px] block h-4 w-24 animate-pulse rounded-full bg-fill-tertiary" aria-hidden="true" />
            ) : (
              <p className="text-headline text-foreground">
                {songs.length} música{songs.length !== 1 ? "s" : ""}
              </p>
            )}
            <p className="text-footnote text-muted-foreground">
              Criado em {new Date(repertorio.created_at).toLocaleDateString("pt-BR")}
            </p>
          </div>
        </div>
        {songs.length > 0 && (
          <Button
            className="w-full sm:w-auto sm:min-w-[180px]"
            onClick={() => navigate(`/app/repertorios/${id}/present`)}
            title="Iniciar ensaio"
          >
            <Play className="fill-current" aria-hidden="true" /> Ensaio
          </Button>
        )}
      </section>

      {/* Busca + filtros (pull-downs em pílulas roláveis) */}
      {songs.length > 0 && (
        <div className="mb-4 space-y-2.5">
          <SongSearchField value={search} onChange={setSearch} placeholder="Buscar música ou artista..." />

          <div className="hide-scrollbar -mx-4 overflow-x-auto min-[430px]:-mx-5 lg:mx-0 lg:overflow-visible">
            <div className="flex w-max gap-2 px-4 py-1 min-[430px]:px-5 lg:w-auto lg:flex-wrap lg:px-0">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={chipClass(!!filterKey)}>
                    {filterKey ? `Tom ${filterKey}` : "Tom"}
                    <ChevronDown strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[50vh] overflow-y-auto">
                  <DropdownMenuRadioGroup value={filterKey || "all"} onValueChange={(v) => setFilterKey(v === "all" ? "" : v)}>
                    <DropdownMenuRadioItem value="all">Todos os tons</DropdownMenuRadioItem>
                    {keyOptions.map((k) => (
                      <DropdownMenuRadioItem key={k} value={k}>{k}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={chipClass(!!filterTheme)}>
                    <span className="max-w-[10rem] truncate">{filterTheme || "Tema"}</span>
                    <ChevronDown strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-[50vh] overflow-y-auto">
                  <DropdownMenuRadioGroup value={filterTheme || "all"} onValueChange={(v) => setFilterTheme(v === "all" ? "" : v)}>
                    <DropdownMenuRadioItem value="all">Todos os temas</DropdownMenuRadioItem>
                    {themeOptions.map((t) => (
                      <DropdownMenuRadioItem key={t} value={t}>{t}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              {allTags.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={chipClass(filterTags.length > 0)}>
                      <Tags aria-hidden="true" />
                      Tags
                      {filterTags.length > 0 && (
                        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-prominent-foreground/20 px-1.5 text-caption2 font-semibold tabular-nums">
                          {filterTags.length}
                        </span>
                      )}
                      <ChevronDown strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-[50vh] w-60 overflow-y-auto">
                    <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">Filtrar por tag</DropdownMenuLabel>
                    {allTags.map((tag) => (
                      <DropdownMenuCheckboxItem
                        key={tag}
                        checked={filterTags.includes(tag)}
                        onCheckedChange={() => toggleTag(tag)}
                        onSelect={(e) => e.preventDefault()}
                      >
                        <span className="truncate">{tag}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                    {filterTags.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setFilterTags([])}>
                          <X />
                          Limpar tags
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              <button
                type="button"
                className={chipClass(readyOnly)}
                aria-pressed={readyOnly}
                onClick={() => setReadyOnly((v) => !v)}
                title="Música com cifra e áudio"
              >
                <CheckCircle2 aria-hidden="true" /> Pronta pra tocar
              </button>

              {filtersActive && (
                <button type="button" className={cn(chipClass(false), "text-muted-foreground")} onClick={clearFilters}>
                  <X aria-hidden="true" /> Limpar filtros
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {songsLoading ? (
        <SongRowsSkeleton />
      ) : songs.length === 0 ? (
        <EmptyState
          icon={Music}
          title="Nenhuma música"
          description={canEdit ? "Adicione músicas a este repertório." : "Nenhuma música foi adicionada ainda."}
        >
          {canEdit && (
            <>
              <Button onClick={() => setAddSongOpen(true)}>
                <Plus aria-hidden="true" /> Adicionar música
              </Button>
              <Button variant="secondary" onClick={() => setGenerateOpen(true)}>
                <Sparkles aria-hidden="true" /> Gerar setlist
              </Button>
            </>
          )}
        </EmptyState>
      ) : filtered.length === 0 ? (
        <div className="rounded-card bg-card px-6 py-10 text-center text-body text-muted-foreground">
          Nenhuma música encontrada com os filtros aplicados.
        </div>
      ) : (
        <section aria-label="Músicas do repertório">
          <SongList>
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
                  className={cn(
                    "relative transition-opacity",
                    dragIdx === idx && "opacity-40",
                    overIdx === idx && dragIdx !== idx && "ring-2 ring-inset ring-primary/40",
                  )}
                >
                  <SongCard
                    variant="row"
                    song={s || { id: rs.song_id, title: "—" }}
                    index={idx}
                    leading={selectionMode ? <SelectionCircle checked={isSelected} /> : undefined}
                    selected={selectionMode ? isSelected : undefined}
                    chevron={!selectionMode && !dragEnabled}
                    onClick={
                      selectionMode
                        ? () => toggleSelect(rs.id)
                        : () => navigate(`/app/songs/${s?.id || rs.song_id}`)
                    }
                    actions={
                      canEdit && !selectionMode ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              aria-label={`Mais ações para ${s?.title || "esta música"}`}
                              title="Mais ações"
                              className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition-colors active:bg-fill-tertiary"
                            >
                              <MoreHorizontal className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-ios-red focus:text-ios-red"
                              onClick={() => setDeleteTarget({ rsId: rs.id, songTitle: s?.title || "esta música" })}
                            >
                              <Trash2 />
                              Remover do repertório
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : undefined
                    }
                    trailing={
                      dragEnabled ? (
                        // Alça de reordenar na borda direita; substitui o chevron (padrão iOS).
                        <span
                          className="grid h-11 w-8 cursor-grab place-items-center text-label-tertiary active:cursor-grabbing"
                          title="Arraste para reordenar"
                          aria-hidden="true"
                        >
                          <Menu className="h-[18px] w-[18px]" strokeWidth={2.25} />
                        </span>
                      ) : undefined
                    }
                  />
                </div>
              );
            })}
          </SongList>
          {dragEnabled && songs.length > 1 && (
            <p className="mx-4 mt-1.5 text-footnote text-muted-foreground">Arraste as músicas para reordenar.</p>
          )}
        </section>
      )}

      {selectionMode && (
        <>
          {/* Espaço para a barra de ações flutuante não cobrir a última linha. */}
          <div className="h-20" aria-hidden="true" />
          <RepertorioBulkBar
            selectedRsIds={selectedRsIds}
            selectedSongIds={selectedSongIds}
            currentRepertorioId={id!}
            onClearSelection={exitSelection}
            onDone={exitSelection}
          />
        </>
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
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
