import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { formatIsoDateBR } from "@/lib/isoDate";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

/**
 * Campo de data em pílula (padrão das folhas do app) que sempre mostra dd/mm/aaaa.
 * O <input type="date"> nativo formata pelo idioma do aparelho: num Android em inglês, 1º de
 * novembro aparecia como "11/01/2026" (PrimeTestLab 10957, M-02). Aqui o input nativo fica
 * invisível por cima da pílula: o toque continua abrindo o seletor do sistema, e o texto exibido
 * é nosso. O input segue com id, valor e required, então o <label htmlFor> e os leitores de tela
 * continuam funcionando.
 */
export function DateField({ value, onChange, placeholder = "Escolher", className, onClick, ...input }: Props) {
  return (
    <span
      className={cn(
        "relative inline-flex h-9 items-center rounded-[8px] bg-fill-tertiary px-2.5 text-body tabular-nums text-foreground",
        "has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ios-blue/40",
        className,
      )}
    >
      <span aria-hidden="true" className={cn(!value && "text-muted-foreground")}>
        {value ? formatIsoDateBR(value) : placeholder}
      </span>
      <input
        {...input}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => {
          onClick?.(e);
          // No computador o clique no campo não abre o calendário (só o ícone, que está invisível).
          // No toque o sistema já abre o seletor sozinho; não pedir de novo.
          if (window.matchMedia?.("(pointer: fine)").matches) {
            try { e.currentTarget.showPicker?.(); } catch { /* navegador sem showPicker */ }
          }
        }}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      />
    </span>
  );
}
