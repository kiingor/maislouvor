import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogToolbar } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Mic2 } from "lucide-react";
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

// Lista agrupada dentro da folha (protótipo `.group` / `.group-label`).
// Na folha, --card já vira branco (claro) / #2C2C2E (escuro) — ver ui/dialog.tsx.
const group = "overflow-hidden rounded-card bg-card";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const row = "relative flex min-h-[52px] items-center gap-3 px-4";
const rowSeparator = "before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border";

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

  const canSave = canEdit && vocalists.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {canSave ? (
          <DialogToolbar
            title="Vozes da canção"
            confirm={{ label: "Salvar vozes", onClick: handleSave, disabled: saving, loading: saving }}
          />
        ) : (
          <DialogHeader>
            <DialogTitle>Vozes da canção</DialogTitle>
          </DialogHeader>
        )}
        {songTitle && <p className="-mt-2 truncate text-center text-footnote text-muted-foreground">{songTitle}</p>}

        {isLoading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${group} h-[104px] animate-pulse`} />
            ))}
          </div>
        ) : vocalists.length === 0 ? (
          <div className={`${group} flex items-start gap-3 p-4`}>
            <Mic2 className="mt-0.5 h-6 w-6 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
            <p className="text-subhead text-muted-foreground">
              Nenhum vocalista na escala deste culto ainda. Monte a escala com as funções de voz
              (Ministrante, Soprano, Contralto…) para poder distribuir as vozes das canções.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orphanCount > 0 && (
              <div className={`${group} flex items-start gap-3 px-4 py-3`} role="status">
                <AlertTriangle className="mt-px h-[17px] w-[17px] shrink-0 text-ios-orange" strokeWidth={2.25} aria-hidden="true" />
                <p className="text-footnote text-foreground">
                  {orphanCount === 1
                    ? "1 pessoa que tinha voz nesta canção saiu da escala vocal do culto — ela será removida ao salvar."
                    : `${orphanCount} pessoas que tinham voz nesta canção saíram da escala vocal do culto — serão removidas ao salvar.`}
                </p>
              </div>
            )}
            {vocalists.map((v) => {
              const a = assignments[v.memberId];
              const escalaPart = escalaVoicePart(v.roles);
              const segment = (selected: boolean) =>
                `relative min-w-0 rounded-full px-1 text-footnote font-medium transition-[background-color,box-shadow] duration-200 disabled:cursor-default ${
                  selected ? "bg-card text-foreground shadow dark:bg-prominent" : "text-foreground"
                }`;
              return (
                <div key={v.memberId} className={group}>
                  <div className="flex items-center gap-3 px-4 pt-3">
                    <Avatar className="h-8 w-8">
                      {v.avatar && <AvatarImage src={v.avatar} />}
                      <AvatarFallback className="text-footnote">{v.name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body text-foreground">{v.name}</p>
                      <p className="truncate text-footnote text-muted-foreground">
                        escala: {v.roles.map(shortInstrumentLabel).join(", ")}
                      </p>
                    </div>
                  </div>

                  {/* Controle segmentado: Não canta | 1ª | 2ª | 3ª | 4ª */}
                  <div className="px-4 py-3">
                    <div
                      role="radiogroup"
                      aria-label={`Voz de ${v.name}`}
                      className="grid h-9 grid-cols-[1.7fr_repeat(4,minmax(0,1fr))] gap-0.5 rounded-full bg-fill-tertiary p-0.5"
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!a}
                        disabled={!canEdit}
                        onClick={() => setVoice(v.memberId, null)}
                        className={segment(!a)}
                      >
                        Não canta
                      </button>
                      {Array.from({ length: MAX_VOICES }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="radio"
                          aria-checked={a?.voice === n}
                          aria-label={voiceLabel(n)}
                          disabled={!canEdit}
                          onClick={() => setVoice(v.memberId, n)}
                          className={segment(a?.voice === n)}
                        >
                          {n}ª
                        </button>
                      ))}
                    </div>
                  </div>

                  {a && (
                    <div className={`${row} ${rowSeparator} justify-between`}>
                      <span className="text-body text-foreground" id={`naipe-${v.memberId}`}>Naipe</span>
                      <Select
                        value={a.voicePart ?? "__escala__"}
                        disabled={!canEdit}
                        onValueChange={(val) => setVoicePart(v.memberId, val === "__escala__" ? null : val)}
                      >
                        <SelectTrigger
                          aria-labelledby={`naipe-${v.memberId}`}
                          className="h-9 w-auto max-w-[60%] rounded-full pl-3.5 pr-2.5 text-subhead disabled:opacity-100"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__escala__">
                            {escalaPart ? `Da escala (${shortInstrumentLabel(escalaPart)})` : "Da escala"}
                          </SelectItem>
                          {VOICE_PARTS.map((p) => (
                            <SelectItem key={p} value={p}>
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
              <div className="pt-3">
                <p className={groupLabel}>Resumo</p>
                <ul className={group}>
                  {grouped.map(([voice, people], i) => (
                    <li key={voice} className={`relative px-4 py-2.5 ${i > 0 ? rowSeparator : ""}`}>
                      <p className="text-headline text-foreground">{voiceLabel(voice)}</p>
                      <p className="text-subhead text-muted-foreground">
                        {people
                          .map((p) => (p.part ? `${p.name} (${shortInstrumentLabel(p.part)})` : p.name))
                          .join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
