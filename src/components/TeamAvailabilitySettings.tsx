import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AVAILABILITY_MODE_OPTIONS,
  type AvailabilityMode,
} from "@/lib/availability";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  CalendarMinus,
  CalendarRange,
  Loader2,
  ShieldCheck,
} from "lucide-react";

interface TeamAvailabilitySettingsProps {
  teamId: string;
  value: AvailabilityMode;
  onSaved: () => Promise<void>;
}

// Ícone em quadrado 30pt colorido (padrão Ajustes do iOS): verde = pode servir, vermelho = impedimento.
const optionStyle: Record<AvailabilityMode, { icon: typeof CalendarCheck; tile: string }> = {
  available_only: { icon: CalendarCheck, tile: "bg-ios-green text-white" },
  unavailable_only: { icon: CalendarMinus, tile: "bg-ios-red text-white" },
  both: { icon: CalendarRange, tile: "bg-prominent text-prominent-foreground" },
};

export function TeamAvailabilitySettings({ teamId, value, onSaved }: TeamAvailabilitySettingsProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<AvailabilityMode>(value);
  const [savedValue, setSavedValue] = useState<AvailabilityMode>(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(value);
    setSavedValue(value);
  }, [teamId, value]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("teams")
      .update({ availability_mode: selected })
      .eq("id", teamId);

    if (error) {
      setSaving(false);
      toast({
        title: "Não foi possível salvar",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    setSavedValue(selected);
    await onSaved();
    setSaving(false);
    toast({
      title: "Fluxo de disponibilidade atualizado",
      description: "A nova regra já vale para toda a equipe.",
    });
  };

  const isDirty = selected !== savedValue;

  return (
    <section data-testid="team-availability-mode-settings" aria-labelledby="team-availability-mode-title">
      {/* Cabeçalho de seção: Title 3 + explicação secundária */}
      <div className="mx-1 mb-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id="team-availability-mode-title" className="text-title3 text-foreground">
            Como a equipe informa a agenda
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 font-semibold text-muted-foreground">
            <ShieldCheck className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" /> Somente líderes
          </span>
        </div>
        <p className="mt-1 max-w-xl text-subhead text-muted-foreground">
          Escolha se os músicos devem marcar quando podem servir, quando não podem ou as duas situações.
        </p>
      </div>

      {/* Lista de seleção única com a marca à direita (Ajustes do iOS) */}
      <RadioGroup
        value={selected}
        onValueChange={(next) => setSelected(next as AvailabilityMode)}
        className="gap-0 overflow-hidden rounded-card bg-card"
        aria-label="Fluxo de disponibilidade da equipe"
      >
        {AVAILABILITY_MODE_OPTIONS.map((option, i) => {
          const styles = optionStyle[option.value];
          const Icon = styles.icon;
          const id = `availability-mode-${option.value}`;

          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "relative flex min-h-[60px] cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary",
                i > 0 && "before:absolute before:left-[58px] before:right-0 before:top-0 before:border-t before:border-separator before:content-['']",
              )}
            >
              <span className={cn("grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px]", styles.tile)} aria-hidden="true">
                <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body text-foreground">{option.label}</span>
                <span className="block text-footnote text-muted-foreground">{option.description}</span>
              </span>
              {/* Radio iOS compartilhado: ✓ tintado na opção escolhida, círculo vazio nas outras. */}
              <RadioGroupItem id={id} value={option.value} />
            </label>
          );
        })}
      </RadioGroup>

      {/* Rodapé da seção + ação */}
      {/* Nota recuada como o rodapé de seção do iOS; o botão alinha com as bordas dos cards. */}
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl px-4 text-footnote text-muted-foreground">
          Marcações antigas ficam preservadas. Se um tipo for desativado, ele deixa de aparecer até ser habilitado novamente.
        </p>
        <Button
          className="h-11 w-full shrink-0 rounded-full px-5 text-body font-semibold sm:w-auto"
          onClick={handleSave}
          disabled={!isDirty || saving}
        >
          {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
          Salvar preferência
        </Button>
      </div>
    </section>
  );
}
