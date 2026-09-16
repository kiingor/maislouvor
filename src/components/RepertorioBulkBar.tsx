import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowRight, Copy, Trash2, Loader2, X } from "lucide-react";

interface Props {
  /** repertorio_songs.id values currently selected. */
  selectedRsIds: string[];
  /** song_id values matching the selection (parallel to selectedRsIds). */
  selectedSongIds: string[];
  currentRepertorioId: string;
  onDone: () => void;
  onClearSelection: () => void;
}

export function RepertorioBulkBar({
  selectedRsIds,
  selectedSongIds,
  currentRepertorioId,
  onDone,
  onClearSelection,
}: Props) {
  const { currentTeam } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: repertorios = [] } = useQuery({
    queryKey: ["repertorios-bulk-targets", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("repertorios")
        .select("id, name")
        .eq("team_id", currentTeam.id)
        .order("created_at", { ascending: false });
      return (data ?? []).filter((r: any) => r.id !== currentRepertorioId);
    },
    enabled: !!currentTeam,
  });

  const count = selectedRsIds.length;

  // Insert selected songs into a target repertório, appending after its current max sort_order,
  // skipping songs already present there.
  const copyTo = async (targetId: string) => {
    const { data: existing } = await supabase
      .from("repertorio_songs")
      .select("song_id, sort_order")
      .eq("repertorio_id", targetId);

    const present = new Set((existing ?? []).map((r: any) => r.song_id));
    const maxOrder = (existing ?? []).reduce((m: number, r: any) => Math.max(m, r.sort_order ?? -1), -1);

    const toInsert = selectedSongIds
      .filter((sid) => !present.has(sid))
      .map((sid, i) => ({ repertorio_id: targetId, song_id: sid, sort_order: maxOrder + 1 + i }));

    if (toInsert.length === 0) return { inserted: 0 };
    const { error } = await supabase.from("repertorio_songs").insert(toInsert);
    if (error) throw error;
    return { inserted: toInsert.length };
  };

  const handleCopy = async (targetId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const { inserted } = await copyTo(targetId);
      qc.invalidateQueries({ queryKey: ["repertorio-songs", targetId] });
      toast({
        title: "Músicas copiadas",
        description: inserted < count ? `${inserted} de ${count} (algumas já existiam).` : `${inserted} música(s).`,
      });
      onDone();
    } catch (e: any) {
      toast({ title: "Erro ao copiar", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (targetId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await copyTo(targetId);
      const { error } = await supabase.from("repertorio_songs").delete().in("id", selectedRsIds);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["repertorio-songs", targetId] });
      qc.invalidateQueries({ queryKey: ["repertorio-songs", currentRepertorioId] });
      toast({ title: "Músicas movidas", description: `${count} música(s).` });
      onDone();
    } catch (e: any) {
      toast({ title: "Erro ao mover", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("repertorio_songs").delete().in("id", selectedRsIds);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["repertorio-songs", currentRepertorioId] });
      toast({ title: "Removidas do repertório", description: `${count} música(s).` });
      onDone();
    } catch (e: any) {
      toast({ title: "Erro ao remover", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const noTargets = repertorios.length === 0;

  return (
    <div className="sticky bottom-24 z-20 mx-auto max-w-2xl">
      <div className="glass rounded-2xl p-3 flex flex-wrap items-center gap-2 shadow-lg border border-border/50">
        <div className="flex items-center gap-2 mr-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={onClearSelection} title="Cancelar">
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{count} selecionada(s)</span>
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Move */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" disabled={busy || count === 0 || noTargets}>
              <ArrowRight className="h-3.5 w-3.5" /> Mover
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-[14rem] p-2">
            <p className="text-xs text-muted-foreground px-1 pb-1.5">Mover para…</p>
            <Select onValueChange={handleMove}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Escolher repertório" /></SelectTrigger>
              <SelectContent className="max-h-[50vh]">
                {repertorios.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </PopoverContent>
        </Popover>

        {/* Copy */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" disabled={busy || count === 0 || noTargets}>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-[14rem] p-2">
            <p className="text-xs text-muted-foreground px-1 pb-1.5">Copiar para…</p>
            <Select onValueChange={handleCopy}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Escolher repertório" /></SelectTrigger>
              <SelectContent className="max-h-[50vh]">
                {repertorios.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </PopoverContent>
        </Popover>

        {/* Remove */}
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
          disabled={busy || count === 0}
          onClick={handleRemove}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remover
        </Button>
      </div>
    </div>
  );
}
