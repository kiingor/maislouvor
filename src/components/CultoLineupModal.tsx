import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { firePush } from "@/lib/push";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { compareInstruments, instrumentIcon } from "@/data/instruments";
import { InstrumentPicker } from "@/components/InstrumentPicker";
import { AlertTriangle, Loader2, Users } from "lucide-react";
import {
  DEFAULT_AVAILABILITY_MODE,
  activeAvailabilityStatus,
  isMemberEligibleForLineup,
  type AvailabilityStatus,
} from "@/lib/availability";

interface CultoLineupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cultoId: string;
  cultoDate?: string; // "YYYY-MM-DD"
  cultoName?: string;
}

export function CultoLineupModal({ open, onOpenChange, cultoId, cultoDate, cultoName }: CultoLineupModalProps) {
  const { currentTeam, profileId } = useTeam();
  const availabilityMode = currentTeam?.availability_mode ?? DEFAULT_AVAILABILITY_MODE;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);
  // Map: instrument -> member_id[]
  const [lineup, setLineup] = useState<Record<string, string[]>>({});
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);

  // Fetch team members with instruments
  const { data: members = [] } = useQuery({
    queryKey: ["team-members", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("team_members")
        .select("id, role, profile_id, instruments, profiles(id, full_name, avatar_url)")
        .eq("team_id", currentTeam.id);
      return data ?? [];
    },
    enabled: !!currentTeam && open,
  });

  // Fetch existing lineup.
  //
  // Sem `refetchOnWindowFocus` desligado, sair do app e voltar (ir no WhatsApp,
  // por exemplo) refazia esta query e o efeito de hidratação abaixo jogava fora
  // a escala que o líder estava montando. Mesmo motivo do SongEditor.
  const { data: existingLineup = [], isFetching: fetchingLineup } = useQuery({
    queryKey: ["culto-lineup-edit", cultoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_lineup")
        .select("*")
        .eq("culto_id", cultoId);
      return data ?? [];
    },
    enabled: !!cultoId && open,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const memberIds = (members as any[])
    .map((member: any) => member.id as string)
    .sort();

  // Fetch the active team's availability responses for the culto date.
  const { data: availabilityEntries = [] } = useQuery({
    queryKey: ["culto-availability", currentTeam?.id, cultoDate, memberIds],
    queryFn: async () => {
      if (!cultoDate || memberIds.length === 0) return [];
      const { data } = await supabase
        .from("member_availability")
        .select("team_member_id, status, instruments")
        .eq("available_date", cultoDate)
        .in("team_member_id", memberIds);
      return data ?? [];
    },
    enabled: !!cultoDate && open && memberIds.length > 0,
  });

  // Hidrata o rascunho a partir do banco UMA VEZ por abertura do modal.
  //
  // Antes o efeito rodava a cada nova referência de `existingLineup` e nunca
  // limpava o state ao fechar: quem cancelava uma edição via as mudanças
  // descartadas voltarem no salvamento seguinte (e como o save agora é por
  // diferença, isso apagava gente confirmada). O ref garante uma hidratação por
  // abertura; ao fechar, o rascunho é descartado.
  const [hydratedCultoId, setHydratedCultoId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      if (hydratedCultoId !== null) setHydratedCultoId(null);
      return;
    }
    if (fetchingLineup || hydratedCultoId === cultoId) return;
    const instruments = new Set<string>();
    const map: Record<string, string[]> = {};
    (existingLineup as any[]).forEach((l: any) => {
      instruments.add(l.instrument);
      if (!map[l.instrument]) map[l.instrument] = [];
      map[l.instrument].push(l.team_member_id);
    });
    setSelectedInstruments(Array.from(instruments).sort(compareInstruments));
    setLineup(map);
    setHydratedCultoId(cultoId);
  }, [open, cultoId, fetchingLineup, existingLineup, hydratedCultoId]);

  /** Enquanto o rascunho não foi carregado do banco, salvar apagaria a escala. */
  const ready = hydratedCultoId === cultoId;

  const toggleInstrument = (inst: string) => {
    if (selectedInstruments.includes(inst)) {
      setSelectedInstruments(selectedInstruments.filter((i) => i !== inst));
      const newLineup = { ...lineup };
      delete newLineup[inst];
      setLineup(newLineup);
    } else {
      setSelectedInstruments([...selectedInstruments, inst].sort(compareInstruments));
    }
  };

  const toggleMember = (instrument: string, memberId: string) => {
    const current = lineup[instrument] || [];
    const updated = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    setLineup({ ...lineup, [instrument]: updated });
  };

  const hasAvailableResponsesForInstrument = (instrument: string) =>
    (availabilityEntries as any[]).some((entry: any) => {
      const status = activeAvailabilityStatus(
        availabilityMode,
        (entry.status ?? "available") as AvailabilityStatus,
      );
      const instruments: string[] = entry.instruments ?? [];
      return status === "available" && (instruments.length === 0 || instruments.includes(instrument));
    });

  const isMemberEligibleForInstrument = (member: any, instrument: string) => {
    const memberInstruments: string[] = member.instruments || [];
    if (!memberInstruments.includes(instrument)) return false;

    const entry = (availabilityEntries as any[]).find((item: any) => item.team_member_id === member.id);
    const status = activeAvailabilityStatus(
      availabilityMode,
      (entry?.status ?? undefined) as AvailabilityStatus | undefined,
    );
    const availableInstruments: string[] = entry?.instruments ?? [];
    if (
      status === "available" &&
      availableInstruments.length > 0 &&
      !availableInstruments.includes(instrument)
    ) {
      return false;
    }

    return isMemberEligibleForLineup(
      availabilityMode,
      status,
      hasAvailableResponsesForInstrument(instrument),
    );
  };

  // Keep already-selected conflicts visible so the leader can remove them.
  const getMembersForInstrument = (instrument: string) => {
    const selected = lineup[instrument] || [];
    return members.filter((member: any) =>
      selected.includes(member.id) || isMemberEligibleForInstrument(member, instrument),
    );
  };

  const hasLineupConflicts = selectedInstruments.some((instrument) =>
    (lineup[instrument] || []).some((memberId) => {
      const member = (members as any[]).find((candidate: any) => candidate.id === memberId);
      return !member || !isMemberEligibleForInstrument(member, instrument);
    }),
  );

  const handleSave = async () => {
    // Guarda dura: sem o rascunho hidratado, `desiredRows` sairia vazio e o
    // diff apagaria a escala inteira.
    if (!ready) return;
    if (hasLineupConflicts) {
      toast({
        title: "Revise a disponibilidade da escala",
        description: "Remova os membros sinalizados antes de salvar.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);

    // Salvamento por DIFERENÇA (não apaga-e-recria).
    //
    // Antes o save fazia DELETE de toda a culto_lineup do culto e reinseria tudo:
    // como `status` volta ao default ('pending') em cada INSERT, qualquer mexida na
    // escala zerava a confirmação de TODO mundo. Agora só tocamos no que mudou —
    // quem continua na mesma função mantém o "aceitou/recusou" que já tinha, e só
    // quem mudou de função volta a ficar pendente (a linha nova nasce 'pending').
    const rowKey = (instrument: string, memberId: string) => `${instrument} ${memberId}`;

    const existingRows = existingLineup as any[];
    const existingKeys = new Set<string>(existingRows.map((l) => rowKey(l.instrument, l.team_member_id)));

    const desiredRows: { instrument: string; team_member_id: string }[] = [];
    selectedInstruments.forEach((inst) => {
      (lineup[inst] || []).forEach((memberId) => desiredRows.push({ instrument: inst, team_member_id: memberId }));
    });
    const desiredKeys = new Set<string>(desiredRows.map((r) => rowKey(r.instrument, r.team_member_id)));

    const idsToDelete = existingRows
      .filter((l) => !desiredKeys.has(rowKey(l.instrument, l.team_member_id)))
      .map((l) => l.id as string);

    const rowsToInsert = desiredRows
      .filter((r) => !existingKeys.has(rowKey(r.instrument, r.team_member_id)))
      .map((r) => ({ culto_id: cultoId, team_member_id: r.team_member_id, instrument: r.instrument }));

    if (idsToDelete.length > 0) {
      const { error } = await supabase.from("culto_lineup").delete().in("id", idsToDelete);
      if (error) {
        toast({ title: "Erro ao salvar escala", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    if (rowsToInsert.length > 0) {
      const { error } = await supabase.from("culto_lineup").insert(rowsToInsert as any);
      if (error) {
        toast({ title: "Erro ao salvar escala", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    // Funções por membro (antes x depois) para saber quem entrou e quem trocou de função.
    const instrumentsByMember = (rows: { instrument: string; team_member_id: string }[]) => {
      const map = new Map<string, string[]>();
      rows.forEach((r) => {
        const list = map.get(r.team_member_id) ?? [];
        list.push(r.instrument);
        map.set(r.team_member_id, list.sort());
      });
      return map;
    };
    const before = instrumentsByMember(existingRows.map((l) => ({ instrument: l.instrument, team_member_id: l.team_member_id })));
    const after = instrumentsByMember(desiredRows);

    const addedMemberIds: string[] = [];
    const changedMemberIds: string[] = [];
    after.forEach((instrs, memberId) => {
      const prev = before.get(memberId);
      if (!prev) addedMemberIds.push(memberId);
      else if (prev.join("|") !== instrs.join("|")) changedMemberIds.push(memberId);
    });

    if ((addedMemberIds.length > 0 || changedMemberIds.length > 0) && currentTeam) {
      const dateLabel = cultoDate
        ? new Date(cultoDate + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long" })
        : "";
      const buildNotif = (memberId: string, title: string, body: string) => {
        const m = (members as any[]).find((mm: any) => mm.id === memberId);
        const pid = m?.profile_id;
        if (!pid) return null;
        return {
          profile_id: pid,
          type: "lineup",
          title,
          body,
          link: `/app/cultos/${cultoId}`,
          team_id: currentTeam.id,
          sender_profile_id: profileId,
        };
      };
      const notifs = [
        ...addedMemberIds.map((memberId) =>
          buildNotif(
            memberId,
            "🎶 Você está na escala!",
            `Bora servir em ${cultoName || "um culto"}${dateLabel ? ` • ${dateLabel}` : ""}. Conta com você! 🙌`,
          ),
        ),
        // Trocou de função → a confirmação anterior não vale mais, precisa confirmar de novo.
        ...changedMemberIds.map((memberId) =>
          buildNotif(
            memberId,
            "🔄 Sua função na escala mudou",
            `Em ${cultoName || "um culto"}${dateLabel ? ` • ${dateLabel}` : ""} você agora está em ${(after.get(memberId) ?? []).join(", ")}. Confirma de novo? 🙏`,
          ),
        ),
      ].filter(Boolean);
      if (notifs.length > 0) {
        await supabase.from("notifications").insert(notifs as any);
        await firePush(
          currentTeam.id,
          (notifs as any[]).map((n) => ({ profile_id: n.profile_id, title: n.title, body: n.body, link: n.link })),
        );
      }
    }

    toast({ title: "Escala salva!" });
    qc.invalidateQueries({ queryKey: ["culto-lineup", cultoId] });
    qc.invalidateQueries({ queryKey: ["culto-lineup-edit", cultoId] });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:rounded-2xl border-0 max-w-sm sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Escala do Culto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Select instruments for this culto */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Funções neste culto</p>
            <InstrumentPicker selected={selectedInstruments} onToggle={toggleInstrument} />
          </div>

          {/* For each selected instrument, show available members */}
          {selectedInstruments.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Membros por função</p>
              {selectedInstruments.map((inst) => {
                const available = getMembersForInstrument(inst);
                const selected = lineup[inst] || [];
                const Icon = instrumentIcon(inst);
                return (
                  <div key={inst} className="rounded-xl border border-border/50 p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      <Icon className="h-4 w-4 text-primary" />
                      {inst}
                    </p>
                    {available.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {cultoDate ? "Nenhum membro disponível nesta data para esta função." : "Nenhum membro configurado para esta função."}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {available.map((m: any) => {
                          const profile = m.profiles as any;
                          const isSelected = selected.includes(m.id);
                          const isEligible = isMemberEligibleForInstrument(m, inst);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleMember(inst, m.id)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                                isSelected && !isEligible
                                  ? "bg-amber-500/10 border border-amber-500/40"
                                  : isSelected
                                  ? "bg-primary/10 border border-primary/30"
                                  : "bg-accent/30 border border-transparent hover:border-border"
                              }`}
                            >
                              <Avatar className="h-7 w-7">
                                {profile?.avatar_url && <AvatarImage src={profile.avatar_url} />}
                                <AvatarFallback className="text-[10px] bg-accent">
                                  {(profile?.full_name ?? "?")[0]?.toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm flex-1">{profile?.full_name ?? "Sem nome"}</span>
                              {isSelected && !isEligible ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3" /> Remover
                                </span>
                              ) : isSelected ? (
                                <span className="text-[10px] font-medium text-primary">✓</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasLineupConflicts && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Há membros selecionados fora da disponibilidade atual. Remova os itens sinalizados para salvar a escala.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 -mx-6 px-6 pb-1 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="rounded-xl" onClick={handleSave} disabled={saving || hasLineupConflicts || !ready}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar escala
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
