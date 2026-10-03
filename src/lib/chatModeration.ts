import { supabase } from "@/integrations/supabase/client";
import { chatModerationSupabase } from "@/integrations/supabase/chat-moderation-client";
import { REPORT_REVIEW_TIME } from "@/lib/legal";
import type {
  ChatDeletedRole,
  ChatModerationFunctions,
  ChatReportReason,
  ChatReportStatus,
} from "@/integrations/supabase/chat-moderation-types";

export type { ChatDeletedRole, ChatReportReason, ChatReportStatus };

/* Moderação do chat: denunciar, bloquear e apagar (ver 20261003132000_chat_moderation.sql). */

export const REPORT_REASONS: { value: ChatReportReason; label: string; hint: string }[] = [
  { value: "ofensivo", label: "Ofensivo ou desrespeitoso", hint: "Xingamentos, deboche ou humilhação" },
  { value: "assedio", label: "Assédio ou intimidação", hint: "Ameaças, perseguição ou insistência indesejada" },
  { value: "odio", label: "Discurso de ódio ou discriminação", hint: "Contra raça, gênero, orientação, religião ou deficiência" },
  { value: "sexual", label: "Conteúdo sexual", hint: "Nudez, insinuações ou material impróprio" },
  { value: "spam", label: "Spam ou golpe", hint: "Propaganda, correntes ou links suspeitos" },
  { value: "direitos_autorais", label: "Direitos autorais", hint: "Material protegido compartilhado sem permissão" },
  { value: "outro", label: "Outro motivo", hint: "Conte nos detalhes o que aconteceu" },
];

export const reportReasonLabels = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label])) as Record<
  ChatReportReason,
  string
>;

export const reportStatusLabels: Record<ChatReportStatus, string> = {
  aberta: "Aberta",
  em_analise: "Em análise",
  resolvida: "Resolvida",
  descartada: "Descartada",
};

export const deletedRoleLabels: Record<ChatDeletedRole, string> = {
  autor: "Apagada por quem enviou",
  lideranca: "Apagada pela liderança",
  plataforma: "Apagada pela equipe do +Louvor",
  sistema: "Apagada junto com a conta ou a equipe",
};

/** Confirmação mostrada a quem denuncia (lida junto: título + descrição). */
export const REPORT_RECEIVED_TITLE = "Recebemos sua denúncia.";
// O prazo é o mesmo prometido nos Termos de Uso (src/lib/legal.ts) e o do "prazo
// vencido" de list_chat_reports (interval '24 hours' na migração).
export const REPORT_RECEIVED_DESCRIPTION = `A liderança e a equipe do +Louvor vão analisar em até ${REPORT_REVIEW_TIME}.`;
/** Lembrete do prazo para quem analisa (push e listas da liderança). */
export const REPORT_REVIEW_HINT = `Analise em até ${REPORT_REVIEW_TIME}.`;

export const REPORT_DETAILS_MAX = 500;
export const RESOLUTION_NOTE_MAX = 1000;
/** Tamanho máximo de uma mensagem de texto (o banco recusa acima disso). */
export const CHAT_MESSAGE_MAX = 4000;

/**
 * Rota da seção "Denúncias" da liderança (aba Membros dos ajustes). A equipe vai
 * junto: quem lidera mais de uma abre direto a equipe da denúncia.
 */
export const teamReportsLink = (teamId: string) => `/app/settings?aba=membros&equipe=${encodeURIComponent(teamId)}`;

export interface ChatReport {
  id: string;
  team_id: string;
  team_name: string;
  message_id: string | null;
  message_exists: boolean;
  message_type: string;
  message_content: string | null;
  message_attachment_path: string | null;
  message_created_at: string | null;
  message_deleted_at: string | null;
  message_deleted_role: ChatDeletedRole | null;
  member_removed_at: string | null;
  reason: ChatReportReason;
  details: string | null;
  status: ChatReportStatus;
  /** Sobre alguém da liderança: só a plataforma vê e decide. */
  platform_only?: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  resolved_by_name: string | null;
  reporter_profile_id: string | null;
  reporter_name: string | null;
  reported_profile_id: string | null;
  reported_name: string | null;
  reported_avatar_url: string | null;
  reported_is_member: boolean;
  reported_is_owner: boolean;
  /** Conta suspensa pela plataforma (só a plataforma recebe true). */
  reported_suspended?: boolean;
  overdue: boolean;
}

export interface ChatReportsPage {
  items: ChatReport[];
  total: number;
  page: number;
  page_size: number;
  pending_total: number;
  overdue_total: number;
}

export interface BlockedUser {
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface ReportResult {
  id: string;
  already_reported: boolean;
  /** Liderança da equipe que recebeu o aviso (para o push). */
  notify_profile_ids: string[];
  team_name?: string | null;
}

export type ModerationAction = Exclude<ChatReportStatus, "aberta">;

async function rpc<T, N extends keyof ChatModerationFunctions>(name: N, args?: ChatModerationFunctions[N]["Args"]): Promise<T> {
  const { data, error } = await chatModerationSupabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

/**
 * Apaga o arquivo do Storage. Falha não desfaz a exclusão da mensagem: o arquivo
 * fica órfão, mas a mensagem já saiu do chat para todos.
 */
async function removeAttachment(path: string | null | undefined) {
  if (!path) return;
  const { error } = await supabase.storage.from("chat").remove([path]);
  if (error) console.warn("[chat] não foi possível apagar o anexo", error);
}

export function reportChatMessage(messageId: string, reason: ChatReportReason, details?: string) {
  return rpc<ReportResult, "report_chat_message">("report_chat_message", {
    p_message_id: messageId,
    p_reason: reason,
    p_details: details?.trim() ? details.trim() : null,
  });
}

/** Apaga a mensagem para todos. O anexo fica guardado enquanto for prova de denúncia em aberto. */
export async function deleteChatMessage(messageId: string) {
  const result = await rpc<{ deleted: boolean; attachment_path: string | null; keep_attachment: boolean }, "delete_chat_message">(
    "delete_chat_message",
    { p_message_id: messageId },
  );
  if (!result.keep_attachment) await removeAttachment(result.attachment_path);
  return result;
}

export async function moderateChatReport(reportId: string, status: ModerationAction, note?: string, removeMember = false) {
  const result = await rpc<{ attachment_to_remove: string | null; member_removed: boolean; status: ChatReportStatus }, "moderate_chat_report">(
    "moderate_chat_report",
    { p_report_id: reportId, p_status: status, p_note: note?.trim() ? note.trim() : null, p_remove_member: removeMember },
  );
  await removeAttachment(result.attachment_to_remove);
  return result;
}

export function listChatReports(args: { teamId?: string | null; status?: string; search?: string; page?: number; pageSize?: number }) {
  return rpc<ChatReportsPage, "list_chat_reports">("list_chat_reports", {
    p_team_id: args.teamId ?? null,
    p_status: args.status ?? "pendentes",
    p_search: args.search ?? "",
    p_page: args.page ?? 1,
    p_page_size: args.pageSize ?? 20,
  });
}

export const blockUser = (profileId: string) => rpc<{ blocked: boolean }, "block_user">("block_user", { p_profile_id: profileId });
export const unblockUser = (profileId: string) =>
  rpc<{ unblocked: boolean }, "unblock_user">("unblock_user", { p_profile_id: profileId });
export const listBlockedUsers = () => rpc<BlockedUser[], "list_blocked_users">("list_blocked_users");

/** Mensagens das RPCs já vêm em português; o resto vira um texto genérico. */
export function chatModerationError(error: unknown): string {
  const issue = error as { code?: string; message?: string } | null;
  const code = issue?.code ?? "";
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code)) {
    return "Este recurso ainda não está disponível. Atualize o app e tente novamente.";
  }
  if (["42501", "22023", "P0001", "P0002"].includes(code) && issue?.message) return issue.message;
  return "Não foi possível concluir. Confira sua conexão e tente novamente.";
}

/** Primeira palavra do nome, para os textos curtos ("Bloquear Ana"). */
export function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] || "Usuário";
}

/** Resumo da mensagem para citações: texto ou o tipo do anexo. */
export function messagePreview(type: string | null | undefined, content: string | null | undefined) {
  if (content?.trim()) return content;
  if (type === "image") return "Imagem";
  if (type === "audio") return "Áudio";
  return "Mensagem sem texto";
}
