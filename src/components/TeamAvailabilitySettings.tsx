import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AVAILABILITY_MODE_OPTIONS,
  type AvailabilityMode,
} from "@/lib/availability";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  CalendarRange,
  CalendarX,
  Check,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";

interface TeamAvailabilitySettingsProps {
  teamId: string;
  value: AvailabilityMode;
  onSaved: () => Promise<void>;
}

const optionStyle: Record<AvailabilityMode, { icon: typeof CalendarCheck; active: string; iconBox: string }> = {
  available_only: {
    icon: CalendarCheck,
    active: "border-green-500/50 bg-green-500/[0.07]",
    iconBox: "bg-green-500/12 text-green-600 dark:text-green-400",
  },
  unavailable_only: {
    icon: CalendarX,
    active: "border-red-500/50 bg-red-500/[0.06]",
    iconBox: "bg-red-500/12 text-red-600 dark:text-red-400",
  },
  both: {
    icon: CalendarRange,
    active: "border-primary/50 bg-primary/[0.06]",
    iconBox: "bg-primary/10 text-primary",
  },
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
    <GlassCard className="overflow-hidden" data-testid="team-availability-mode-settings">
      <div className="border-b border-border/50 bg-accent/20 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Como a equipe informa a agenda</h2>
              <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                Escolha se os músicos devem marcar quando podem servir, quando não podem ou as duas situações.
              </p>
            </div>
          </div>
          <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <ShieldCheck className="h-3 w-3" /> Somente líderes
          </span>
        </div>
      </div>

      <div className="space-y-5 p-5 sm:p-6">
        <RadioGroup
          value={selected}
          onValueChange={(next) => setSelected(next as AvailabilityMode)}
          className="grid gap-3 lg:grid-cols-3"
          aria-label="Fluxo de disponibilidade da equipe"
        >
          {AVAILABILITY_MODE_OPTIONS.map((option) => {
            const styles = optionStyle[option.value];
            const Icon = styles.icon;
            const active = selected === option.value;
            const id = `availability-mode-${option.value}`;

            return (
              <label
                key={option.value}
                htmlFor={id}
                className={cn(
                  "group relative flex min-h-36 cursor-pointer flex-col rounded-2xl border border-border/70 bg-accent/20 p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:bg-accent/35",
                  active && styles.active,
                )}
              >
                <RadioGroupItem id={id} value={option.value} className="sr-only" />
                <div className="flex items-start justify-between gap-3">
                  <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", styles.iconBox)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background/70 text-transparent transition-colors",
                      active && "border-primary bg-primary text-primary-foreground",
                    )}
                    aria-hidden="true"
                  >
                    <Check className="h-3 w-3" />
                  </span>
                </div>
                <span className="mt-4 text-sm font-semibold">{option.label}</span>
                <span className="mt-1 text-xs leading-relaxed text-muted-foreground">{option.description}</span>
              </label>
            );
          })}
        </RadioGroup>

        <div className="flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            Marcações antigas ficam preservadas. Se um tipo for desativado, ele deixa de aparecer até ser habilitado novamente.
          </p>
          <Button
            className="shrink-0 rounded-xl gap-2"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar preferência
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
