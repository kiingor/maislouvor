import type { Json } from "./types";

// Tabelas e RPCs de 20261003132000_chat_moderation.sql. Ficam fora de types.ts
// (gerado) para não mexer nos tipos publicados enquanto a feature é integrada.

type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };

export type ChatReportReason = "ofensivo" | "assedio" | "odio" | "sexual" | "spam" | "direitos_autorais" | "outro";
export type ChatReportStatus = "aberta" | "em_analise" | "resolvida" | "descartada";
export type ChatDeletedRole = "autor" | "lideranca" | "plataforma" | "sistema";

export type ChatModerationTables = {
  chat_reports: ReadOnlyTable<{
    id: string; team_id: string; message_id: string | null;
    reported_profile_id: string | null; reporter_profile_id: string | null;
    reason: ChatReportReason; details: string | null; status: ChatReportStatus;
    message_type: string; message_content: string | null; message_attachment_path: string | null;
    message_created_at: string | null; message_deleted_at: string | null; message_deleted_role: ChatDeletedRole | null;
    member_removed_at: string | null; created_at: string; updated_at: string;
    resolved_at: string | null; resolved_by: string | null; resolution_note: string | null;
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
};
