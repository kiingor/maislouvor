import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { supabase } from "./client";
import type { LegalFunctions, LegalProfileRow, LegalTables, TermsAcceptanceRecord } from "./legal-types";

type LegalDatabase = {
  __InternalSupabase: { PostgrestVersion: "14.1" };
  public: {
    Tables: LegalTables;
    Views: Record<never, never>;
    Functions: LegalFunctions;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// Mesma conexão autenticada do app; o tipo separado só descreve as colunas novas.
export const legalSupabase = supabase as unknown as SupabaseClient<LegalDatabase>;

export const termsAcceptanceQueryKey = (userId: string | null) => ["legal-acceptance", userId] as const;

export type TermsAcceptanceStatus = Pick<LegalProfileRow, "terms_version" | "privacy_version" | "terms_accepted_at">;

/** Aceite gravado no perfil de quem está logado (null se o perfil ainda não existe). */
export async function fetchTermsAcceptance(userId: string): Promise<TermsAcceptanceStatus | null> {
  const { data, error } = await legalSupabase
    .from("profiles")
    .select("terms_version, privacy_version, terms_accepted_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Registra o aceite das versões vigentes. A data é a do servidor. */
export async function acceptCurrentTerms(): Promise<TermsAcceptanceRecord> {
  const { data, error } = await legalSupabase.rpc("accept_terms", {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
  });
  if (error) throw error;
  return data;
}
