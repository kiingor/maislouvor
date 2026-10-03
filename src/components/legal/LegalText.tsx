import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import type { LegalBlock } from "@/content/legal/types";
import { isLegalPlaceholder } from "@/lib/legal";
import { cn } from "@/lib/utils";

/**
 * Intercepta links internos (ex.: a folha do cadastro troca de documento em vez
 * de sair da tela). Devolve true quando tratou o clique.
 */
export type InternalLinkHandler = (path: string) => boolean;

const LINK_CLASS =
  "font-semibold text-primary underline decoration-1 underline-offset-[3px] transition-opacity hover:opacity-70";

function LegalAnchor({ label, href, onInternalLink }: { label: string; href: string; onInternalLink?: InternalLinkHandler }) {
  if (href.startsWith("/")) {
    const handle = (e: MouseEvent<HTMLAnchorElement>) => {
      if (onInternalLink?.(href)) e.preventDefault();
    };
    return (
      <Link to={href} onClick={handle} className={LINK_CLASS}>
        {label}
      </Link>
    );
  }
  if (href.startsWith("mailto:")) {
    return (
      <a href={href} className={cn(LINK_CLASS, "break-all")}>
        {label}
      </a>
    );
  }
  // Externo: abre fora do app (no APK, o Capacitor entrega ao navegador do sistema).
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
      {label}
      <span className="sr-only"> (abre em outra janela)</span>
    </a>
  );
}

/** Texto com **negrito** e [links](/rota). Valores pendentes aparecem marcados. */
export function LegalInline({ text, onInternalLink }: { text: string; onInternalLink?: InternalLinkHandler }) {
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  const out: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = match.index;
    if (match[1] !== undefined) {
      out.push(
        isLegalPlaceholder(match[1]) ? (
          <mark key={key} className="rounded-[4px] bg-ios-yellow/30 px-0.5 font-semibold text-foreground">
            {match[1]}
          </mark>
        ) : (
          <strong key={key} className="font-semibold text-foreground">
            {match[1]}
          </strong>
        ),
      );
    } else {
      out.push(<LegalAnchor key={key} label={match[2]} href={match[3]} onInternalLink={onInternalLink} />);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Blocos de uma seção: parágrafos, listas, destaques e perguntas frequentes. */
export function LegalBlocks({ blocks, onInternalLink }: { blocks: LegalBlock[]; onInternalLink?: InternalLinkHandler }) {
  return (
    <div className="space-y-3 text-callout text-foreground/90">
      {blocks.map((block, i) => {
        if (typeof block === "string") {
          return (
            <p key={i}>
              <LegalInline text={block} onInternalLink={onInternalLink} />
            </p>
          );
        }
        if (Array.isArray(block)) {
          return (
            <ul key={i} className="list-disc space-y-2 pl-5 marker:text-muted-foreground">
              {block.map((item, j) => (
                <li key={j} className="pl-0.5">
                  <LegalInline text={item} onInternalLink={onInternalLink} />
                </li>
              ))}
            </ul>
          );
        }
        if ("note" in block) {
          return (
            <p key={i} role="note" className="rounded-[14px] bg-fill-quaternary p-3.5 ring-1 ring-inset ring-separator">
              <LegalInline text={block.note} onInternalLink={onInternalLink} />
            </p>
          );
        }
        return (
          <div key={i} className="divide-y divide-separator overflow-hidden rounded-card bg-card">
            {block.faq.map((item) => (
              <details key={item.q} className="group/faq">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center gap-3 px-4 py-3 text-body font-medium text-foreground [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">{item.q}</span>
                  <ChevronDown
                    className="h-[18px] w-[18px] shrink-0 text-label-tertiary transition-transform group-open/faq:rotate-180 motion-reduce:transition-none"
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </summary>
                <p className="px-4 pb-4 text-subhead text-muted-foreground">
                  <LegalInline text={item.a} onInternalLink={onInternalLink} />
                </p>
              </details>
            ))}
          </div>
        );
      })}
    </div>
  );
}
