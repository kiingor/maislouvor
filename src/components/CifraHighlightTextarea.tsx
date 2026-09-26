import { TextareaHTMLAttributes } from "react";
import { isChordLine } from "@/lib/chordpro";
import { cn } from "@/lib/utils";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

type LineKind = "chord" | "section" | "text";

function lineKind(line: string): LineKind {
  const t = line.trim();
  if (!t) return "text";
  if (/^\[.*\]$/.test(t)) return "section"; // [Refrão], [Verso 1]...
  if (isChordLine(line)) return "chord";
  return "text";
}

/**
 * Cifra editor with live chord highlighting. A colored <pre> renders behind a
 * transparent <textarea> (the classic "highlighted textarea" overlay): both share
 * identical typography so caret/selection line up while the chord lines show in the
 * primary color. The <pre> is in normal flow, so the box auto-grows with content.
 *
 * Highlight is line-based (same `isChordLine` used by the transpose), so the colored
 * lines are exactly the ones that get transposed — no surprises.
 */
/**
 * Tipografia compartilhada pelo <pre> e pelo <textarea>: precisam ser IDÊNTICAS (fonte,
 * tamanho, entrelinha, espaçamento, padding e quebra), senão o cursor se desalinha.
 * Mono de 15pt: mais legível que 14 sem perder muitas colunas no iPhone (o viewport do
 * app já impede o zoom do Safari ao focar).
 */
const EDITOR_TYPE = "m-0 px-4 py-3.5 font-mono text-subhead leading-6 tracking-normal whitespace-pre-wrap break-words";

export function CifraHighlightTextarea({ value, className, readOnly, placeholder, ...rest }: Props) {
  const lines = value.split("\n");

  return (
    <div className={cn("relative overflow-hidden rounded-card bg-card text-foreground", className)}>
      <pre
        aria-hidden
        className={cn(EDITOR_TYPE, "min-h-[260px] pointer-events-none")}
        style={{ wordBreak: "break-word" }}
      >
        {lines.map((ln, i) => {
          const kind = lineKind(ln);
          const cls =
            kind === "chord"
              ? "text-primary font-semibold"
              : kind === "section"
              ? "text-muted-foreground font-semibold"
              : undefined;
          return (
            <span key={i} className={cls}>
              {ln + "\n"}
            </span>
          );
        })}
        {/* keeps trailing newline height stable */}
        {"​"}
      </pre>
      <textarea
        value={value}
        readOnly={readOnly}
        placeholder={placeholder}
        spellCheck={false}
        className={cn(
          EDITOR_TYPE,
          "absolute inset-0 h-full w-full border-0 bg-transparent text-transparent caret-primary resize-none overflow-hidden focus:outline-none focus:ring-0 focus-visible:outline-none placeholder:text-label-tertiary",
        )}
        style={{ wordBreak: "break-word" }}
        {...rest}
      />
    </div>
  );
}
