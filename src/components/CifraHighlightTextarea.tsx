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
export function CifraHighlightTextarea({ value, className, readOnly, placeholder, ...rest }: Props) {
  const lines = value.split("\n");

  return (
    <div className={cn("relative rounded-xl glass-input overflow-hidden", className)}>
      <pre
        aria-hidden
        className="m-0 p-4 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words min-h-[260px] pointer-events-none"
        style={{ wordBreak: "break-word" }}
      >
        {lines.map((ln, i) => {
          const kind = lineKind(ln);
          const cls =
            kind === "chord"
              ? "text-primary font-semibold"
              : kind === "section"
              ? "text-primary/60 font-semibold"
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
        className="absolute inset-0 h-full w-full m-0 p-4 border-0 font-mono text-sm leading-relaxed bg-transparent text-transparent caret-foreground resize-none overflow-hidden whitespace-pre-wrap break-words focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60"
        style={{ wordBreak: "break-word" }}
        {...rest}
      />
    </div>
  );
}
