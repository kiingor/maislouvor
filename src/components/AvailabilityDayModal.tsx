import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { INSTRUMENT_ICONS } from "@/data/instruments";
import { Check, CheckCircle2, XCircle, Loader2, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface MyAvailabilityEntry {
  status: "available" | "unavailable";
  instruments: string[];
  reason: string | null;
}

interface AvailabilityDayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: Date | null;
  teamMemberId: string | null;
  myInstruments: string[];
  existing: MyAvailabilityEntry | null;
  onSaved: () => void;
}

export function AvailabilityDayModal({
  open,
  onOpenChange,
  date,
  teamMemberId,
  myInstruments,
  existing,
  onSaved,
}: AvailabilityDayModalProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<"available" | "unavailable">("available");
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Sync local state whenever the dialog opens for a given date
  useEffect(() => {
    if (!open) return;
    setStatus(existing?.status ?? "available");
    setSelectedInstruments(
      existing?.instruments?.length
        ? existing.instruments
        : myInstruments.length === 1
        ? [...myInstruments]
        : []
    );
    setReason(existing?.reason ?? "");
  }, [open, existing, myInstruments]);

  if (!date) return null;

  const dateStr = format(date, "yyyy-MM-dd");
  const hasMultipleInstruments = myInstruments.length > 1;

  const toggleInstrument = (inst: string) => {
    setSelectedInstruments((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    );
  };

  const handleSave = async () => {
    if (!teamMemberId) return;
    setSaving(true);
    const payload = {
      team_member_id: teamMemberId,
      available_date: dateStr,
      status,
      instruments: status === "available" ? selectedInstruments : [],
      reason: status === "unavailable" ? reason.trim() || null : null,
    };
    const { error } = await supabase
      .from("member_availability")
      .upsert(payload as any, { onConflict: "team_member_id,available_date" });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: status === "available" ? "Disponibilidade confirmada!" : "Indisponibilidade registrada",
      description: format(date, "dd 'de' MMMM", { locale: ptBR }),
    });
    onSaved();
    onOpenChange(false);
  };

  const handleRemove = async () => {
    if (!teamMemberId) return;
    setRemoving(true);
    const { error } = await supabase
      .from("member_availability")
      .delete()
      .eq("team_member_id", teamMemberId)
      .eq("available_date", dateStr);
    setRemoving(false);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Marcação removida" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:rounded-2xl border-0 max-w-md">
        <DialogHeader>
          <DialogTitle className="capitalize">
            {format(date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Status toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setStatus("available")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                status === "available"
                  ? "bg-green-500/15 border-green-500/50 text-green-600 dark:text-green-400"
                  : "bg-accent/40 border-border text-muted-foreground hover:border-green-500/40"
              }`}
            >
              <CheckCircle2 className="h-4 w-4" /> Disponível
            </button>
            <button
              onClick={() => setStatus("unavailable")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors ${
                status === "unavailable"
                  ? "bg-red-500/15 border-red-500/50 text-red-600 dark:text-red-400"
                  : "bg-accent/40 border-border text-muted-foreground hover:border-red-500/40"
              }`}
            >
              <XCircle className="h-4 w-4" /> Indisponível
            </button>
          </div>

          {/* Available → instrument selection */}
          {status === "available" && (
            <div>
              {hasMultipleInstruments ? (
                <>
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    Em qual(is) instrumento(s)?
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {myInstruments.map((inst) => {
                      const active = selectedInstruments.includes(inst);
                      const Icon = INSTRUMENT_ICONS[inst];
                      return (
                        <button
                          key={inst}
                          onClick={() => toggleInstrument(inst)}
                          className={`text-xs px-2.5 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                            active
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50"
                          }`}
                        >
                          {active ? <Check className="h-3 w-3" /> : Icon && <Icon className="h-3 w-3" />}
                          {inst}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : myInstruments.length === 1 ? (
                <p className="text-xs text-muted-foreground">
                  Você ficará disponível em <span className="font-medium text-foreground">{myInstruments[0]}</span>.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nenhum instrumento cadastrado no seu perfil — você ficará disponível de forma geral.
                </p>
              )}
            </div>
          )}

          {/* Unavailable → reason */}
          {status === "unavailable" && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                Motivo (opcional)
              </p>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: viagem, compromisso de trabalho, saúde..."
                className="text-sm min-h-[72px] rounded-xl bg-accent/30 border-border/50"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-2 pt-1">
            {existing ? (
              <Button
                variant="ghost"
                className="rounded-xl gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleRemove}
                disabled={removing || saving}
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Remover
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-xl" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button className="rounded-xl gap-1.5" onClick={handleSave} disabled={saving || removing}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirmar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
