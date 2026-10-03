import type { Json } from "./types";

// Tabelas e RPCs de 20261003132000_chat_moderation.sql. Ficam fora de types.ts
// (gerado) para não mexer nos tipos publicados enquanto a feature é integrada.

type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };

export type ChatReportReason = "ofensivo" | "assedio" | "odio" | "sexual" | "spam" | "direitos_autorais" | "outro";
export type ChatReportStatus = "aberta" | "em_analise" | "resolvida" | "descartada";
export type ChatDeletedRole = "autor" | "lideranca" | "plataforma" | "sistema";

export type ChatModerationTables = {
  // Só as colunas que o cliente pode ler direto (GRANT por coluna). A decisão
  // interna e a cópia da mensagem vêm de list_chat_reports.
  chat_reports: ReadOnlyTable<{
    id: string; team_id: string; message_id: string | null;
    reason: ChatReportReason; details: string | null; status: ChatReportStatus;
    created_at: string; resolved_at: string | null;
  }>;
  user_blocks: ReadOnlyTable<{ blocker_profile_id: string; blocked_profile_id: string; created_at: string }>;
};

type JsonFunction<Args> = { Args: Args; Returns: Json };
export type ChatModerationFunctions = {
  report_chat_message: JsonFunction<{ p_message_id: string; p_reason: ChatReportReason; p_details?: string | null }>;
  list_chat_reports: JsonFunction<{
    p_team_id?: string | null; p_status?: string; p_search?: string; p_page?: number; p_page_size?: number;
  }>;
  moderate_chat_report: JsonFunction<{
    p_report_id: string; p_status: Exclude<ChatReportStatus, "aberta">; p_note?: string | null; p_remove_member?: boolean;
  }>;
  delete_chat_message: JsonFunction<{ p_message_id: string }>;
  block_user: JsonFunction<{ p_profile_id: string }>;
  unblock_user: JsonFunction<{ p_profile_id: string }>;
  list_blocked_users: JsonFunction<never>;
  // Plataforma: situação das contas dos membros. A propriedade da equipe passa pela
  // edge function platform-suspend-account (platform_transfer_team_ownership é só da service_role).
  platform_team_member_suspensions: JsonFunction<{ p_team_id: string }>;
};
