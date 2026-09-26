import { useState, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { SongSearchField } from "@/components/SongCard";
import { cn } from "@/lib/utils";
import { Music, Globe, Loader2, ListMusic, Check, ChevronLeft, ChevronRight } from "lucide-react";

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

  const sheetTitle =
    mode === "choose"
      ? (inRepertorio ? "Adicionar música" : "Nova música")
      : mode === "search"
      ? "Buscar músicas cadastradas"
      : mode === "manual"
      ? "Criar manualmente"
      : "Importar do Cifra Club";

  const confirm =
    mode === "search"
      ? { label: `Adicionar${newSelectedCount > 0 ? ` (${newSelectedCount})` : ""}`, onClick: handleAddSelected, disabled: newSelectedCount === 0 || loading, loading }
      : mode === "manual"
      ? { label: "Criar", type: "submit" as const, form: "add-song-manual", disabled: !title.trim() || loading, loading }
      : mode === "import"
      ? { label: "Importar", type: "submit" as const, form: "add-song-import", disabled: !url.trim() || loading, loading }
      : undefined;

  // Linha de opção (lista agrupada): ícone 30pt, título Body, descrição Footnote, chevron.
  const optionRow = (icon: ReactNode, label: string, description: string, onClick: () => void, first: boolean) => (
    <button
      type="button"
      onClick={onClick}
      className="relative flex min-h-[60px] w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left transition-colors active:bg-fill-tertiary focus-visible:outline-offset-[-3px]"
    >
      {!first && <span aria-hidden="true" className="pointer-events-none absolute left-[58px] right-0 top-0 border-t border-separator" />}
      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-foreground">{label}</span>
        <span className="block text-footnote text-muted-foreground">{description}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
    </button>
  );

  // Nos subníveis, "Voltar" devolve à escolha (a folha continua aberta).
  const backLink = (
    <button
      type="button"
      onClick={() => setMode("choose")}
      disabled={loading}
      className="-ml-1 mb-2 inline-flex min-h-11 items-center gap-0.5 rounded-[10px] px-1 text-subhead font-medium text-primary disabled:opacity-40"
    >
      <ChevronLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
      Voltar
    </button>
  );

  const group = "overflow-hidden rounded-card bg-card";
  const fieldLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
  const fieldClass = "h-[52px] w-full bg-transparent px-4 text-body text-foreground placeholder:text-label-tertiary outline-none focus-visible:outline-none";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogToolbar title={sheetTitle} confirm={confirm} />

        {mode === "choose" && (
          <div className={cn(group, "mb-2 min-w-0")}>
            {inRepertorio && optionRow(<ListMusic strokeWidth={2.25} />, "Buscar cadastradas", "Escolha músicas já existentes na sua biblioteca", () => setMode("search"), true)}
            {optionRow(<Music strokeWidth={2.25} />, "Criar nova", "Preencha título, cifra e detalhes", () => setMode("manual"), !inRepertorio)}
            {optionRow(<Globe strokeWidth={2.25} />, "Importar do Cifra Club", "Cole o link e importe automaticamente", () => setMode("import"), false)}
          </div>
        )}

        {mode === "search" && (
          <div className="min-w-0 pb-2">
            {backLink}
            <SongSearchField
              value={search}
              onChange={setSearch}
              placeholder="Buscar por título ou artista…"
              autoFocus
              className="mb-3"
            />
            <div className={cn(group, "max-h-[min(50dvh,420px)] overflow-y-auto overscroll-contain")}>
              {libLoading ? (
                <div aria-hidden="true">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="relative flex min-h-[56px] items-center gap-3 px-4">
                      {i > 1 && <span className="absolute left-[50px] right-0 top-0 border-t border-separator" />}
                      <span className="h-[22px] w-[22px] shrink-0 animate-pulse rounded-full bg-fill-tertiary" />
                      <span className="h-4 w-2/5 animate-pulse rounded-full bg-fill-tertiary" />
                    </div>
                  ))}
                </div>
              ) : filteredLib.length === 0 ? (
                <p className="px-4 py-8 text-center text-subhead text-muted-foreground">
                  {search.trim() ? "Nenhuma música encontrada." : "Nenhuma música cadastrada ainda."}
                </p>
              ) : (
                <ul>
                  {filteredLib.map((s: any, i: number) => {
                    const already = lib?.already.has(s.id);
                    const checked = already || selected.has(s.id);
                    return (
                      <li key={s.id} className="relative">
                        {i > 0 && <span aria-hidden="true" className="pointer-events-none absolute left-[50px] right-0 top-0 border-t border-separator" />}
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          disabled={already}
                          onClick={() => toggleSelect(s.id)}
                          className="flex min-h-[56px] w-full items-center gap-3 py-2 pl-4 pr-4 text-left transition-colors enabled:active:bg-fill-tertiary focus-visible:outline-offset-[-3px]"
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors",
                              checked
                                ? already
                                  ? "border-transparent bg-fill text-muted-foreground"
                                  : "border-transparent bg-prominent text-prominent-foreground"
                                : "border-label-tertiary",
                            )}
                          >
                            {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-body", already ? "text-muted-foreground" : "text-foreground")}>{s.title}</span>
                            {already ? (
                              <span className="block truncate text-footnote text-muted-foreground">Já no repertório</span>
                            ) : (
                              s.artist && <span className="block truncate text-footnote text-muted-foreground">{s.artist}</span>
                            )}
                          </span>
                          {s.key_current && !already && (
                            <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
                              <span className="sr-only">Tom </span>
                              {s.key_current}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <p className="mx-4 mt-1.5 min-h-[18px] text-footnote text-muted-foreground" aria-live="polite">
              {newSelectedCount > 0 ? `${newSelectedCount} selecionada(s)` : ""}
            </p>
          </div>
        )}

        {mode === "manual" && (
          <form id="add-song-manual" className="min-w-0 pb-2" onSubmit={(e) => { e.preventDefault(); handleManual(); }}>
            {backLink}
            <label htmlFor="add-song-title" className={fieldLabel}>
              Nome da música
            </label>
            <div className={group}>
              <input
                id="add-song-title"
                placeholder="Ex: Bondade de Deus"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                autoComplete="off"
                enterKeyHint="done"
                className={fieldClass}
              />
            </div>
          </form>
        )}

        {mode === "import" && (
          <form id="add-song-import" className="min-w-0 pb-2" onSubmit={(e) => { e.preventDefault(); handleImport(); }}>
            {backLink}
            <label htmlFor="add-song-url" className={fieldLabel}>
              Link do Cifra Club
            </label>
            <div className={group}>
              <input
                id="add-song-url"
                type="text"
                inputMode="url"
                placeholder="https://www.cifraclub.com.br/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="go"
                className={fieldClass}
              />
            </div>
            {loading && (
              <div className="mt-3 flex items-center gap-3 px-4" role="status">
                <Loader2 className="h-[17px] w-[17px] animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="text-footnote text-muted-foreground">Importando do Cifra Club...</span>
              </div>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
