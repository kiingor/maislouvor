import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { INSTRUMENTS, INSTRUMENT_ICONS } from "@/data/instruments";
import { Loader2, Users, X } from "lucide-react";

interface CultoLineupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cultoId: string;
  cultoDate?: string; // "YYYY-MM-DD"
}

export function CultoLineupModal({ open, onOpenChange, cultoId, cultoDate }: CultoLineupModalProps) {
  const { currentTeam } = useTeam();
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

  // Fetch existing lineup
  const { data: existingLineup = [] } = useQuery({
    queryKey: ["culto-lineup-edit", cultoId],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_lineup")
        .select("*")
        .eq("culto_id", cultoId);
      return data ?? [];
    },
    enabled: !!cultoId,
  });

  // Fetch availability for the culto date
  const { data: availableMemberIds = [] } = useQuery({
    queryKey: ["culto-availability", cultoDate],
    queryFn: async () => {
      if (!cultoDate) return [];
      const { data } = await supabase
        .from("member_availability")
        .select("team_member_id")
        .eq("available_date", cultoDate);
      return (data ?? []).map((d: any) => d.team_member_id as string);
    },
    enabled: !!cultoDate && open,
  });

  // Populate state from existing lineup
  useEffect(() => {
    if (!existingLineup.length) return;
    const instruments = new Set<string>();
    const map: Record<string, string[]> = {};
    existingLineup.forEach((l: any) => {
      instruments.add(l.instrument);
      if (!map[l.instrument]) map[l.instrument] = [];
      map[l.instrument].push(l.team_member_id);
    });
    setSelectedInstruments(Array.from(instruments));
    setLineup(map);
  }, [existingLineup]);

  const toggleInstrument = (inst: string) => {
    if (selectedInstruments.includes(inst)) {
      setSelectedInstruments(selectedInstruments.filter((i) => i !== inst));
      const newLineup = { ...lineup };
      delete newLineup[inst];
      setLineup(newLineup);
    } else {
      setSelectedInstruments([...selectedInstruments, inst]);
    }
  };

  const toggleMember = (instrument: string, memberId: string) => {
    const current = lineup[instrument] || [];
    const updated = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    setLineup({ ...lineup, [instrument]: updated });
  };

  // Members who play a given instrument AND are available on the culto date
  const getMembersForInstrument = (instrument: string) => {
    return members.filter((m: any) => {
      const instruments: string[] = (m as any).instruments || [];
      if (!instruments.includes(instrument)) return false;
      // If we have a date and availability data, filter by availability
      if (cultoDate && availableMemberIds.length > 0) {
        return availableMemberIds.includes(m.id);
      }
      // If no availability data exists at all for this date, show all
      return true;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // Delete existing lineup for this culto
    await supabase.from("culto_lineup").delete().eq("culto_id", cultoId);

    // Insert new lineup
    const rows: { culto_id: string; team_member_id: string; instrument: string }[] = [];
    selectedInstruments.forEach((inst) => {
      (lineup[inst] || []).forEach((memberId) => {
        rows.push({ culto_id: cultoId, team_member_id: memberId, instrument: inst });
      });
    });

    if (rows.length > 0) {
      const { error } = await supabase.from("culto_lineup").insert(rows as any);
      if (error) {
        toast({ title: "Erro ao salvar escala", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
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
      <DialogContent className="glass sm:rounded-2xl border-0 max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Escala do Culto
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Select instruments for this culto */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Instrumentos neste culto</p>
            <div className="flex flex-wrap gap-1.5">
              {INSTRUMENTS.map((inst) => {
                const active = selectedInstruments.includes(inst);
                const Icon = INSTRUMENT_ICONS[inst];
                return (
                  <button
                    key={inst}
                    onClick={() => toggleInstrument(inst)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                    }`}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {inst}
                  </button>
                );
              })}
            </div>
          </div>

          {/* For each selected instrument, show available members */}
          {selectedInstruments.length > 0 && (
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Membros por instrumento</p>
              {selectedInstruments.map((inst) => {
                const available = getMembersForInstrument(inst);
                const selected = lineup[inst] || [];
                return (
                  <div key={inst} className="rounded-xl border border-border/50 p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {(() => { const Icon = INSTRUMENT_ICONS[inst]; return Icon ? <Icon className="h-4 w-4 text-primary" /> : null; })()}
                      {inst}
                    </p>
                    {available.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {cultoDate ? "Nenhum membro disponível nesta data para este instrumento." : "Nenhum membro configurado para este instrumento."}
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {available.map((m: any) => {
                          const profile = m.profiles as any;
                          const isSelected = selected.includes(m.id);
                          return (
                            <button
                              key={m.id}
                              onClick={() => toggleMember(inst, m.id)}
                              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                                isSelected
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
                              {isSelected && (
                                <span className="text-[10px] font-medium text-primary">✓</span>
                              )}
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button className="rounded-xl" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar escala
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
