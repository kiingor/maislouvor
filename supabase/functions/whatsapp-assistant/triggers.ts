// Quando o assistente deve responder e o que foi pedido.
//
// Ele só responde quando é chamado: menção de verdade (o WhatsApp manda o id
// do número em mentionedJid), resposta a uma mensagem dele, ou "@Nome" digitado
// sem escolher o contato na lista. Todo o resto do grupo é ignorado sem gravar nada.

import { type InboundMessage, jidUser } from "./evolution.ts";

export type AddressedVia = "mention" | "reply" | "name";

export type Command =
  | { type: "activate"; code: string }
  | { type: "link"; code: string }
  | { type: "deactivate" }
  | { type: "help" };

/** Minúsculas e sem acento. */
export function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function nameMention(assistantName: string): RegExp {
  return new RegExp(`(^|[^\\p{L}\\p{N}_])@${escapeRegex(fold(assistantName))}(?![\\p{L}\\p{N}_])`, "u");
}

export function addressedVia(msg: InboundMessage, botIds: ReadonlySet<string>, assistantName: string): AddressedVia | null {
  if (msg.mentioned.some((jid) => botIds.has(jid))) return "mention";
  if (msg.quotedParticipant && botIds.has(msg.quotedParticipant)) return "reply";
  if (nameMention(assistantName).test(fold(msg.text))) return "name";
  return null;
}

/**
 * Texto da pergunta sem as menções ao assistente. Menções a outras pessoas
 * chegam como "@5511..." (ou o número do @lid); viram "@pessoa" para não
 * mandar números de telefone ao modelo.
 */
export function cleanText(msg: InboundMessage, botIds: ReadonlySet<string>, assistantName: string): string {
  let text = msg.text;
  for (const jid of msg.mentioned) {
    const token = new RegExp(`@${escapeRegex(jidUser(jid))}(?!\\d)`, "g");
    text = text.replace(token, botIds.has(jid) ? " " : "@pessoa");
  }
  // Menção ao número do próprio assistente sem mentionedJid (texto colado).
  for (const jid of botIds) text = text.replace(new RegExp(`@${escapeRegex(jidUser(jid))}(?!\\d)`, "g"), " ");
  // "@Asafe" digitado (com ou sem acento, qualquer caixa).
  const name = fold(assistantName);
  text = text.replace(/@[\p{L}\p{N}_]+/gu, (token) => (fold(token.slice(1)) === name ? " " : token));
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .replace(/^[\s,:;-]+/, "")
    .trim();
}

/**
 * Código de vínculo escrito em qualquer mensagem ("vincular AB12CD"). Mesmo
 * alfabeto de gen_team_code (6 caracteres, sem 0/O/1/I), para não consultar o
 * banco a cada "vou vincular depois".
 */
export function findLinkCode(text: string): string | null {
  const m = fold(text).match(/(?:^|[^\p{L}\p{N}])vincular\s+([a-hj-np-z2-9]{6})(?![\p{L}\p{N}])/u);
  return m ? m[1].toUpperCase() : null;
}

const ACTION_INTENT =
  /(confirm|recus|aceit|desmarc|marc(a|ar|o|ou|e)\b|remov|cancel|\btir(a|e|ar)\b|indisponi|disponivel|nao (posso|vou|consigo|irei|estarei|da pra|vai dar)|posso (ir|sim|tocar|cantar)|vou (sim|estar|poder)|\bestarei\b|conta comigo)/;
const AFFIRMATIVE =
  /^(sim|s|pode|pode sim|isso|isso mesmo|quero|ok|okay|confirmo|claro|beleza|blz|bora|manda|faz|fechado|por favor|pfv|pode ser)(\b|$)/;

/**
 * A pessoa pediu uma ação (confirmar/recusar escala, marcar disponibilidade)?
 * Só então as ferramentas de ação vão para o modelo. Assim, um texto de outra
 * pessoa (mensagem citada, observação de culto) não dispara ação sozinho.
 * "sim" vale quando responde a uma pergunta do assistente.
 */
export function wantsAction(text: string, history: { role: string; content: string }[]): boolean {
  const t = fold(text).trim();
  if (ACTION_INTENT.test(t)) return true;
  const lastAnswer = [...history].reverse().find((h) => h.role === "assistant");
  return Boolean(lastAnswer?.content.includes("?") && AFFIRMATIVE.test(t));
}

export function parseCommand(text: string): Command | null {
  const t = fold(text).replace(/[.!?\s]+$/, "").trim();
  let m = t.match(/^ativar\s+([a-z0-9]{4,12})$/);
  if (m) return { type: "activate", code: m[1].toUpperCase() };
  m = t.match(/^vincular\s+([a-z0-9]{4,12})$/);
  if (m) return { type: "link", code: m[1].toUpperCase() };
  if (t === "desativar") return { type: "deactivate" };
  if (t === "" || /^(ajuda|help|menu|comandos|o que (voce|vc) (sabe )?faz(er)?)$/.test(t)) return { type: "help" };
  return null;
}
