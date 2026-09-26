import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowRight, Copy, Trash2, Loader2, X } from "lucide-react";

interface Props {
  /** repertorio_songs.id values currently selected. */
  selectedRsIds: string[];
  /** song_id values matching the selection (parallel to selectedRsIds). */
  selectedSongIds: string[];
  currentRepertorioId: string;
  onDone: () => void;
  /** Sair do modo de seleção. No celular a saída fica na barra superior; no desktop, também aqui. */
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
  const moveCopyDisabled = busy || count === 0 || noTargets;

  // Item da barra: ícone sobre rótulo curto, alvo de 44pt (kit iOS 27 > Toolbar – Bottom).
  const itemClass =
    "relative z-[4] flex h-[54px] min-w-[60px] flex-col items-center justify-center gap-0.5 rounded-[27px] px-2 text-caption2 font-semibold transition-colors active:bg-fill-tertiary disabled:pointer-events-none disabled:opacity-35 [&_svg]:h-[22px] [&_svg]:w-[22px]";

  const targetMenu = (label: string, onPick: (id: string) => void) => (
    <DropdownMenuContent align="end" side="top" sideOffset={10} className="max-h-[50vh] w-64 overflow-y-auto">
      <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">{label}</DropdownMenuLabel>
      {repertorios.map((r: any) => (
        <DropdownMenuItem key={r.id} onSelect={() => onPick(r.id)}>
          <span className="truncate">{r.name}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );

  const bar = (
    <div
      role="toolbar"
      aria-label="Ações da seleção"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),8px)+78px)] z-40 flex justify-center px-[17px] lg:bottom-6 lg:left-72 lg:px-8"
    >
      <div className="liquid-glass-thick pointer-events-auto flex h-[62px] w-full max-w-xl items-center gap-0.5 rounded-full p-1">
        {/* Sair da seleção: no desktop as ações do cabeçalho rolam com a página, então a barra
            flutuante precisa da própria saída. No celular ela já fica fixa na barra superior. */}
        <button
          type="button"
          onClick={onClearSelection}
          aria-label="Cancelar seleção"
          title="Cancelar"
          className="relative z-[4] hidden h-[54px] w-[54px] shrink-0 place-items-center rounded-full bg-fill-tertiary text-foreground transition-colors active:bg-fill-secondary lg:grid"
        >
          <X className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
        </button>
        <div className="relative z-[4] flex min-w-0 flex-1 items-center gap-1.5 pl-3 pr-1 lg:pl-2" aria-live="polite">
          <span className="truncate text-subhead font-semibold text-foreground">{count} selecionada(s)</span>
          {busy && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />}
        </div>

        {/* Mover */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={itemClass} disabled={moveCopyDisabled}>
              <ArrowRight strokeWidth={2} aria-hidden="true" />
              Mover
            </button>
          </DropdownMenuTrigger>
          {targetMenu("Mover para…", handleMove)}
        </DropdownMenu>

        {/* Copiar */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={itemClass} disabled={moveCopyDisabled}>
              <Copy strokeWidth={2} aria-hidden="true" />
              Copiar
            </button>
          </DropdownMenuTrigger>
          {targetMenu("Copiar para…", handleCopy)}
        </DropdownMenu>

        {/* Remover */}
        <button type="button" className={`${itemClass} text-ios-red`} disabled={busy || count === 0} onClick={handleRemove}>
          <Trash2 strokeWidth={2} aria-hidden="true" />
          Remover
        </button>
      </div>
    </div>
  );

  // Portal: a barra flutua sobre o conteúdo, acima da barra de abas (spec §9).
  return typeof document !== "undefined" ? createPortal(bar, document.body) : bar;
}
