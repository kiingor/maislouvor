import { useMusicManagement } from "@/hooks/useMusicManagement";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ChevronsUpDown, Shuffle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** When provided, generated songs are appended to this repertório. */
  repertorioId?: string;
  /** Called after songs are persisted (so the caller can refetch). */
  onGenerated?: () => void;
}

const DEFAULT_DURATION = 240; // fallback seconds per song

export function SetlistGeneratorModal({ open, onOpenChange, repertorioId, onGenerated }: Props) {
  const { currentTeam, profileId, can } = useTeam();
  const { canCreateRepertoire } = useMusicManagement();
  const canEdit = can("repertorios", "editar");
  const { toast } = useToast();
  const qc = useQueryClient();

  const [theme, setTheme] = useState("");
  const [key, setKey] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("30");
  const [shuffle, setShuffle] = useState(true);
  // Destination: existing repertório (when opened from one) or a brand-new one.
  const [destination, setDestination] = useState<"current" | "new">(repertorioId ? "current" : "new");
  const effectiveDestination = canCreateRepertoire ? destination : "current";
  const allowed = canEdit && (!!repertorioId || canCreateRepertoire);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: songs = [] } = useQuery({
    queryKey: ["setlist-gen-songs", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("songs")
        .select("id, title, artist, key_current, theme, duration_seconds, audio_path, cifra_text")
        .eq("team_id", currentTeam.id)
        // Rascunhos são de quem os começou (o catálogo e o repertório também os escondem).
        .eq("is_draft" as never, false);
      return data ?? [];
    },
    enabled: allowed && !!currentTeam && open,
  });

  const themes = useMemo(
    () => [...new Set(songs.map((s: any) => s.theme).filter(Boolean))].sort() as string[],
    [songs]
  );
  const keys = useMemo(
    () => [...new Set(songs.map((s: any) => s.key_current).filter(Boolean))].sort() as string[],
    [songs]
  );

  // Live preview of the selected songs.
  const selection = useMemo(() => {
    const targetSeconds = (parseInt(targetMinutes, 10) || 0) * 60;
    let pool = songs.filter((s: any) => {
      const matchTheme = !theme || s.theme === theme;
      const matchKey = !key || s.key_current === key;
      return matchTheme && matchKey;
    });
    if (shuffle) {
      pool = [...pool];
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    const picked: any[] = [];
    let acc = 0;
    if (targetSeconds <= 0) return { picked, acc };
    for (const s of pool) {
      if (acc >= targetSeconds) break;
      picked.push(s);
      acc += s.duration_seconds || DEFAULT_DURATION;
    }
    return { picked, acc };
  }, [songs, theme, key, targetMinutes, shuffle]);

  const reset = () => {
    setTheme("");
    setKey("");
    setTargetMinutes("30");
    setShuffle(true);
    setDestination(repertorioId ? "current" : "new");
    setNewName("");
    setLoading(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const handleGenerate = async () => {
    if (!allowed || !currentTeam) return;
    const picked = selection.picked;
    if (picked.length === 0) {
      toast({ title: "Nenhuma música encontrada", description: "Ajuste os filtros e tente de novo.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      let targetRepId = repertorioId;

      if (effectiveDestination === "new" || !repertorioId) {
        if (!canCreateRepertoire) return;
        const name = newName.trim() || `Setlist${theme ? ` · ${theme}` : ""}`;
        const { data: rep, error } = await supabase
          .from("repertorios")
          .insert({ name, team_id: currentTeam.id, created_by: profileId })
          .select("id")
          .single();
        if (error || !rep) throw error || new Error("Falha ao criar repertório");
        targetRepId = rep.id;
      }

      // Skip songs already in the target repertório — (repertorio_id, song_id) is unique.
      const { data: existing } = await supabase
        .from("repertorio_songs")
        .select("song_id, sort_order")
        .eq("repertorio_id", targetRepId!);
      const existingIds = new Set((existing ?? []).map((r: any) => r.song_id));
      const toInsert = picked.filter((s: any) => !existingIds.has(s.id));

      if (toInsert.length === 0) {
        toast({
          title: "Tudo já está no repertório",
          description: "As músicas selecionadas já fazem parte deste repertório.",
          variant: "destructive",
        });
        return;
      }

      // Continue sort_order after whatever is already in the target repertório.
      const base = (existing ?? []).reduce((m: number, r: any) => Math.max(m, r.sort_order ?? -1), -1) + 1;

      const rows = toInsert.map((s: any, i: number) => ({
        repertorio_id: targetRepId,
        song_id: s.id,
        sort_order: base + i,
      }));
      const { error: insErr } = await supabase.from("repertorio_songs").insert(rows);
      if (insErr) throw insErr;

      qc.invalidateQueries({ queryKey: ["repertorios"] });
      if (targetRepId) qc.invalidateQueries({ queryKey: ["repertorio-songs", targetRepId] });
      const skipped = picked.length - toInsert.length;
      toast({
        title: "Setlist gerada!",
        description: `${toInsert.length} música(s) adicionada(s)${skipped ? ` · ${skipped} já estava(m) no repertório` : ""}.`,
      });
      onGenerated?.();
      handleClose(false);
    } catch (e: any) {
      toast({ title: "Erro ao gerar setlist", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const totalMin = Math.round(selection.acc / 60);

  const group = "overflow-hidden rounded-card bg-card";
  const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
  const row = "relative flex min-h-[52px] items-center gap-3 px-4 py-1.5";
  const sep = <span aria-hidden="true" className="pointer-events-none absolute left-4 right-0 top-0 border-t border-separator" />;
  const pullDown =
    "-mr-2 inline-flex h-11 min-w-0 max-w-[60%] items-center gap-1 rounded-full px-2 text-body text-muted-foreground transition-colors active:bg-fill-tertiary";

  return (
    <Dialog open={open && allowed} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogToolbar
          title="Gerar setlist"
          confirm={{
            label: "Gerar",
            onClick: handleGenerate,
            disabled: loading || selection.picked.length === 0,
            loading,
            icon: "none",
          }}
        />

        <div className="min-w-0 space-y-6 pb-2">
          {/* Critérios */}
          <div className={group}>
            <div className={row}>
              <span className="flex-1 text-body text-foreground">Tema</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={pullDown}>
                    <span className="truncate">{theme || "Qualquer tema"}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[50vh] overflow-y-auto">
                  <DropdownMenuRadioGroup value={theme || "all"} onValueChange={(v) => setTheme(v === "all" ? "" : v)}>
                    <DropdownMenuRadioItem value="all">Qualquer tema</DropdownMenuRadioItem>
                    {themes.map((t) => <DropdownMenuRadioItem key={t} value={t}>{t}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className={row}>
              {sep}
              <span className="flex-1 text-body text-foreground">Tom</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={pullDown}>
                    <span className="truncate">{key || "Qualquer tom"}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[50vh] overflow-y-auto">
                  <DropdownMenuRadioGroup value={key || "all"} onValueChange={(v) => setKey(v === "all" ? "" : v)}>
                    <DropdownMenuRadioItem value="all">Qualquer tom</DropdownMenuRadioItem>
                    {keys.map((k) => <DropdownMenuRadioItem key={k} value={k}>{k}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <label className={row}>
              {sep}
              <span className="flex-1 text-body text-foreground">Duração (min)</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
                placeholder="30"
                className="h-11 w-20 bg-transparent text-right text-body tabular-nums text-muted-foreground placeholder:text-label-tertiary outline-none focus-visible:outline-none focus:text-foreground"
              />
            </label>
            <div className={row}>
              {sep}
              <label htmlFor="setlist-shuffle" className="flex flex-1 items-center gap-2 text-body text-foreground">
                <Shuffle className="h-[17px] w-[17px] text-muted-foreground" strokeWidth={2} aria-hidden="true" />
                Embaralhar seleção
              </label>
              <Switch id="setlist-shuffle" checked={shuffle} onCheckedChange={(c) => setShuffle(!!c)} />
            </div>
          </div>

          {/* Preview */}
          <div>
            <p className={groupLabel} aria-live="polite">
              Prévia · {selection.picked.length} música(s) · ~{totalMin} min
            </p>
            <div className={group}>
              {selection.picked.length === 0 ? (
                <p className="px-4 py-6 text-center text-footnote text-muted-foreground">
                  Nenhuma música corresponde aos filtros.
                </p>
              ) : (
                <ol className="max-h-60 overflow-y-auto overscroll-contain">
                  {selection.picked.map((s: any, i: number) => (
                    <li key={s.id} className="relative flex min-h-11 items-center gap-3 px-4 py-2">
                      {i > 0 && <span aria-hidden="true" className="pointer-events-none absolute left-[52px] right-0 top-0 border-t border-separator" />}
                      <span className="w-6 shrink-0 text-center text-footnote tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-body text-foreground">{s.title}</span>
                      {s.key_current && (
                        <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
                          <span className="sr-only">Tom </span>
                          {s.key_current}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {/* Destination */}
          <div>
            {repertorioId && canCreateRepertoire && (
              <>
                <span className={groupLabel} id="setlist-destination-label">Destino</span>
                <div
                  role="radiogroup"
                  aria-labelledby="setlist-destination-label"
                  className="grid grid-cols-2 gap-0.5 rounded-full bg-fill-tertiary p-0.5"
                >
                  {([
                    ["current", "Este repertório"],
                    ["new", "Novo repertório"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={destination === value}
                      onClick={() => setDestination(value)}
                      className={cn(
                        "relative min-h-8 rounded-full px-3 py-1 text-subhead font-medium text-foreground transition-[background-color,box-shadow] duration-200",
                        "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
                        destination === value && "bg-card shadow dark:bg-prominent",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {canCreateRepertoire && (effectiveDestination === "new" || !repertorioId) && (
              <div className={cn(repertorioId && "mt-4")}>
                <label htmlFor="setlist-new-name" className={groupLabel}>
                  Nome do novo repertório
                </label>
                <div className={group}>
                  <input
                    id="setlist-new-name"
                    placeholder="Opcional"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoComplete="off"
                    className="h-[52px] w-full bg-transparent px-4 text-body text-foreground placeholder:text-label-tertiary outline-none focus-visible:outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
