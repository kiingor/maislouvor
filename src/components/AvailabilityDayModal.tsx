import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogToolbar } from "@/components/ui/dialog";
import { instrumentIcon } from "@/data/instruments";
import { Check, CalendarCheck, CalendarMinus, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AVAILABILITY_MODE,
  defaultAvailabilityStatus,
  isAvailabilityStatusAllowed,
  type AvailabilityMode,
} from "@/lib/availability";

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
  availabilityMode?: AvailabilityMode;
  existing: MyAvailabilityEntry | null;
  onSaved: () => void;
}

// Grupos da folha (protótipo .sheet .group). A folha redefine --card: branco no claro, #2C2C2E no escuro.
const group = "rounded-card bg-card overflow-hidden";
const groupLabel = "text-footnote text-muted-foreground px-4 mb-1.5";
const SHEET_TITLE: Record<AvailabilityMode, string> = {
  available_only: "Disponibilidade",
  unavailable_only: "Indisponibilidade",
  both: "Minha agenda",
};

export function AvailabilityDayModal({
  open,
  onOpenChange,
  date,
  teamMemberId,
  myInstruments,
  availabilityMode = DEFAULT_AVAILABILITY_MODE,
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
    setStatus(
      existing && isAvailabilityStatusAllowed(availabilityMode, existing.status)
        ? existing.status
        : defaultAvailabilityStatus(availabilityMode),
    );
    setSelectedInstruments(
      existing?.instruments?.length
        ? existing.instruments
        : myInstruments.length === 1
        ? [...myInstruments]
        : []
    );
    setReason(existing?.reason ?? "");
  }, [open, existing, myInstruments, availabilityMode]);

  if (!date) return null;

  const dateStr = format(date, "yyyy-MM-dd");
  const dateLabel = format(date, "EEEE, dd 'de' MMMM", { locale: ptBR });
  const hasMultipleInstruments = myInstruments.length > 1;

  const toggleInstrument = (inst: string) => {
    setSelectedInstruments((prev) =>
      prev.includes(inst) ? prev.filter((i) => i !== inst) : [...prev, inst]
    );
  };

  const handleSave = async () => {
    if (!teamMemberId) return;
    setSaving(true);
    const statusToSave = isAvailabilityStatusAllowed(availabilityMode, status)
      ? status
      : defaultAvailabilityStatus(availabilityMode);
    const payload = {
      team_member_id: teamMemberId,
      available_date: dateStr,
      status: statusToSave,
      instruments: statusToSave === "available" ? selectedInstruments : [],
      reason: statusToSave === "unavailable" ? reason.trim() || null : null,
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
      title: statusToSave === "available" ? "Disponibilidade confirmada!" : "Indisponibilidade registrada",
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

  // Linha de estado (protótipo .status-row): símbolo 22px colorido + rótulo + explicação.
  const statusIcon = (s: "available" | "unavailable") =>
    s === "available" ? (
      <CalendarCheck className="h-[22px] w-[22px] shrink-0 text-ios-green" strokeWidth={2} aria-hidden="true" />
    ) : (
      <CalendarMinus className="h-[22px] w-[22px] shrink-0 text-ios-red" strokeWidth={2} aria-hidden="true" />
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogToolbar
          title={SHEET_TITLE[availabilityMode]}
          confirm={{
            label: "Confirmar",
            onClick: handleSave,
            disabled: saving || removing,
            loading: saving,
          }}
        />
        <DialogDescription className="sr-only">
          Informe sua disponibilidade para esta data.
        </DialogDescription>

        <div className="pb-2">
          <p className="text-title2 text-foreground mx-1 mb-4">{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</p>

          {/* Status */}
          {availabilityMode === "both" ? (
            <div className={group} role="radiogroup" aria-label="Situação no dia">
              {(["available", "unavailable"] as const).map((s, i) => {
                const checked = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "relative flex w-full min-h-[52px] items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-fill-tertiary",
                      i > 0 && "before:absolute before:left-[50px] before:right-0 before:top-0 before:border-t before:border-separator before:content-['']",
                    )}
                  >
                    {statusIcon(s)}
                    <span className="flex-1 text-body text-foreground">{s === "available" ? "Disponível" : "Indisponível"}</span>
                    <Check
                      className={cn("h-5 w-5 shrink-0 text-primary", !checked && "invisible")}
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className={group}>
              <div className="flex min-h-[60px] items-center gap-3 px-4 py-3">
                {statusIcon(availabilityMode === "available_only" ? "available" : "unavailable")}
                <div className="min-w-0">
                  <p className="text-body text-foreground">
                    {availabilityMode === "available_only" ? "Disponível" : "Indisponível"}
                  </p>
                  <p className="text-footnote text-muted-foreground">
                    {availabilityMode === "available_only"
                      ? "Confirme este dia somente se você puder servir."
                      : "Registre este dia somente se você não puder servir."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Available → instrument selection */}
          {status === "available" &&
            (hasMultipleInstruments ? (
              <div className="mt-[22px]">
                <p className={groupLabel} id="availability-instruments-label">
                  Em qual(is) instrumento(s)?
                </p>
                <div className={group} role="group" aria-labelledby="availability-instruments-label">
                  {myInstruments.map((inst, i) => {
                    const active = selectedInstruments.includes(inst);
                    const Icon = instrumentIcon(inst);
                    return (
                      <button
                        key={inst}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleInstrument(inst)}
                        className={cn(
                          "relative flex w-full min-h-[48px] items-center gap-3 px-4 py-2 text-left transition-colors active:bg-fill-tertiary",
                          i > 0 && "before:absolute before:left-[58px] before:right-0 before:top-0 before:border-t before:border-separator before:content-['']",
                        )}
                      >
                        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground" aria-hidden="true">
                          {Icon && <Icon className="h-4 w-4" strokeWidth={2.25} />}
                        </span>
                        <span className="flex-1 text-body text-foreground">{inst}</span>
                        <Check
                          className={cn("h-5 w-5 shrink-0 text-primary", !active && "invisible")}
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : myInstruments.length === 1 ? (
              <p className="mt-2 px-4 text-footnote text-muted-foreground">
                Você ficará disponível em <span className="font-semibold text-foreground">{myInstruments[0]}</span>.
              </p>
            ) : (
              <p className="mt-2 px-4 text-footnote text-muted-foreground">
                Nenhum instrumento cadastrado no seu perfil — você ficará disponível de forma geral.
              </p>
            ))}

          {/* Unavailable → reason */}
          {status === "unavailable" && (
            <div className="mt-[22px]">
              <p className={groupLabel} id="availability-reason-label">
                Motivo (opcional)
              </p>
              <div className={group}>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  aria-labelledby="availability-reason-label"
                  placeholder="Ex: viagem, compromisso de trabalho, saúde..."
                  className="block min-h-[88px] w-full resize-none bg-transparent px-4 py-[13px] text-body text-foreground placeholder:text-label-tertiary outline-none focus-visible:outline-none"
                />
              </div>
            </div>
          )}

          {/* Destrutivo: linha vermelha separada no fim (HIG > Sheets) */}
          {existing && (
            <div className={cn(group, "mt-[22px]")}>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing || saving}
                className="flex w-full min-h-[50px] items-center justify-center gap-2 px-4 py-3 text-body text-ios-red transition-colors active:bg-fill-tertiary disabled:opacity-40"
              >
                {removing && <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />}
                {existing.status === "available" ? "Remover disponibilidade" : "Remover indisponibilidade"}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
