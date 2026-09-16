import { cn } from "@/lib/utils";
import {
  INSTRUMENT_GROUPS,
  LEGACY_VOCAL_ROLES,
  instrumentIcon,
  shortInstrumentLabel,
} from "@/data/instruments";

interface InstrumentPickerProps {
  /** Funções atualmente marcadas. */
  selected: string[];
  onToggle: (value: string) => void;
  /**
   * Mostra também as funções antigas ("Back N") que ainda estejam marcadas,
   * para que dê para desmarcá-las. Elas nunca aparecem se ninguém as usa.
   */
  showLegacyIfSelected?: boolean;
  className?: string;
}

/**
 * Seletor de funções da escala, agrupado em "Vozes" e "Instrumentos".
 *
 * O agrupamento é o que desambigua o naipe "Baixo (voz)" do contrabaixo
 * "Baixo" — dentro de Vozes o chip mostra só "Baixo".
 */
export function InstrumentPicker({
  selected,
  onToggle,
  showLegacyIfSelected = true,
  className,
}: InstrumentPickerProps) {
  const legacyInUse = showLegacyIfSelected
    ? LEGACY_VOCAL_ROLES.filter((v) => selected.includes(v))
    : [];

  const groups = [
    ...INSTRUMENT_GROUPS,
    ...(legacyInUse.length > 0
      ? [{ key: "legado", label: "Funções antigas", items: legacyInUse as readonly string[] }]
      : []),
  ];

  return (
    <div className={cn("space-y-2.5", className)}>
      {groups.map((group) => (
        <div key={group.key}>
          <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {group.items.map((value) => {
              const active = selected.includes(value);
              const Icon = instrumentIcon(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onToggle(value)}
                  className={cn(
                    "text-xs px-2.5 py-1.5 rounded-full border transition-colors flex items-center gap-1.5",
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-accent/50 text-muted-foreground border-border hover:border-primary/50",
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {group.key === "vozes" ? shortInstrumentLabel(value) : value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
