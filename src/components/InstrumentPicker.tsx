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
 *
 * Chips no padrão iOS: cápsula em preenchimento terciário; selecionado em tinta proeminente.
 * A área de toque é ampliada para 44pt com um pseudo-elemento (o espaçamento de 8px evita sobreposição).
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
    <div className={cn("space-y-4", className)}>
      {groups.map((group) => (
        <div key={group.key}>
          <p className="text-footnote text-muted-foreground mb-2">{group.label}</p>
          <div className="flex flex-wrap gap-2">
            {group.items.map((value) => {
              const active = selected.includes(value);
              const Icon = instrumentIcon(value);
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle(value)}
                  className={cn(
                    "relative inline-flex h-9 items-center gap-1.5 rounded-full pl-2.5 pr-3 text-subhead font-medium transition-[background-color,transform] duration-200 active:scale-[0.97]",
                    "after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-fill-tertiary text-foreground hover:bg-fill-secondary",
                  )}
                >
                  <Icon
                    className={cn("h-[15px] w-[15px] shrink-0", !active && "text-muted-foreground")}
                    strokeWidth={2.25}
                    aria-hidden="true"
                  />
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
