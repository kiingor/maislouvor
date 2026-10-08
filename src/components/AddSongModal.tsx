import { useMusicManagement } from "@/hooks/useMusicManagement";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MusicalKeyPicker } from "@/components/MusicalKeyPicker";
import { SongCatalogFilter } from "@/components/SongCatalogFilter";
import { useSongSearchDelay } from "@/hooks/useSongSearchDelay";
import { songRpc, type CatalogPage, type CatalogSong } from "@/lib/songCatalog";
import { cn } from "@/lib/utils";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  Loader2,
  Music,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";

const Registration = lazy(() => import("@/pages/SongEditor"));
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repertorioId?: string | null;
}
const spinner = (
  <div
    role="status"
    className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground"
  >
    <Loader2 className="h-5 w-5 animate-spin" />
    Carregando…
  </div>
);

export function AddSongModal({ open, onOpenChange, repertorioId }: Props) {
  const { currentTeam, profileId, can } = useTeam();
  const { canAuthorSongs } = useMusicManagement();
  const canAddExisting = !!repertorioId && can("repertorios", "editar");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"choose" | "search" | "editor" | "drafts">(
      "choose"
    ),
    [busy, setBusy] = useState(false),
    [draftId, setDraftId] = useState<string | null>(null);
  const [query, setQuery] = useState(""),
    [theme, setTheme] = useState(""),
    [key, setKey] = useState(""),
    [artist, setArtist] = useState(""),
    [sort, setSort] = useState("title");
  const [page, setPage] = useState(1),
    [size, setSize] = useState(12),
    [filtersOpen, setFiltersOpen] = useState(false),
    [selectedOnly, setSelectedOnly] = useState(false);
  const [selected, setSelected] = useState<Map<string, CatalogSong>>(new Map()),
    [detail, setDetail] = useState<CatalogSong | null>(null),
    [qualityOpen, setQualityOpen] = useState(false);
  const settled = useSongSearchDelay(query);
  const saveOnClose = useRef<null | (() => Promise<boolean>)>(null);
  const reset = () => {
    setMode("choose");
    setDraftId(null);
    setQuery("");
    setTheme("");
    setKey("");
    setArtist("");
    setPage(1);
    setSort("title");
    setSelected(new Map());
    setSelectedOnly(false);
    setFiltersOpen(false);
    setDetail(null);
    saveOnClose.current = null;
  };
  useEffect(() => {
    if (!open) reset();
  }, [open]);
  useEffect(() => {
    if (!canAuthorSongs && (mode === "editor" || mode === "drafts")) reset();
  }, [canAuthorSongs, mode]);
  const previousTeam = useRef(currentTeam?.id);
  useEffect(() => {
    if (previousTeam.current !== currentTeam?.id) {
      reset();
      previousTeam.current = currentTeam?.id;
    }
  }, [currentTeam?.id]);
  const invalidate = () => {
    for (const name of [
      "repertorio-songs",
      "library-songs",
      "dashboard-songs",
      "song-catalog",
      "song-drafts",
    ])
      void qc.invalidateQueries({ queryKey: [name] });
  };
  const close = async (next: boolean) => {
    if (next) {
      onOpenChange(true);
      return;
    }
    if (busy) return;
    if (canAuthorSongs && mode === "editor" && saveOnClose.current) {
      setBusy(true);
      const saved = await saveOnClose.current();
      setBusy(false);
      if (!saved) return;
    }
    onOpenChange(false);
  };
  const begin = async () => {
    if (!currentTeam || !profileId || !canAuthorSongs) return;
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("songs")
        .insert({
          team_id: currentTeam.id,
          created_by: profileId,
          title: "",
          is_draft: true,
        } as never)
        .select("id")
        .single();
      if (error || !data)
        throw new Error(
          error?.message || "Não foi possível começar o cadastro."
        );
      setDraftId(data.id);
      saveOnClose.current = null;
      setMode("editor");
    } catch (error) {
      toast({
        title: "Erro ao começar cadastro",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };
  const catalog = useQuery({
    queryKey: [
      "song-catalog",
      currentTeam?.id,
      repertorioId,
      selectedOnly ? "" : settled,
      selectedOnly ? "" : theme,
      selectedOnly ? "" : key,
      selectedOnly ? "" : artist,
      sort,
      page,
      size,
      selectedOnly ? [...selected.keys()].join(",") : null,
    ],
    enabled: canAddExisting && open && mode === "search" && !!currentTeam && !!repertorioId,
    queryFn: () =>
      songRpc<CatalogPage>("search_song_catalog", {
        p_team_id: currentTeam!.id,
        p_repertorio_id: repertorioId,
        p_query: selectedOnly ? "" : settled,
        p_theme: selectedOnly ? "" : theme,
        p_key: selectedOnly ? "" : key,
        p_artist: selectedOnly ? "" : artist,
        p_sort: sort,
        p_page: page,
        p_page_size: size,
        p_selected_ids: selectedOnly ? [...selected.keys()] : null,
      }),
  });
  const drafts = useQuery({
    queryKey: ["song-drafts", currentTeam?.id, profileId],
    enabled: open && !!currentTeam && !!profileId && canAuthorSongs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("songs")
        .select("id,title,artist")
        .eq("team_id", currentTeam!.id)
        .eq("created_by", profileId!)
        .eq("is_draft" as never, true)
        .order("created_at", { ascending: false })
        .limit(24);
      if (error) throw error;
      return data || [];
    },
  });
  const pages = Math.max(1, Math.ceil((catalog.data?.total || 0) / size));
  useEffect(() => {
    if (catalog.data && page > pages) setPage(pages);
  }, [catalog.data, page, pages]);
  useEffect(() => {
    const linked = catalog.data?.songs.filter(
      (song) => song.already_added && selected.has(song.id)
    );
    if (linked?.length)
      setSelected((previous) => {
        const next = new Map(previous);
        linked.forEach((song) => next.delete(song.id));
        return next;
      });
  }, [catalog.data, selected]);
  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const clear = () => {
    setQuery("");
    setTheme("");
    setKey("");
    setArtist("");
    setPage(1);
  };
  const toggle = (song: CatalogSong) =>
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(song.id)) next.delete(song.id);
      else if (next.size < 100 && !song.already_added) next.set(song.id, song);
      return next;
    });
  const add = async () => {
    if (!canAddExisting || !repertorioId || !selected.size) return;
    setBusy(true);
    try {
      const count = await songRpc<number>("add_complete_songs_to_repertorio", {
        p_repertorio_id: repertorioId,
        p_song_ids: [...selected.keys()],
      });
      invalidate();
      toast({
        title:
          count === 1 ? "Música adicionada" : `${count} músicas adicionadas`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Não foi possível adicionar",
        description: (error as Error).message,
        variant: "destructive",
      });
      void catalog.refetch();
    } finally {
      setBusy(false);
    }
  };
  const choice = (
    label: string,
    description: string,
    kind: "search" | "editor",
    featured = false
  ) => (
    <button
      type="button"
      disabled={busy || (kind === "editor" && !canAuthorSongs)}
      onClick={() => (kind === "editor" ? void begin() : setMode("search"))}
      className={cn(
        "flex min-h-[105px] w-full items-center gap-4 rounded-[20px] border border-separator bg-card p-5 text-left disabled:opacity-50",
        featured && "border-foreground"
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-[15px] bg-fill-tertiary",
          featured && "bg-prominent text-prominent-foreground"
        )}
      >
        {busy && kind === "editor" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : kind === "search" ? (
          <Search className="h-5 w-5" />
        ) : (
          <Music className="h-5 w-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <strong className="block text-base font-semibold">{label}</strong>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
        {featured && (
          <span className="mt-2 block text-[11px] font-semibold text-primary">
            Cifra e áudio já preenchidos
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </button>
  );
  const title =
    mode === "search"
      ? "Buscar músicas"
      : mode === "editor"
      ? "Cadastrar nova música"
      : mode === "drafts"
      ? "Seus rascunhos"
      : "Adicionar música";
  return (
    <>
      <Dialog open={open && (canAuthorSongs || canAddExisting)} onOpenChange={(next) => void close(next)}>
        <DialogContent
          hideClose
          className={cn(
            "flex flex-col gap-0 overflow-hidden bg-background p-0",
            mode === "choose" || mode === "drafts"
              ? "sm:max-w-[540px]"
              : "h-[min(850px,calc(100dvh-48px))] sm:max-w-[900px]",
            mode === "editor" && "sm:max-w-[950px]"
          )}
          aria-describedby="add-song-description"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-separator bg-card/80 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs text-muted-foreground">
                {repertorioId
                  ? "Adicionar ao repertório"
                  : "Biblioteca da equipe"}
              </p>
              <DialogTitle className="text-[23px] leading-tight sm:text-[25px]">
                {title}
              </DialogTitle>
              <DialogDescription
                id="add-song-description"
                className="mt-1 text-xs leading-relaxed"
              >
                {mode === "editor"
                  ? "Identifique a versão, prepare a gravação e organize o ensaio."
                  : mode === "search"
                  ? "Encontre a versão certa e adicione ao repertório."
                  : canAuthorSongs ? "Encontre uma música pronta ou cadastre a sua." : "Escolha músicas da biblioteca para este repertório."}
              </DialogDescription>
            </div>
            <button
              type="button"
              onClick={() => void close(false)}
              disabled={busy}
              aria-label="Fechar adicionar música"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fill-tertiary"
            >
              <X className="h-4 w-4" />
            </button>
          </header>
          {mode === "choose" && (
            <div className="space-y-3 overflow-y-auto p-5 sm:p-6">
              {canAddExisting &&
                choice(
                  "Buscar músicas",
                  "Encontre por nome, artista, tema ou tom. Adicione várias de uma vez.",
                  "search",
                  true
                )}
              {canAuthorSongs && choice(
                "Cadastrar nova",
                "Organize as informações, a cifra e a gravação em três etapas.",
                "editor"
              )}
              {canAuthorSongs && <p className="flex gap-2 px-1 pt-1 text-xs text-muted-foreground">
                <FileText className="h-4 w-4 shrink-0" />
                Cadastros em andamento ficam nos seus rascunhos.
              </p>}
              {canAuthorSongs && !!drafts.data?.length && (
                <Button variant="ghost" onClick={() => setMode("drafts")}>
                  Retomar rascunhos ({drafts.data.length})
                </Button>
              )}
            </div>
          )}
          {canAuthorSongs && mode === "drafts" && (
            <div className="min-h-0 overflow-y-auto p-5">
              {drafts.isPending ? (
                spinner
              ) : drafts.isError ? (
                <p>Não foi possível carregar seus rascunhos.</p>
              ) : (
                drafts.data?.map((draft) => (
                  <div
                    key={draft.id}
                    className="mb-3 flex items-center gap-3 rounded-[15px] border border-separator bg-card p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <strong className="block truncate text-sm">
                        {draft.title || "Música sem nome"}
                      </strong>
                      <p className="text-xs text-muted-foreground">
                        {draft.artist || "Continue o cadastro"}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setDraftId(draft.id);
                        saveOnClose.current = null;
                        setMode("editor");
                      }}
                    >
                      Continuar
                    </Button>
                  </div>
                ))
              )}
              <Button variant="ghost" onClick={() => setMode("choose")}>
                Voltar
              </Button>
            </div>
          )}
          {canAuthorSongs && mode === "editor" && draftId && (
            <Suspense fallback={spinner}>
              <Registration
                songId={draftId}
                embedded
                initialRepertorioId={repertorioId || undefined}
                registerSaveOnClose={(save) => {
                  saveOnClose.current = save;
                }}
                onFinished={() => {
                  saveOnClose.current = null;
                  invalidate();
                  onOpenChange(false);
                }}
              />
            </Suspense>
          )}
          {mode === "search" && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 sm:px-6">
                {!selectedOnly && (
                  <>
                    <div className="flex gap-2">
                      <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-[14px] border border-separator bg-card px-3">
                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <input
                          type="search"
                          aria-label="Buscar músicas por nome, artista ou tags"
                          placeholder="Nome, artista ou tags…"
                          value={query}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setPage(1);
                          }}
                          className="h-full w-full min-w-0 bg-transparent text-base outline-none sm:text-sm"
                        />
                      </label>
                      <Button
                        variant="secondary"
                        className="h-12 px-3 sm:hidden"
                        aria-label="Filtros"
                        aria-expanded={filtersOpen}
                        onClick={() => setFiltersOpen(!filtersOpen)}
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                    <div
                      className={cn(
                        "mt-3 gap-2 sm:grid sm:grid-cols-3",
                        filtersOpen ? "grid" : "hidden"
                      )}
                    >
                      {currentTeam && (
                        <>
                          <SongCatalogFilter
                            teamId={currentTeam.id}
                            kind="theme"
                            label="Tema"
                            value={theme}
                            onChange={changeFilter(setTheme)}
                          />
                          <MusicalKeyPicker
                            label="Tom"
                            value={key}
                            onChange={changeFilter(setKey)}
                            emptyLabel="Todos os tons"
                            allowEmpty
                          />
                          <SongCatalogFilter
                            teamId={currentTeam.id}
                            kind="artist"
                            label="Artista"
                            value={artist}
                            onChange={changeFilter(setArtist)}
                          />
                        </>
                      )}
                    </div>
                    {(theme || key || artist || query) && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[
                          [theme, setTheme],
                          [key, setKey],
                          [artist, setArtist],
                        ].map(([value, setter], index) =>
                          value ? (
                            <Button
                              key={index}
                              variant="secondary"
                              className="min-h-11 max-w-full rounded-full px-3 text-xs"
                              onClick={() =>
                                changeFilter(setter as (value: string) => void)(
                                  ""
                                )
                              }
                            >
                              <span className="truncate">
                                {value as string}
                              </span>
                              <X className="h-3 w-3 shrink-0" />
                            </Button>
                          ) : null
                        )}
                        <Button
                          variant="ghost"
                          className="text-xs"
                          onClick={clear}
                        >
                          Limpar filtros
                        </Button>
                      </div>
                    )}
                  </>
                )}
                <div className="my-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-primary">
                    <CheckCircle2 className="h-4 w-4" />
                    Somente músicas completas
                    <button
                      type="button"
                      onClick={() => setQualityOpen(true)}
                      aria-label="O que é uma música completa?"
                      className="grid h-11 w-11 place-items-center text-muted-foreground"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </span>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    Ordenar
                    <select
                      value={sort}
                      onChange={(e) => {
                        setSort(e.target.value);
                        setPage(1);
                      }}
                      className="h-11 min-w-0 bg-transparent text-foreground"
                    >
                      <option value="title">Nome</option>
                      <option value="artist">Artista</option>
                      <option value="recent">Mais recentes</option>
                    </select>
                  </label>
                </div>
                {catalog.isPending ? (
                  spinner
                ) : catalog.isError ? (
                  <div
                    role="alert"
                    className="rounded-[15px] bg-card p-6 text-center"
                  >
                    <p className="text-sm">
                      Não foi possível carregar as músicas.
                    </p>
                    <Button
                      onClick={() => void catalog.refetch()}
                      variant="secondary"
                      className="mt-3"
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : !catalog.data?.songs.length ? (
                  <div className="rounded-[15px] bg-card p-8 text-center">
                    <Search className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
                    <h3 className="text-base font-semibold">
                      {selectedOnly
                        ? "Nenhuma música selecionada"
                        : "Nenhuma música encontrada"}
                    </h3>
                    <p className="my-3 text-xs text-muted-foreground">
                      {selectedOnly
                        ? "Volte à busca para escolher músicas."
                        : "Tente outro nome ou ajuste os filtros."}
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        selectedOnly ? setSelectedOnly(false) : clear()
                      }
                    >
                      {selectedOnly ? "Voltar à busca" : "Limpar filtros"}
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-[18px] border border-separator bg-card">
                    {catalog.data.songs.map((song) => (
                      <div
                        key={song.id}
                        className={cn(
                          "flex min-h-[76px] items-center border-t border-separator first:border-t-0",
                          selected.has(song.id) && "bg-fill-quaternary"
                        )}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={
                              song.already_added || selected.has(song.id)
                            }
                            disabled={
                              busy ||
                              song.already_added ||
                              (!selected.has(song.id) && selected.size >= 100)
                            }
                            onChange={() => toggle(song)}
                            aria-label={
                              song.already_added
                                ? `${song.title} já está no repertório`
                                : `Selecionar ${song.title}, ${song.artist}`
                            }
                            className="h-5 w-5 shrink-0 accent-foreground"
                          />
                          <span className="grid h-12 w-11 shrink-0 place-items-center rounded-[12px] bg-fill-tertiary text-base font-semibold">
                            {song.key_current}
                          </span>
                          <span className="min-w-0 flex-1">
                            <strong className="block truncate text-sm font-semibold">
                              {song.title}
                            </strong>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">
                              {song.artist}
                            </span>
                            {song.already_added && (
                              <span className="mt-1 block text-[10px] text-muted-foreground">
                                Já no repertório
                              </span>
                            )}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setDetail(song)}
                          aria-label={`Conferir ${song.title}`}
                          className="mr-2 grid h-11 w-11 shrink-0 place-items-center rounded-full"
                        >
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {catalog.data && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <label className="flex items-center gap-1">
                      Por página
                      <select
                        value={size}
                        onChange={(e) => {
                          setSize(Number(e.target.value));
                          setPage(1);
                        }}
                        className="h-11 rounded-[9px] bg-fill-tertiary px-2 text-foreground"
                      >
                        {[6, 12, 24].map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                    <span>
                      {catalog.data.total
                        ? `${(page - 1) * size + 1}–${Math.min(
                            page * size,
                            catalog.data.total
                          )} de ${catalog.data.total}`
                        : "0 músicas"}
                    </span>
                    <nav
                      aria-label="Páginas de músicas"
                      className="flex items-center gap-1"
                    >
                      <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                        aria-label="Página anterior"
                        className="grid h-11 w-11 place-items-center rounded-[10px] disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      {Array.from(
                        { length: Math.min(5, pages) },
                        (_, index) =>
                          Math.min(
                            Math.max(1, page - 2),
                            Math.max(1, pages - 4)
                          ) + index
                      ).map((n) => (
                        <button
                          type="button"
                          key={n}
                          aria-label={`Página ${n}`}
                          aria-current={n === page ? "page" : undefined}
                          onClick={() => setPage(n)}
                          className={cn(
                            "h-11 min-w-11 rounded-[10px] px-2",
                            Math.abs(n - page) > 1 && "hidden sm:inline-grid",
                            n === page &&
                              "bg-prominent text-prominent-foreground"
                          )}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={page >= pages}
                        onClick={() => setPage(page + 1)}
                        aria-label="Próxima página"
                        className="grid h-11 w-11 place-items-center rounded-[10px] disabled:opacity-40"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </nav>
                  </div>
                )}
                {!!selected.size && (
                  <div
                    className="mt-3 flex flex-wrap gap-1"
                    aria-label="Músicas selecionadas"
                  >
                    {[...selected.values()].slice(0, 8).map((song) => (
                      <Button
                        key={song.id}
                        variant="secondary"
                        className="max-w-full rounded-full text-xs"
                        aria-label={`Remover seleção de ${song.title}`}
                        onClick={() => toggle(song)}
                      >
                        <span className="truncate">{song.title}</span>
                        <X className="h-3 w-3" />
                      </Button>
                    ))}
                    {selected.size > 8 && (
                      <span className="p-3 text-xs">+{selected.size - 8}</span>
                    )}
                  </div>
                )}
              </div>
              <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-separator bg-card/80 px-5 py-3 sm:px-6">
                <div>
                  <p className="text-sm font-semibold">
                    {selected.size} selecionada{selected.size === 1 ? "" : "s"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOnly(!selectedOnly);
                      setPage(1);
                    }}
                    className="min-h-11 text-xs text-muted-foreground underline"
                  >
                    {selectedOnly ? "Voltar à busca" : "Ver selecionadas"}
                  </button>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setMode("choose")}
                    disabled={busy}
                  >
                    Voltar
                  </Button>
                  <Button
                    onClick={() => void add()}
                    disabled={!selected.size || busy}
                  >
                    {busy ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-4 w-4" />
                    )}
                    Adicionar{selected.size ? ` (${selected.size})` : ""}
                  </Button>
                </div>
              </footer>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={qualityOpen} onOpenChange={setQualityOpen}>
        <DialogContent>
          <DialogTitle>Música completa</DialogTitle>
          <DialogDescription>
            Nome, artista, tom, tema, cifra e áudio preparado. Um link sozinho
            não substitui a gravação. Rascunhos ficam fora da busca.
          </DialogDescription>
          <Button onClick={() => setQualityOpen(false)}>Entendi</Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(next) => {
          if (!next) setDetail(null);
        }}
      >
        <DialogContent>
          <DialogTitle>{detail?.title}</DialogTitle>
          <DialogDescription>{detail?.artist}</DialogDescription>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt>Tom</dt>
            <dd>{detail?.key_current}</dd>
            <dt>Tema</dt>
            <dd>{detail?.theme}</dd>
            <dt>Conteúdo</dt>
            <dd>Cifra e áudio preenchidos</dd>
          </dl>
          <p className="text-xs text-muted-foreground">
            {detail?.tags?.join(" · ")}
          </p>
          <Button variant="secondary" onClick={() => setDetail(null)}>
            Voltar à busca
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
