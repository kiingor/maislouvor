import { useId, useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";
import { ChevronDown } from "lucide-react";

// A linha do loop inteira seleciona o trecho: o controle da observação não pode deixar o toque vazar.
const keep = (event: SyntheticEvent) => event.stopPropagation();

/**
 * Observação do loop: recolhida em uma linha com reticências; expandida mostra o texto inteiro
 * com as quebras de linha. O controle só aparece quando há algo escondido (texto cortado ou
 * várias linhas). Sem observação, não renderiza nada (sem espaço reservado).
 */
export function LoopNote({ notes, loopLabel }: { notes: string | null | undefined; loopLabel: string }) {
  const id = useId();
  const textRef = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const text = notes?.trim() ?? "";
  const multiline = text.includes("\n");

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  if (!text) return null;
  const canToggle = expanded || multiline || clipped;
  const toggle = () => setExpanded((open) => !open);

  return (
    // O controle fica na coluna do círculo de ordem (disclosure à esquerda): assim a área de 44pt
    // não disputa espaço com Editar/Remover e com o interruptor Público/Privado, e o texto
    // usa a largura toda da linha.
    <div
      className="relative mt-1 pl-[34px]"
      // Tocar no texto cortado também expande; nesse caso o toque não seleciona o loop.
      onClick={canToggle ? (event) => { keep(event); toggle(); } : undefined}
    >
      {canToggle && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          aria-label={expanded ? `Recolher observações de ${loopLabel}` : `Mostrar observações de ${loopLabel}`}
          onPointerDown={keep}
          onKeyDown={keep}
          onClick={(event) => { keep(event); toggle(); }}
          className="absolute -left-[3px] -top-[3px] grid h-7 w-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-fill-tertiary active:bg-fill-tertiary before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
            strokeWidth={2.4}
            aria-hidden="true"
          />
        </button>
      )}
      <p
        ref={textRef}
        id={id}
        // foreground/70: secundário, mas legível (o cinza secondaryLabel fica abaixo de 4.5:1 no claro).
        className={`py-px text-subhead text-foreground/70 ${expanded ? "whitespace-pre-wrap break-words" : "truncate"} ${
          canToggle ? "cursor-pointer" : ""
        }`}
      >
        <span className="sr-only">Observações: </span>
        {text}
      </p>
    </div>
  );
}
