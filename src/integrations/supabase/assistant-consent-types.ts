import type { Json } from "./types";

// Aviso de IA do Asafe (20261003133000_assistant_ai_consent.sql). Fora de
// types.ts para não mexer no schema gerado enquanto a migração não é publicada.

type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };

export type AssistantConsentScope = "team_activation" | "member_link";

export type AssistantConsentTables = {
  assistant_ai_consents: ReadOnlyTable<{
    id: string;
    team_id: string | null;
    profile_id: string | null;
    scope: AssistantConsentScope;
    text_version: string;
    accepted_at: string;
    revoked_at: string | null;
  }>;
};

type JsonFunction<Args> = { Args: Args; Returns: Json };

export type AssistantConsentFunctions = {
  give_assistant_consent: JsonFunction<{ p_scope: AssistantConsentScope; p_team_id?: string | null; p_version?: string | null }>;
  revoke_assistant_consent: JsonFunction<{ p_scope: AssistantConsentScope; p_team_id?: string | null }>;
  assistant_consent_prompts: JsonFunction<never>;
};
