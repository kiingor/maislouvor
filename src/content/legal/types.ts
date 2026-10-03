/**
 * Formato dos documentos jurídicos (Termos, Privacidade, Suporte).
 *
 * Texto simples para revisão jurídica: cada bloco é um parágrafo (string),
 * uma lista (array de strings), um destaque ({ note }) ou perguntas
 * frequentes ({ faq }). Dentro do texto:
 *   **negrito**            -> ênfase (valor pendente aparece destacado)
 *   [rótulo](/rota)        -> link interno do app
 *   [rótulo](https://...)  -> link externo (abre fora do app)
 *   [rótulo](mailto:...)   -> e-mail
 * Use as funções mail() e link() abaixo para montar links com segurança.
 */
import { isLegalPlaceholder } from "@/lib/legal";

export interface LegalFaqItem {
  q: string;
  a: string;
}

/** Parágrafo, lista, destaque ou perguntas frequentes (abrem e fecham). */
export type LegalBlock = string | string[] | { note: string } | { faq: LegalFaqItem[] };

export interface LegalSection {
  /** Âncora estável (vira o id da seção e o link do sumário). */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocumentContent {
  title: string;
  /** Uma ou duas frases de resumo, mostradas antes do sumário. */
  summary: string;
  sections: LegalSection[];
}

/** E-mail clicável; se ainda for um valor pendente, só destaca o texto. */
export function mail(address: string): string {
  return isLegalPlaceholder(address) ? `**${address}**` : `[${address}](mailto:${address})`;
}

export function link(label: string, href: string): string {
  return `[${label}](${href})`;
}

/** Valor que pode estar pendente: sempre em negrito (pendente fica destacado). */
export function value(text: string): string {
  return `**${text}**`;
}
