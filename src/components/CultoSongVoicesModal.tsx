import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Mic2 } from "lucide-react";
import { VOICE_PARTS, isVocalRole, shortInstrumentLabel } from "@/data/instruments";
import { MAX_VOICES, escalaVoicePart, voiceLabel } from "@/lib/voices";

interface CultoSongVoicesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Linha de culto_songs (não é o song_id). */
  cultoSongId: string | null;
  cultoId: string;
  songTitle?: string;
  /** Linhas de culto_lineup já carregadas na página do culto. */
  lineup: any[];
  canEdit: boolean;
}

type Assignment = { voice: number; voicePart: string | null };

/**
 * Define, para uma canção do roteiro, qual VOZ (1ª/2ª/3ª...) cada vocalista
 * escalado vai fazer — e, se for o caso, com qual naipe naquela canção
 * (por padrão herda o naipe da escala do culto).
 */
export function CultoSongVoicesModal({
  open,
  onOpenChange,
  cultoSongId,
  cultoId,
  songTitle,
  lineup,
  canEdit,
}: CultoSongVoicesModalProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({});

  // Vocalistas desta escala: ministrante, naipes e os "Back N" legados.
  const vocalists = useMemo(() => {
    const byMember = new Map<string, { memberId: string; name: string; avatar?: string | null; roles: string[] }>();
    (lineup ?? [])
      .filter((l: any) => isVocalRole(l.instrument))
      .forEach((l: any) => {
        const memberId = l.team_member_id as string;
        const profile = l.team_members?.profiles as any;
        const entry = byMember.get(memberId) ?? {
          memberId,
          name: profile?.full_name ?? "Sem nome",
          avatar: profile?.avatar_url,
          roles: [],
        };
        if (!entry.roles.includes(l.instrument)) entry.roles.push(l.instrument);
        byMember.set(memberId, entry);
      });
    return Array.from(byMember.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [lineup]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["culto-song-voices", cultoSongId],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_song_voices" as any)
        .select("*")
        .eq("culto_song_id", cultoSongId!);
      return (data ?? []) as any[];
    },
    enabled: !!cultoSongId && open,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const existing = useMemo(() => data ?? [], [data]);

  // Semeia o rascunho UMA VEZ por abertura. Sem o ref, o default `= []` da query
  // criava um array novo a cada render e o efeito ficava em laço enquanto o
  // fetch não voltava; e um refetch sobrescreveria marcações não salvas.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      seededFor.current = null;
      return;
    }
    if (!cultoSongId || isFetching || seededFor.current === cultoSongId) return;
    seededFor.current = cultoSongId;
    const valid = new Set(vocalists.map((v) => v.memberId));
    const map: Record<string, Assignment> = {};
    existing.forEach((row: any) => {
      // Descarta atribuições de quem já não está na escala vocal deste culto —
      // sem isso a linha ficava invisível na tela e era regravada a cada save.
      if (!valid.has(row.team_member_id)) return;
      map[row.team_member_id] = { voice: row.voice ?? 1, voicePart: row.voice_part ?? null };
    });
    setAssignments(map);
  }, [open, cultoSongId, isFetching, existing, vocalists]);

  const orphanCount = useMemo(() => {
    const valid = new Set(vocalists.map((v) => v.memberId));
    return existing.filter((row: any) => !valid.has(row.team_member_id)).length;
  }, [existing, vocalists]);

  const setVoice = (memberId: string, voice: number | null) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (voice === null) delete next[memberId];
      else next[memberId] = { voice, voicePart: prev[memberId]?.voicePart ?? null };
      return next;
    });
  };

  const setVoicePart = (memberId: string, part: string | null) => {
    setAssignments((prev) => {
      const current = prev[memberId];
      if (!current) return prev;
      return { ...prev, [memberId]: { ...current, voicePart: part } };
    });
  };

  /** Naipe que vale para a pessoa nesta canção: override, senão o da escala. */
  const effectivePart = (memberId: string, roles: string[]) =>
    assignments[memberId]?.voicePart ?? escalaVoicePart(roles);

  const grouped = useMemo(() => {
    const byVoice = new Map<number, { name: string; part: string | null }[]>();
    vocalists.forEach((v) => {
      const a = assignments[v.memberId];
      if (!a) return;
      const list = byVoice.get(a.voice) ?? [];
      list.push({ name: v.name, part: effectivePart(v.memberId, v.roles) });
      byVoice.set(a.voice, list);
    });
    return Array.from(byVoice.entries()).sort(([a], [b]) => a - b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, vocalists]);

  const handleSave = async () => {
    if (!cultoSongId) return;
    setSaving(true);

    const { error: delErr } = await supabase
      .from("culto_song_voices" as any)
      .delete()
      .eq("culto_song_id", cultoSongId);
    if (delErr) {
      toast({ title: "Erro ao salvar vozes", description: delErr.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Só grava quem realmente está na escala vocal deste culto.
    const valid = new Set(vocalists.map((v) => v.memberId));
    const rows = Object.entries(assignments)
      .filter(([memberId]) => valid.has(memberId))
      .map(([memberId, a]) => ({
        culto_song_id: cultoSongId,
        team_member_id: memberId,
        voice: a.voice,
        voice_part: a.voicePart,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from("culto_song_voices" as any).insert(rows as any);
      if (error) {
        toast({ title: "Erro ao salvar vozes", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    qc.invalidateQueries({ queryKey: ["culto-song-voices", cultoSongId] });
    qc.invalidateQueries({ queryKey: ["culto-voices", cultoId] });
    toast({ title: "Vozes salvas!" });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:rounded-2xl border-0 max-w-sm sm:max-w-lg max-h-[85vh] p-0">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mic2 className="h-4 w-4" /> Vozes da canção
          </DialogTitle>
          {songTitle && <p className="text-xs text-muted-foreground truncate">{songTitle}</p>}
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] px-5">
          {isLoading ? (
            <div className="space-y-2 pb-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 rounded-xl glass-subtle animate-pulse" />
              ))}
            </div>
          ) : vocalists.length === 0 ? (
            <p className="text-sm text-muted-foreground pb-6">
              Nenhum vocalista na escala deste culto ainda. Monte a escala com as funções de voz
              (Ministrante, Soprano, Contralto…) para poder distribuir as vozes das canções.
            </p>
          ) : (
            <div className="space-y-2 pb-4">
              {orphanCount > 0 && (
                <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] text-amber-700 dark:text-amber-300">
                  {orphanCount === 1
                    ? "1 pessoa que tinha voz nesta canção saiu da escala vocal do culto — ela será removida ao salvar."
                    : `${orphanCount} pessoas que tinham voz nesta canção saíram da escala vocal do culto — serão removidas ao salvar.`}
                </p>
              )}
              {vocalists.map((v) => {
                const a = assignments[v.memberId];
                const escalaPart = escalaVoicePart(v.roles);
                return (
                  <div key={v.memberId} className="rounded-xl glass-subtle p-3 space-y-2">
                    <div className="flex items-center gap-2.5">
                      <Avatar className="h-7 w-7">
                        {v.avatar && <AvatarImage src={v.avatar} />}
                        <AvatarFallback className="text-[10px] bg-accent">
                          {v.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate leading-tight">{v.name}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight">
                          escala: {v.roles.map(shortInstrumentLabel).join(", ")}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => setVoice(v.memberId, null)}
                        className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                          !a
                            ? "bg-accent text-foreground border-border"
                            : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/50"
                        }`}
                      >
                        Não canta
                      </button>
                      {Array.from({ length: MAX_VOICES }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setVoice(v.memberId, n)}
                          className={`text-[11px] px-2 py-1 rounded-lg border transition-colors ${
                            a?.voice === n
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-transparent text-muted-foreground border-border/60 hover:border-primary/50"
                          }`}
                        >
                          {voiceLabel(n)}
                        </button>
                      ))}
                    </div>

                    {a && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">
                          Naipe
                        </span>
                        <Select
                          value={a.voicePart ?? "__escala__"}
                          disabled={!canEdit}
                          onValueChange={(val) => setVoicePart(v.memberId, val === "__escala__" ? null : val)}
                        >
                          <SelectTrigger className="h-8 rounded-lg text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__escala__" className="text-xs">
                              {escalaPart ? `Da escala (${shortInstrumentLabel(escalaPart)})` : "Da escala"}
                            </SelectItem>
                            {VOICE_PARTS.map((p) => (
                              <SelectItem key={p} value={p} className="text-xs">
                                {shortInstrumentLabel(p)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                );
              })}

              {grouped.length > 0 && (
                <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-1">
                  <p className="text-[10px] font-medium text-primary uppercase tracking-wider">Resumo</p>
                  {grouped.map(([voice, people]) => (
                    <p key={voice} className="text-xs">
                      <span className="font-semibold">{voiceLabel(voice)}</span>{" "}
                      <span className="text-muted-foreground">
                        {people
                          .map((p) => (p.part ? `${p.name} (${shortInstrumentLabel(p.part)})` : p.name))
                          .join(", ")}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-2 p-5 pt-3 border-t border-border/40">
          <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
            {canEdit ? "Cancelar" : "Fechar"}
          </Button>
          {canEdit && vocalists.length > 0 && (
            <Button className="rounded-xl" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar vozes
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
