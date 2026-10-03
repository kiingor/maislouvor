// Avisos determinísticos: o app é a fonte, sem IA, quota ou mensagem privada.
import { jidUser, type WhatsAppClient } from "./evolution.ts";
import type { Rpc } from "./tools.ts";

export type NoticeCategory = "cultos" | "escala" | "repertorio" | "avisos" | "lembretes";
interface Member {
  profile_id: string;
  name: string | null;
  roles: { instrument: string; status: "pending" | "accepted" | "declined" }[];
}
interface Culto {
  id: string;
  name: string;
  date: string;
  description: string | null;
  members: Member[];
  songs: { id: string; title: string; key: string | null }[];
}
export interface Notice {
  id: string;
  lock_token: string;
  team_id: string;
  group_jid: string;
  bot_ids: string[];
  assistant_name: string;
  kind: "culto" | "manual" | "reminder" | "mission";
  payload: {
    categories: NoticeCategory[];
    before?: Culto | null;
    after?: Culto | null;
    title?: string;
    body?: string | null;
    code?: string;
  };
}

const plain = (value: string | null | undefined, limit = 140) => (value ?? "")
  // deno-lint-ignore no-control-regex -- Remove controles e caracteres invisíveis de texto vindo do app.
  .replace(/[\u0000-\u001f\u007f\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, " ")
  .replace(/[*_~`@]/g, "").trim().slice(0, limit);
const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", {
  weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
});
const roleNames = (member: Member) => member.roles.map((r) => r.instrument).sort();
const activeMembers = (culto: Culto) => culto.members
  .map((m) => ({ ...m, roles: m.roles.filter((r) => r.status !== "declined") }))
  .filter((m) => m.roles.length > 0);

/** Divide listas longas sem perder pessoas; cada menção acompanha seu texto visível. */
export function renderNotice(notice: Notice, mentions: Record<string, string> = {}) {
  const { before, after, categories } = notice.payload;
  const enabled = new Set(categories);
  const used = new Set<NoticeCategory>();
  const profileIds = new Set<string>();
  const alreadyMentioned = new Set<string>();
  let mentioned = new Set<string>();
  let lines: string[] = [];
  const messages: { text: string; mentioned: string[] }[] = [];
  const link = `https://maislouvor.com/app${notice.kind === "manual" || notice.kind === "mission" ? "" : `/cultos${after ? `/${after.id}` : ""}`}`;
  const flush = () => {
    if (lines.length) messages.push({ text: [...lines, `\n${link}`].join("\n"), mentioned: [...mentioned] });
    lines = [];
    mentioned = new Set<string>();
  };
  const line = (text: string, member?: Member) => {
    const jid = member && mentions[member.profile_id];
    const validJid = jid && /^\d+@(s\.whatsapp\.net|lid)$/.test(jid) && !alreadyMentioned.has(jid) ? jid : null;
    const label = validJid ? `@${jidUser(validJid)}` : plain(member?.name) || "Membro";
    const output = (member ? text.replace("{person}", label) : text).slice(0, 3000);
    if (lines.join("\n").length + output.length > 3300) {
      flush();
      lines.push(`🎼 Continuação: *${plain(after?.name ?? before?.name ?? notice.payload.title ?? "Aviso do ministério")}*`);
    }
    lines.push(output);
    if (member) profileIds.add(member.profile_id);
    if (validJid) { mentioned.add(validJid); alreadyMentioned.add(validJid); }
  };
  const roster = (members: Member[], withPending = false) => {
    for (const member of members) {
      const pending = withPending && member.roles.some((r) => r.status === "pending");
      line(`• {person} — ${member.roles.map((r) => plain(r.instrument, 60)).join(", ")}${pending ? " (falta confirmar)" : ""}`, member);
    }
  };

  if (notice.kind === "mission" && enabled.has("avisos")) {
    used.add("avisos");
    line(`⏰ *${plain(notice.payload.title, 80)}*`);
    line(plain(notice.payload.body, 1600));
    line(`🎼 Aviso agendado pelo líder · Missão ${plain(notice.payload.code, 8)}`);
  } else if (notice.kind === "manual" && enabled.has("avisos")) {
    used.add("avisos");
    line(`📣 *Aviso do ministério: ${plain(notice.payload.title, 200)}*`);
    const body = plain(notice.payload.body, 2700);
    if (body) line(body);
  } else if (notice.kind === "reminder" && after && enabled.has("lembretes")) {
    const members = activeMembers(after);
    if (!members.length) return null;
    used.add("lembretes");
    line(`🎺 Eiii, amanhã tem *${plain(after.name)}*!`);
    line(`📅 ${dateLabel(after.date)}`);
    line("Quem vai servir:");
    roster(members, true);
    line("Quem ainda não confirmou, responde à escala no app. Bora afinar essa orquestra! 🎶");
  } else if (notice.kind === "culto") {
    if (!before && !after) return null; // criado e apagado antes do envio
    if (!after && before) {
      if (!enabled.has("cultos")) return null;
      used.add("cultos");
      line(`📅 *Culto cancelado: ${plain(before.name)}*`);
      line(`${dateLabel(before.date)} — o culto foi removido da agenda do app.`);
      roster(activeMembers(before));
    } else if (after) {
      line(`🎼 *${plain(after.name)}* · ${dateLabel(after.date)}`);
      if (!before && enabled.has("cultos")) {
        used.add("cultos");
        line("Eiii, tem culto novo na agenda do ministério! 🙌");
      } else if (before && enabled.has("cultos")) {
        if (before.date !== after.date) {
          used.add("cultos");
          line(`📅 A data mudou: ${dateLabel(before.date)} → ${dateLabel(after.date)}.`);
          roster(activeMembers(after));
        }
        if (before.name !== after.name) {
          used.add("cultos");
          line(`O culto “${plain(before.name)}” agora se chama “${plain(after.name)}”.`);
        }
        if (before.description !== after.description) {
          used.add("cultos");
          line("As observações do culto foram atualizadas. Confere os detalhes no app.");
        }
      }
      if (enabled.has("escala")) {
        const oldMembers = before?.members ?? [];
        const added = after.members.filter((m) => !oldMembers.some((old) => old.profile_id === m.profile_id));
        const changed = after.members.filter((m) => {
          const old = oldMembers.find((p) => p.profile_id === m.profile_id);
          return old && JSON.stringify(roleNames(old)) !== JSON.stringify(roleNames(m));
        });
        const removed = oldMembers.filter((m) => !after.members.some((p) => p.profile_id === m.profile_id));
        if (added.length + changed.length + removed.length > 0) used.add("escala");
        if (added.length) {
          line("\nEiii, tu foi escalado pra esse culto! 🎶");
          roster(added);
          line("Confirma tua participação no app ou me chama aqui com o nome do culto.");
        }
        if (changed.length) { line("\n🔄 A tua função na escala mudou:"); roster(changed); line("Confere tua escala atualizada no app."); }
        if (removed.length) { line("\nSaiu desta escala:"); roster(removed); }
      }
      if (enabled.has("repertorio") && JSON.stringify(before?.songs ?? []) !== JSON.stringify(after.songs)) {
        used.add("repertorio");
        line("\n🎵 Repertório atualizado:");
        if (!after.songs.length) line("As músicas foram retiradas deste culto.");
        for (const [index, song] of after.songs.entries()) {
          line(`${index + 1}. ${plain(song.title)}${song.key ? ` — ${plain(song.key, 20)}` : ""}`);
        }
      }
    }
  }
  if (!used.size) return null;
  // Links internos autenticados; não expõe tokens públicos de compartilhamento.
  flush();
  return { messages, profileIds: [...profileIds], categories: [...used] };
}

export function createNotificationDispatcher(deps: {
  rpc: Rpc;
  whatsapp: WhatsAppClient;
  now?: () => number;
  log?: (message: string, data: Record<string, unknown>) => void;
}) {
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message, data) => console.log(`[whatsapp-assistant] ${message}`, data));
  return async () => {
    await deps.rpc("assistant_notice_reminders", {});
    await deps.rpc("assistant_mission_tick", {});
    const started = now();
    const result = { sent: 0, skipped: 0, retry: 0, uncertain: 0 };
    for (let count = 0; count < 20 && now() - started < 40_000; count++) {
      const notice = await deps.rpc<Notice | { skipped: true } | null>("assistant_notice_claim", {});
      if (!notice) break;
      if ("skipped" in notice) { result.skipped++; continue; }
      let sending = false;
      const finish = (outcome: keyof typeof result) => deps.rpc<boolean>("assistant_notice_finish", {
        p_id: notice.id, p_token: notice.lock_token, p_result: outcome,
      });
      try {
        const draft = renderNotice(notice);
        if (!draft) { await finish("skipped"); result.skipped++; continue; }
        const group = await deps.whatsapp.groupInfo(notice.group_jid);
        if (!group) throw new Error("group_unavailable");
        if (!group.participants.some((p) => p.ids.some((id) => notice.bot_ids.includes(id)))) {
          await finish("skipped"); result.skipped++; continue;
        }
        const mentions = draft.profileIds.length ? await deps.rpc<Record<string, string>>("assistant_notice_mentions", {
          p_team_id: notice.team_id, p_profile_ids: draft.profileIds, p_participants: group.participants,
        }) : {};
        const message = renderNotice(notice, mentions)!;
        let stopped = false;
        for (const part of message.messages) {
          const canSend = await deps.rpc<boolean>("assistant_notice_begin", {
            p_id: notice.id, p_token: notice.lock_token, p_categories: message.categories,
          });
          if (!canSend) {
            if (sending) throw new Error("authorization_changed_during_delivery");
            await finish("skipped"); result.skipped++; stopped = true; break;
          }
          sending = true;
          await deps.whatsapp.sendText(notice.group_jid, part.text, undefined, part.mentioned);
        }
        if (stopped) continue;
        // Se o ack no banco falhar, a lease de sending vira uncertain: não envia de novo.
        if (!(await finish("sent"))) throw new Error("ack_failed");
        result.sent++;
      } catch {
        const outcome = sending ? "uncertain" : "retry";
        result[outcome]++;
        try { await finish(outcome); } catch { /* recuperação pela lease no próximo tick */ }
        // Sem payload, telefone, texto ou resposta HTTP da Evolution nos logs.
        log("aviso não concluído", { id: notice.id, outcome });
      }
    }
    return result;
  };
}
