import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Music, Loader2, Sparkles, Shuffle } from "lucide-react";

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
  const { currentTeam, profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [theme, setTheme] = useState("");
  const [key, setKey] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("30");
  const [shuffle, setShuffle] = useState(true);
  // Destination: existing repertório (when opened from one) or a brand-new one.
  const [destination, setDestination] = useState<"current" | "new">(repertorioId ? "current" : "new");
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: songs = [] } = useQuery({
    queryKey: ["setlist-gen-songs", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("songs")
        .select("id, title, artist, key_current, theme, duration_seconds, audio_path, cifra_text")
        .eq("team_id", currentTeam.id);
      return data ?? [];
    },
    enabled: !!currentTeam && open,
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
    if (!currentTeam) return;
    const picked = selection.picked;
    if (picked.length === 0) {
      toast({ title: "Nenhuma música encontrada", description: "Ajuste os filtros e tente de novo.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      let targetRepId = repertorioId;

      if (destination === "new" || !repertorioId) {
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass sm:rounded-2xl border-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Gerar setlist
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tema</label>
              <Select value={theme || "all"} onValueChange={(v) => setTheme(v === "all" ? "" : v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Qualquer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer tema</SelectItem>
                  {themes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Tom</label>
              <Select value={key || "all"} onValueChange={(v) => setKey(v === "all" ? "" : v)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Qualquer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Qualquer tom</SelectItem>
                  {keys.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Duração (min)</label>
              <GlassInput
                type="number"
                min={1}
                value={targetMinutes}
                onChange={(e) => setTargetMinutes(e.target.value)}
                placeholder="30"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShuffle((s) => !s)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Checkbox checked={shuffle} onCheckedChange={(c) => setShuffle(!!c)} className="pointer-events-none" />
            <Shuffle className="h-3.5 w-3.5" /> Embaralhar seleção
          </button>

          {/* Preview */}
          <div className="rounded-xl bg-accent/40 p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-muted-foreground">
                Prévia · {selection.picked.length} música(s) · ~{totalMin} min
              </p>
            </div>
            {selection.picked.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 text-center">
                Nenhuma música corresponde aos filtros.
              </p>
            ) : (
              <ScrollArea className="max-h-40">
                <div className="space-y-1 pr-2">
                  {selection.picked.map((s: any, i: number) => (
                    <div key={s.id} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-center text-xs text-muted-foreground shrink-0">{i + 1}</span>
                      <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate flex-1">{s.title}</span>
                      {s.key_current && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-muted-foreground shrink-0">
                          {s.key_current}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* Destination */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Destino</label>
            {repertorioId && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={destination === "current" ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl flex-1"
                  onClick={() => setDestination("current")}
                >
                  Este repertório
                </Button>
                <Button
                  type="button"
                  variant={destination === "new" ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl flex-1"
                  onClick={() => setDestination("new")}
                >
                  Novo repertório
                </Button>
              </div>
            )}
            {(destination === "new" || !repertorioId) && (
              <GlassInput
                placeholder="Nome do novo repertório (opcional)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" className="rounded-xl" onClick={() => handleClose(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button className="rounded-xl gap-2" onClick={handleGenerate} disabled={loading || selection.picked.length === 0}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Gerar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
