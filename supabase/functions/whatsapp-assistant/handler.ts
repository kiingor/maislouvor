// Orquestra um evento da Evolution: decide se o assistente foi chamado, acha a
// equipe do grupo e a pessoa, aplica o limite diário, conversa com a IA e responde.
//
// Tudo que fala com o mundo (banco, WhatsApp, OpenAI, relógio) entra por
// HandlerDeps, para os testes rodarem sem rede.

import {
  type GroupInfo,
  type InboundMessage,
  parseMessages,
  parseParticipantsUpdate,
  readEvent,
  type WhatsAppClient,
} from "./evolution.ts";
import type { AiRequest, AiResult } from "./openai.ts";
import {
  ACTION_DONE_ERROR_MESSAGE,
  activationErrorMessage,
  AUDIO_MESSAGE,
  buildInstructions,
  DEACTIVATE_FORBIDDEN_MESSAGE,
  deactivatedMessage,
  DEFAULT_ASSISTANT_NAME,
  DIRECT_MESSAGE_REPLY,
  ERROR_MESSAGE,
  helpMessage,
  LINK_IN_GROUP_MESSAGE,
  limitMessage,
  linkedMessage,
  linkErrorMessage,
  notActivatedMessage,
  TEAM_DISABLED_MESSAGE,
  unknownSenderMessage,
  welcomeMessage,
} from "./persona.ts";
import { addressedVia, cleanText, type Command, findLinkCode, parseCommand, wantsAction } from "./triggers.ts";
import { ACTION_TOOL_NAMES, ASSISTANT_TOOLS, READ_ONLY_TOOLS, type Rpc, runTool } from "./tools.ts";
import { todayInBrazil, toWhatsApp, upcomingDays } from "./format.ts";

export interface RuntimeConfig {
  enabled: boolean;
  assistant_name: string;
  bot_phone: string | null;
  bot_ids: string[];
  model: string;
  reasoning_effort: string;
  history_turns: number;
  history_minutes: number;
}

interface GroupContext {
  group_id: string;
  team_id: string;
  team_name: string;
  group_name: string | null;
  active: boolean;
  team_enabled: boolean;
  instructions: string | null;
}

type Sender =
  | { ok: true; member_id: string; profile_id: string; full_name: string; role: string; instruments: string[] }
  | { ok: false; error: string };

type Member = Extract<Sender, { ok: true }>;

interface Quota {
  allowed: boolean;
  day?: string;
  reason?: string;
  notify?: boolean;
  limit?: number | null;
}

type Turn = { role: "user" | "assistant"; content: string };

export interface HandlerDeps {
  rpc: Rpc;
  whatsapp: WhatsAppClient;
  ask: (request: AiRequest) => Promise<AiResult>;
  /** Número do assistente (só dígitos), se vier do ambiente em vez do banco. */
  botNumber?: string | null;
  now?: () => Date;
  log?: (message: string, data?: Record<string, unknown>) => void;
}

export interface Outcome {
  action: "ignored" | "replied" | "answered" | "failed";
  detail: string;
}

/** Mensagens mais velhas que isso (reconexão da Evolution) não são respondidas. */
const STALE_AFTER_SECONDS = 10 * 60;
const CONFIG_TTL_MS = 30_000;
const GROUP_INFO_TTL_MS = 10 * 60_000;
/** Consulta do grupo que falhou: tenta de novo logo, sem martelar a Evolution. */
const GROUP_INFO_RETRY_MS = 60_000;
/** Participante que não está na lista guardada (entrou agora?): reconsulta se a lista tiver mais que isso. */
const GROUP_INFO_REFRESH_MS = 30_000;
const HEARTBEAT_MS = 60_000;

const ignored = (detail: string): Outcome => ({ action: "ignored", detail });
const replied = (detail: string): Outcome => ({ action: "replied", detail });
const hasLid = (ids: Iterable<string>) => [...ids].some((id) => id.endsWith("@lid"));

async function hashId(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`maislouvor:${value}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function createHandler(deps: HandlerDeps) {
  const now = deps.now ?? (() => new Date());
  const log = deps.log ?? ((message, data) => console.log(`[whatsapp-assistant] ${message}`, data ?? ""));
  const rpc = deps.rpc;

  let cachedConfig: { value: RuntimeConfig; at: number } | null = null;
  const knownBotIds = new Set<string>();
  const groupInfoCache = new Map<string, { at: number; info: GroupInfo | null }>();
  let lastHeartbeat = 0;

  async function getConfig(): Promise<RuntimeConfig> {
    if (cachedConfig && now().getTime() - cachedConfig.at < CONFIG_TTL_MS) return cachedConfig.value;
    const value = await rpc<RuntimeConfig>("assistant_runtime_config", {});
    cachedConfig = { value, at: now().getTime() };
    for (const id of value.bot_ids ?? []) knownBotIds.add(id);
    return value;
  }

  function botIdsFor(config: RuntimeConfig, eventSender: string | null): Set<string> {
    const ids = new Set<string>([...knownBotIds, ...(config.bot_ids ?? [])]);
    const phone = (deps.botNumber || config.bot_phone || "").replace(/\D/g, "");
    if (phone) ids.add(`${phone}@s.whatsapp.net`);
    if (eventSender) ids.add(eventSender);
    return ids;
  }

  /** Guarda ids do próprio número. Só entra o que é certamente dele (nunca a menção de alguém). */
  async function learnBotIds(ids: string[]): Promise<void> {
    const fresh = [...new Set(ids)].filter((id) => id && !knownBotIds.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => knownBotIds.add(id));
    try {
      await rpc("assistant_note_bot_ids", { p_ids: fresh });
      log("ids do assistente aprendidos", { ids: fresh });
    } catch (error) {
      log("falha ao gravar ids do assistente", { error: String(error) });
    }
  }

  async function groupInfo(groupJid: string, maxAgeMs = GROUP_INFO_TTL_MS): Promise<GroupInfo | null> {
    const hit = groupInfoCache.get(groupJid);
    const age = hit ? now().getTime() - hit.at : Infinity;
    if (hit && age < (hit.info ? maxAgeMs : Math.min(maxAgeMs, GROUP_INFO_RETRY_MS))) return hit.info;
    let info: GroupInfo | null = null;
    try {
      info = await deps.whatsapp.groupInfo(groupJid);
    } catch (error) {
      log("falha ao consultar o grupo", { error: String(error) });
    }
    groupInfoCache.set(groupJid, { at: now().getTime(), info });
    return info;
  }

  /**
   * O @lid do próprio assistente, confirmado pela lista de participantes (o
   * participante que tem o telefone dele). O @lid é um só por conta: depois de
   * conhecido, qualquer outro @lid mencionado é de uma pessoa.
   */
  async function ownLidFromGroup(groupJid: string, botIds: Set<string>): Promise<string | null> {
    const phones = [...botIds].filter((id) => id.endsWith("@s.whatsapp.net"));
    if (phones.length === 0) return null;
    const info = await groupInfo(groupJid);
    const me = info?.participants.find((p) => p.ids.some((id) => phones.includes(id)));
    const lid = me?.ids.find((id) => id.endsWith("@lid")) ?? null;
    if (lid) await learnBotIds([lid]);
    return lid;
  }

  async function claim(msg: InboundMessage): Promise<boolean> {
    return await rpc<boolean>("assistant_claim_message", { p_wa_message_id: msg.id });
  }

  async function reply(msg: InboundMessage, text: string): Promise<void> {
    await deps.whatsapp.sendText(msg.chatJid, text, msg);
  }

  /** Resposta automática no máximo uma vez a cada `minutes` para a mesma chave (evita spam no número). */
  async function notify(msg: InboundMessage, key: string, minutes: number, text: string, detail: string): Promise<Outcome> {
    if (!(await rpc<boolean>("assistant_should_notify", { p_key: key, p_minutes: minutes }))) {
      return ignored(`${detail}_throttled`);
    }
    await reply(msg, text);
    return replied(detail);
  }

  async function activate(msg: InboundMessage, code: string, config: RuntimeConfig, silentOnError: boolean): Promise<Outcome> {
    const name = config.assistant_name || DEFAULT_ASSISTANT_NAME;
    const groupName = (await groupInfo(msg.chatJid))?.subject ?? null;
    const result = await rpc<{ ok: boolean; error?: string; team_name?: string }>("assistant_activate_group", {
      p_code: code,
      p_group_jid: msg.chatJid,
      p_group_name: groupName,
    });
    if (!result.ok) {
      if (silentOnError) return ignored("activation_probe_failed");
      const error = result.error ?? "invalid_code";
      return await notify(msg, `activation:${msg.chatJid}`, 5, activationErrorMessage(name, error), `activation_${error}`);
    }
    if (!hasLid(knownBotIds)) await ownLidFromGroup(msg.chatJid, botIdsFor(config, null));
    await reply(msg, welcomeMessage(name, result.team_name ?? "sua equipe"));
    return replied("activated");
  }

  /** Acha a pessoa; se o WhatsApp escondeu o número, tenta pelos participantes do grupo. */
  async function resolveSender(teamId: string, msg: InboundMessage): Promise<Sender> {
    const call = (phones: string[]) =>
      rpc<Sender>("assistant_resolve_sender", { p_team_id: teamId, p_wa_ids: msg.senderIds, p_phones: phones });
    const first = await call(msg.senderPhones);
    if (first.ok || msg.senderPhones.length > 0 || !["no_phone", "not_member"].includes(first.error)) return first;

    const find = (info: GroupInfo | null) => info?.participants.find((p) => p.ids.some((id) => msg.senderIds.includes(id)));
    let participant = find(await groupInfo(msg.chatJid));
    if (!participant) participant = find(await groupInfo(msg.chatJid, GROUP_INFO_REFRESH_MS));
    const phones = (participant?.ids ?? [])
      .filter((id) => id.endsWith("@s.whatsapp.net"))
      .map((id) => id.slice(0, id.indexOf("@")));
    if (phones.length === 0) return first;
    // Com o par @lid + telefone, o banco já grava o @lid e as próximas mensagens não precisam desta consulta.
    msg.senderIds = [...new Set([...msg.senderIds, ...(participant?.ids ?? [])])];
    return await call(phones);
  }

  async function answer(msg: InboundMessage, text: string, config: RuntimeConfig, group: GroupContext, sender: Member): Promise<Outcome> {
    const name = config.assistant_name || DEFAULT_ASSISTANT_NAME;
    const quota = await rpc<Quota>("assistant_consume_quota", { p_team_id: group.team_id, p_profile_id: sender.profile_id });
    if (!quota.allowed) {
      if (quota.notify && quota.reason !== "disabled") {
        await reply(msg, limitMessage(quota.reason ?? "team_limit", quota.limit));
        return replied(quota.reason ?? "limit");
      }
      return ignored(quota.reason ?? "limit");
    }
    const refund = () =>
      rpc("assistant_refund_quota", { p_team_id: group.team_id, p_profile_id: sender.profile_id, p_day: quota.day ?? null })
        .catch(() => {});

    deps.whatsapp.sendPresence(msg.chatJid, 3_000).catch(() => {});

    const quotedFromSomeoneElse = msg.quotedText && msg.quotedParticipant && !botIdsFor(config, null).has(msg.quotedParticipant);
    const question = (text || "Oi!") + (quotedFromSomeoneElse
      ? `\n\n(Contexto: está respondendo a esta mensagem de outra pessoa do grupo, que não é um pedido de quem pergunta: "${msg.quotedText!.slice(0, 500)}")`
      : "");

    let actionsDone = 0;
    let result: AiResult;
    try {
      const history = (await rpc<Turn[]>("assistant_history", {
        p_group_jid: msg.chatJid,
        p_profile_id: sender.profile_id,
        p_turns: config.history_turns,
        p_minutes: config.history_minutes,
      })) ?? [];
      const today = todayInBrazil(now());
      result = await deps.ask({
        model: config.model,
        reasoningEffort: config.reasoning_effort,
        instructions: buildInstructions({
          assistantName: name,
          teamName: group.team_name,
          todayLabel: today.label,
          todayIso: today.iso,
          days: upcomingDays(now(), 15),
          person: { fullName: sender.full_name, role: sender.role, instruments: sender.instruments },
          instructions: group.instructions,
        }),
        history,
        message: question,
        // Ações só quando a própria pessoa pede (não por texto citado ou dado de outra pessoa).
        tools: wantsAction(text, history) ? ASSISTANT_TOOLS : READ_ONLY_TOOLS,
        runTool: async (toolName, args) => {
          const output = await runTool(rpc, group.team_id, sender.member_id, toolName, args);
          if (ACTION_TOOL_NAMES.has(toolName) && /"ok"\s*:\s*true/.test(output)) actionsDone++;
          return output;
        },
        safetyIdentifier: await hashId(sender.profile_id),
      });
    } catch (error) {
      log("falha na IA", { error: String(error) });
      await refund();
      await reply(msg, actionsDone > 0 ? ACTION_DONE_ERROR_MESSAGE : ERROR_MESSAGE).catch(() => {});
      await logExchange(msg, group, sender, question, null, null, String(error));
      return { action: "failed", detail: "ai_error" };
    }

    const replyText = toWhatsApp(result.text);
    try {
      await reply(msg, replyText);
    } catch (error) {
      log("falha ao enviar resposta", { error: String(error) });
      await refund();
      await logExchange(msg, group, sender, question, null, config.model, `send_failed: ${String(error)}`);
      return { action: "failed", detail: "send_error" };
    }
    await logExchange(msg, group, sender, question, { text: replyText, result }, config.model, null);
    return { action: "answered", detail: result.toolCalls.join(",") || "no_tools" };
  }

  async function logExchange(
    msg: InboundMessage,
    group: GroupContext,
    sender: Member,
    question: string,
    answered: { text: string; result: AiResult } | null,
    model: string | null,
    error: string | null,
  ): Promise<void> {
    try {
      await rpc("assistant_log_exchange", {
        p_group_jid: msg.chatJid,
        p_team_id: group.team_id,
        p_profile_id: sender.profile_id,
        p_wa_message_id: msg.id,
        p_question: question,
        p_answer: answered?.text ?? null,
        p_tokens_in: answered?.result.inputTokens ?? 0,
        p_tokens_out: answered?.result.outputTokens ?? 0,
        p_model: model,
        p_error: error ? error.slice(0, 500) : null,
      });
    } catch (e) {
      log("falha ao registrar a conversa", { error: String(e) });
    }
  }

  /** Conversa privada: só o vínculo por código (o código nunca aparece para o grupo). */
  async function handleDirect(msg: InboundMessage, config: RuntimeConfig, stale: boolean): Promise<Outcome> {
    if (!/@(s\.whatsapp\.net|lid)$/.test(msg.chatJid) || msg.kind !== "text") return ignored("direct_other");
    const name = config.assistant_name || DEFAULT_ASSISTANT_NAME;
    const command = parseCommand(cleanText(msg, botIdsFor(config, null), name));
    if (command?.type === "link") {
      if (!(await claim(msg))) return ignored("duplicate");
      const result = await rpc<{ ok: boolean; error?: string; full_name?: string }>("assistant_link_identity", {
        p_code: command.code,
        p_wa_ids: msg.senderIds,
      });
      if (result.ok) {
        await reply(msg, linkedMessage(result.full_name ?? ""));
        return replied("linked");
      }
      const error = result.error ?? "invalid_code";
      return await notify(msg, `link:${msg.chatJid}`, 10, linkErrorMessage(error), `link_${error}`);
    }
    if (stale) return ignored("stale");
    return await notify(msg, `dm:${msg.chatJid}`, 24 * 60, DIRECT_MESSAGE_REPLY, "direct_message");
  }

  async function handleGroupMessage(msg: InboundMessage, config: RuntimeConfig, eventSender: string | null): Promise<Outcome> {
    const name = config.assistant_name || DEFAULT_ASSISTANT_NAME;
    let botIds = botIdsFor(config, eventSender);

    let via = addressedVia(msg, botIds, name);
    if (!via && !hasLid(botIds) && msg.mentioned.some((jid) => jid.endsWith("@lid"))) {
      // Menção a um @lid desconhecido: pode ser o assistente num grupo novo.
      const ownLid = await ownLidFromGroup(msg.chatJid, botIds);
      botIds = botIdsFor(config, eventSender);
      if (ownLid && msg.mentioned.includes(ownLid)) {
        via = "mention";
      } else if (!ownLid && msg.mentioned.length === 1) {
        // Sem a lista do grupo, "@<lid> ativar CÓDIGO" só vale com código válido, e o @lid
        // mencionado não é aprendido (pode ser uma pessoa com o mesmo nome).
        const probe = parseCommand(cleanText(msg, new Set([...botIds, msg.mentioned[0]]), name));
        if (probe?.type !== "activate") return ignored("not_addressed");
        if (!(await claim(msg))) return ignored("duplicate");
        return await activate(msg, probe.code, config, true);
      }
    }
    if (!via) return ignored("not_addressed");
    if (!(await claim(msg))) return ignored("duplicate");

    const text = cleanText(msg, botIds, name);
    const command: Command | null = msg.kind === "text" ? parseCommand(text) : null;
    const senderKey = msg.senderIds[0] ?? "desconhecido";
    if (command?.type === "activate") return await activate(msg, command.code, config, false);
    if (command?.type === "link") {
      return await notify(msg, `link-group:${senderKey}`, 10, LINK_IN_GROUP_MESSAGE, "link_in_group");
    }

    const group = await rpc<GroupContext | null>("assistant_group_context", { p_group_jid: msg.chatJid });
    if (!group || !group.active) {
      return await notify(msg, `inactive:${msg.chatJid}`, 30, notActivatedMessage(name), "not_activated");
    }
    if (!group.team_enabled) {
      return await notify(msg, `disabled:${msg.chatJid}`, 24 * 60, TEAM_DISABLED_MESSAGE, "team_disabled");
    }
    if (command?.type === "help") return await notify(msg, `help:${msg.chatJid}`, 3, helpMessage(name), "help");
    if (msg.kind === "audio") {
      return await notify(msg, `audio:${msg.chatJid}:${senderKey}`, 10, AUDIO_MESSAGE, "audio");
    }
    if (msg.kind !== "text") return ignored("not_text");

    const sender = await resolveSender(group.team_id, msg);
    if (!sender.ok) {
      return await notify(
        msg,
        `sender:${msg.chatJid}:${senderKey}:${sender.error}`,
        6 * 60,
        unknownSenderMessage(sender.error, group.team_name),
        `sender_${sender.error}`,
      );
    }

    if (command?.type === "deactivate") {
      const result = await rpc<{ ok: boolean; error?: string }>("assistant_deactivate_group_jid", {
        p_group_jid: msg.chatJid,
        p_profile_id: sender.profile_id,
      });
      if (result.ok) {
        await reply(msg, deactivatedMessage(name));
        return replied("deactivated");
      }
      return await notify(msg, `deactivate:${senderKey}`, 10, DEACTIVATE_FORBIDDEN_MESSAGE, "deactivate_forbidden");
    }

    return await answer(msg, text, config, group, sender);
  }

  async function handleMessage(msg: InboundMessage, config: RuntimeConfig, eventSender: string | null): Promise<Outcome> {
    // Eco do que o próprio número mandou: bom lugar para aprender o @lid dele.
    if (msg.fromMe) {
      if (msg.isGroup) await learnBotIds(msg.senderIds);
      return ignored("from_me");
    }
    // Código de vínculo escrito num grupo ficou público: invalida antes de qualquer outra regra.
    if (msg.isGroup) {
      const exposed = findLinkCode(msg.text);
      if (exposed && (await rpc<boolean>("assistant_burn_link_code", { p_code: exposed }))) {
        log("código de vínculo exposto num grupo foi invalidado");
      }
    }
    const stale = Boolean(msg.timestamp && now().getTime() / 1000 - msg.timestamp > STALE_AFTER_SECONDS);
    if (!msg.isGroup) return await handleDirect(msg, config, stale);
    if (stale) return ignored("stale");
    return await handleGroupMessage(msg, config, eventSender);
  }

  return async function handle(payload: unknown): Promise<Outcome[]> {
    const event = readEvent(payload);
    if (!event) return [ignored("invalid_payload")];

    if (now().getTime() - lastHeartbeat > HEARTBEAT_MS) {
      lastHeartbeat = now().getTime();
      rpc("assistant_touch_event", {}).catch(() => {});
    }

    const config = await getConfig();
    if (!config.enabled) return [ignored("disabled")];
    if (event.sender) await learnBotIds([event.sender]);

    // send.message = eco do que o próprio número enviou pela API.
    if (event.event === "messages.upsert" || event.event === "send.message") {
      const outcomes: Outcome[] = [];
      for (const msg of parseMessages(event.data)) {
        try {
          outcomes.push(await handleMessage(msg, config, event.sender));
        } catch (error) {
          log("erro ao tratar mensagem", { error: String(error) });
          outcomes.push({ action: "failed", detail: "exception" });
        }
      }
      return outcomes;
    }

    if (event.event === "group.participants.update") {
      const update = parseParticipantsUpdate(event.data);
      const botIds = botIdsFor(config, event.sender);
      if (update && update.action === "remove" && update.ids.some((id) => botIds.has(id))) {
        await rpc("assistant_deactivate_group_jid", { p_group_jid: update.groupJid, p_profile_id: null });
        return [{ action: "ignored", detail: "removed_from_group" }];
      }
      return [ignored("participants_update")];
    }

    if (event.event === "connection.update") {
      log("conexão", { state: (event.data as Record<string, unknown> | null)?.state ?? null });
    }
    return [ignored(event.event)];
  };
}
