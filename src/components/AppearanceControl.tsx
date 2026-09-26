import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { APPEARANCE_OPTIONS, useAppearance, type Appearance } from "@/lib/appearance";

const ICONS: Record<Appearance, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };

/**
 * Controle segmentado de Aparência (Automático · Claro · Escuro), como em
 * Ajustes > Tela e Brilho. `compact` mostra só os símbolos (barra lateral).
 */
export function AppearanceSegmented({ compact = false, className }: { compact?: boolean; className?: string }) {
  const [value, setValue] = useAppearance();
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const group = e.currentTarget;
    const i = APPEARANCE_OPTIONS.findIndex((o) => o.value === value);
    const next = APPEARANCE_OPTIONS[(i + dir + APPEARANCE_OPTIONS.length) % APPEARANCE_OPTIONS.length];
    setValue(next.value);
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus());
  };
  return (
    <div
      role="radiogroup"
      aria-label="Aparência"
      onKeyDown={onKeyDown}
      className={cn("flex w-full items-center gap-0.5 rounded-full bg-fill-tertiary p-0.5", className)}
    >
      {APPEARANCE_OPTIONS.map((o) => {
        const Icon = ICONS[o.value];
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-value={o.value}
            tabIndex={active ? 0 : -1}
            aria-label={compact ? o.label : undefined}
            title={compact ? o.label : undefined}
            onClick={() => setValue(o.value)}
            className={cn(
              "relative flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full text-subhead transition-colors",
              "before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
              compact ? "h-8" : "h-9",
              active ? "bg-card font-semibold text-foreground shadow-sm dark:bg-prominent" : "font-medium text-muted-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2.2} aria-hidden="true" />
            {!compact && <span className="truncate">{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
