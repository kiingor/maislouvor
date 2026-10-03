import type { MouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import type { LegalDocumentContent } from "@/content/legal/types";
import { LegalBlocks, type InternalLinkHandler } from "./LegalText";
import { scrollToLegalSection } from "./scrollToLegalSection";

interface LegalDocumentViewProps {
  content: LegalDocumentContent;
  /** "Última atualização" já formatada (ex.: 3 de outubro de 2026). */
  updatedAt: string;
  /** Versão exibida ao lado da data (documentos com aceite). */
  version?: string;
  /** Prefixo dos ids das seções (evita colisão quando há duas cópias na tela). */
  idPrefix?: string;
  /** Na folha do cadastro o título vai na barra da folha; aqui só o resumo. */
  hideTitle?: boolean;
  onInternalLink?: InternalLinkHandler;
}

/** Cabeçalho, sumário e seções de um documento (usado nas páginas e na folha do cadastro). */
export function LegalDocumentView({ content, updatedAt, version, idPrefix = "", hideTitle, onInternalLink }: LegalDocumentViewProps) {
  const sectionId = (id: string) => `${idPrefix}${id}`;
  const tocId = sectionId("sumario");

  const goTo = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (scrollToLegalSection(sectionId(id))) e.preventDefault();
  };

  return (
    <article className="space-y-8">
      <header>
        {!hideTitle && <h1 className="text-large-title">{content.title}</h1>}
        <p className="mt-1 text-footnote text-muted-foreground">
          Última atualização: <span className="whitespace-nowrap">{updatedAt}</span>
          {version ? <span className="whitespace-nowrap"> · versão {version}</span> : null}
        </p>
        <p className="mt-3 text-callout text-foreground/90">{content.summary}</p>
      </header>

      <nav aria-labelledby={tocId}>
        <h2 id={tocId} className="mx-4 mb-1.5 text-footnote font-normal text-muted-foreground">
          Nesta página
        </h2>
        <ol className="overflow-hidden rounded-card bg-card">
          {content.sections.map((section, i) => (
            <li key={section.id} className="group/toc">
              <a
                href={`#${sectionId(section.id)}`}
                onClick={(e) => goTo(e, section.id)}
                className="flex min-h-[44px] items-center gap-3 pl-4 transition-colors active:bg-fill-quaternary"
              >
                <span className="w-5 shrink-0 text-right text-footnote tabular-nums text-muted-foreground">{i + 1}</span>
                <span className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 border-t border-separator py-2 pr-4 group-first/toc:border-t-0">
                  <span className="min-w-0 flex-1 text-subhead">{section.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                </span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {content.sections.map((section, i) => (
        <section
          key={section.id}
          id={sectionId(section.id)}
          aria-labelledby={`${sectionId(section.id)}-titulo`}
          className="scroll-mt-[calc(env(safe-area-inset-top)+72px)]"
        >
          <h2 id={`${sectionId(section.id)}-titulo`} tabIndex={-1} className="mb-3 text-title3 outline-none">
            <span className="mr-1.5 tabular-nums text-muted-foreground">{i + 1}.</span>
            {section.title}
          </h2>
          <LegalBlocks blocks={section.blocks} onInternalLink={onInternalLink} />
        </section>
      ))}
    </article>
  );
}
