// Evolution API (v2.3.x, integração Baileys): leitura dos webhooks e envio.
//
// Na 2.3.7 o remetente de grupo vem em key.participant e key.participantAlt —
// um é o @lid e o outro o telefone@s.whatsapp.net, em ordem variável — e o
// telefone pode nem vir (privacidade/usernames). Os ids podem trazer o sufixo
// ":aparelho", que precisa sair antes de comparar.

type Json = Record<string, unknown>;

export interface WaKey {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
}

export interface InboundMessage {
  id: string;
  chatJid: string;
  isGroup: boolean;
  fromMe: boolean;
  /** Ids de quem escreveu (telefone@s.whatsapp.net e/ou @lid), normalizados. */
  senderIds: string[];
  /** Números de quem escreveu, só dígitos, quando o WhatsApp mostra. */
  senderPhones: string[];
  pushName: string | null;
  text: string;
  mentioned: string[];
  /** Autor da mensagem respondida (citada), normalizado. */
  quotedParticipant: string | null;
  /** Texto da mensagem respondida, quando houver. */
  quotedText: string | null;
  kind: "text" | "audio" | "other";
  /** Segundos desde 1970. */
  timestamp: number | null;
  /** Chave original, usada para citar a mensagem na resposta. */
  key: WaKey;
}

export interface EvolutionEvent {
  /** Nome normalizado: "messages.upsert", "group.participants.update"... */
  event: string;
  instance: string | null;
  /** Número dono da instância (o próprio assistente). */
  sender: string | null;
  data: unknown;
}

export interface GroupInfo {
  subject: string | null;
  /** Cada participante com todos os ids conhecidos (telefone e @lid). */
  participants: { ids: string[] }[];
}

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Tira caracteres invisíveis de formatação (isolamento bidirecional em volta de
 * menções, espaço de largura zero...), que quebrariam "@<id> ativar CÓDIGO".
 */
const stripInvisible = (s: string) => s.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, "");
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const uniq = <T>(values: (T | null | undefined)[]): T[] => [...new Set(values.filter((v): v is T => v != null))];

/**
 * "5511999999999:12@s.whatsapp.net" -> "5511999999999@s.whatsapp.net" (tira o
 * aparelho e o agente, como o jidNormalizedUser do Baileys); grupos ficam como estão.
 */
export function normalizeJid(value: unknown): string | null {
  const raw = str(value)?.trim().toLowerCase();
  if (!raw) return null;
  const at = raw.indexOf("@");
  if (at <= 0) return null;
  let user = raw.slice(0, at);
  let server = raw.slice(at + 1);
  if (server === "c.us") server = "s.whatsapp.net";
  if (server !== "g.us") user = user.split(":")[0].split("_")[0];
  return user ? `${user}@${server}` : null;
}

export function phoneFromJid(jid: string | null): string | null {
  if (!jid?.endsWith("@s.whatsapp.net")) return null;
  const digits = jid.slice(0, jid.indexOf("@")).replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/** Parte antes do @ ("123@lid" -> "123"): é o que aparece no texto de uma menção. */
export function jidUser(jid: string): string {
  return jid.slice(0, jid.indexOf("@"));
}

export function readEvent(payload: unknown): EvolutionEvent | null {
  if (!isObject(payload)) return null;
  const event = (str(payload.event) ?? "").toLowerCase().replace(/[_-]/g, ".");
  if (!event) return null;
  return {
    event,
    instance: str(payload.instance),
    sender: normalizeJid(payload.sender),
    data: payload.data,
  };
}

// Mensagens temporárias, de visualização única e editadas vêm embrulhadas.
function unwrapMessage(message: unknown): Json {
  let current: Json = isObject(message) ? message : {};
  for (let i = 0; i < 5; i++) {
    const wrapper = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension",
      "documentWithCaptionMessage", "editedMessage"]
      .map((k) => current[k])
      .find(isObject);
    const inner = wrapper && isObject(wrapper.message) ? wrapper.message : null;
    if (!inner) break;
    current = inner;
  }
  return current;
}

const CONTENT_TYPES = ["extendedTextMessage", "imageMessage", "videoMessage", "documentMessage", "audioMessage", "stickerMessage"];

function toSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  // Long do protobuf: { low, high }
  if (isObject(value) && typeof value.low === "number") return value.low >>> 0;
  return null;
}

export function parseMessage(item: unknown): InboundMessage | null {
  if (!isObject(item) || !isObject(item.key)) return null;
  const key = item.key;
  const chatJid = str(key.remoteJid);
  const id = str(key.id);
  if (!chatJid || !id) return null;

  const isGroup = chatJid.endsWith("@g.us");
  const message = unwrapMessage(item.message);
  const content = CONTENT_TYPES.map((k) => message[k]).filter(isObject);

  const text = stripInvisible(
    str(message.conversation)
      ?? content.map((c) => str(c.text) ?? str(c.caption)).find(Boolean)
      ?? "",
  );

  const contextInfo = content.map((c) => c.contextInfo).find(isObject)
    ?? (isObject(item.contextInfo) ? item.contextInfo : null);
  const mentioned = uniq((Array.isArray(contextInfo?.mentionedJid) ? contextInfo.mentionedJid : []).map(normalizeJid));
  const quotedParticipant = contextInfo && (contextInfo.quotedMessage || contextInfo.stanzaId)
    ? normalizeJid(contextInfo.participant)
    : null;
  const quoted = unwrapMessage(contextInfo?.quotedMessage);
  const quotedText = str(quoted.conversation)
    ?? CONTENT_TYPES.map((k) => quoted[k]).filter(isObject).map((c) => str(c.text) ?? str(c.caption)).find(Boolean)
    ?? null;

  const candidates = isGroup
    ? [key.participant, key.participantAlt, key.participantPn, key.participantLid, key.senderPn, key.senderLid, item.participant]
    : [key.remoteJid, key.remoteJidAlt, key.senderPn, key.senderLid];
  const senderIds = uniq(candidates.map(normalizeJid)).filter((jid) => !jid.endsWith("@g.us"));

  return {
    id,
    chatJid,
    isGroup,
    fromMe: key.fromMe === true,
    senderIds,
    senderPhones: uniq(senderIds.map(phoneFromJid)),
    pushName: str(item.pushName),
    text: text.trim(),
    mentioned,
    quotedParticipant,
    quotedText: quotedText ? stripInvisible(quotedText).trim() || null : null,
    kind: isObject(message.audioMessage) ? "audio" : text.trim() ? "text" : "other",
    timestamp: toSeconds(item.messageTimestamp),
    key: {
      id,
      remoteJid: chatJid,
      fromMe: key.fromMe === true,
      ...(str(key.participant) ? { participant: str(key.participant)! } : {}),
    },
  };
}

/** messages.upsert chega com a mensagem em data (ou, em algumas versões, numa lista). */
export function parseMessages(data: unknown): InboundMessage[] {
  const items = Array.isArray(data) ? data : isObject(data) && Array.isArray(data.messages) ? data.messages : [data];
  return items.map(parseMessage).filter((m): m is InboundMessage => m !== null);
}

/** group-participants.update: { id: grupo, action, participants: [jid | { id, phoneNumber... }] } */
export function parseParticipantsUpdate(data: unknown): { groupJid: string; action: string; ids: string[] } | null {
  if (!isObject(data)) return null;
  const groupJid = normalizeJid(data.id ?? data.groupJid);
  const action = (str(data.action) ?? "").toLowerCase();
  if (!groupJid?.endsWith("@g.us") || !action) return null;
  const participants = Array.isArray(data.participants) ? data.participants : [];
  const ids = uniq(participants.flatMap((p) => (isObject(p) ? jidsIn(p) : [normalizeJid(p)])));
  return { groupJid, action, ids };
}

/** Todos os ids (telefone e @lid) guardados nos campos de um participante. */
function jidsIn(obj: Json): string[] {
  return uniq(Object.values(obj).map((v) => {
    const jid = normalizeJid(v);
    return jid && (jid.endsWith("@s.whatsapp.net") || jid.endsWith("@lid")) ? jid : null;
  }));
}

export function parseGroupInfo(data: unknown): GroupInfo | null {
  const info = Array.isArray(data) ? data[0] : data;
  if (!isObject(info)) return null;
  const participants = Array.isArray(info.participants) ? info.participants : [];
  return {
    subject: str(info.subject),
    participants: participants
      .map((p) => ({ ids: isObject(p) ? jidsIn(p) : uniq([normalizeJid(p)]) }))
      .filter((p) => p.ids.length > 0),
  };
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------

export interface EvolutionConfig {
  baseUrl: string;
  instance: string;
  /** Token da instância (não a chave global da Evolution). */
  apiKey: string;
  /** Origem aceita pelo CORS_ORIGIN da Evolution (a da VPS exige, até entre servidores). */
  origin?: string;
  timeoutMs?: number;
}

export interface WhatsAppClient {
  sendText(to: string, text: string, quote?: InboundMessage): Promise<void>;
  sendPresence(to: string, delayMs: number): Promise<void>;
  groupInfo(groupJid: string): Promise<GroupInfo | null>;
}

export function createEvolutionClient(config: EvolutionConfig, fetchImpl: typeof fetch = fetch): WhatsAppClient {
  const base = config.baseUrl.replace(/\/+$/, "");
  const instance = encodeURIComponent(config.instance);

  async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
    const response = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        apikey: config.apiKey,
        Accept: "application/json",
        ...(config.origin ? { Origin: config.origin } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(config.timeoutMs ?? 15_000),
    });
    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Evolution ${method} ${path.split("?")[0]} -> HTTP ${response.status}: ${raw.slice(0, 300)}`);
    }
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  return {
    async sendText(to, text, quote) {
      await call("POST", `/message/sendText/${instance}`, {
        number: to,
        text,
        delay: 600,
        linkPreview: false,
        // Nunca enviar mentionsEveryOne: na 2.3.7 até "false" marca o grupo inteiro.
        ...(quote
          ? { quoted: { key: quote.key, message: { conversation: quote.text || " " } } }
          : {}),
      });
    },
    async sendPresence(to, delayMs) {
      await call("POST", `/chat/sendPresence/${instance}`, { number: to, presence: "composing", delay: delayMs });
    },
    async groupInfo(groupJid) {
      return parseGroupInfo(await call("GET", `/group/findGroupInfos/${instance}?groupJid=${encodeURIComponent(groupJid)}`));
    },
  };
}
