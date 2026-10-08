import { supabase } from "@/integrations/supabase/client";
export const TEAM_DATA_CONSENT_VERSION = "2026-10-08";
export type TeamDataConsent = { allowed: boolean; version: string; accepted_at: string | null };
export const teamDataConsentKey = (userId: string | null) => ["team-data-consent", userId];
export async function readTeamDataConsent(): Promise<TeamDataConsent> {
  const { data, error } = await (supabase.rpc as any)("my_team_data_consent");
  if (error || !data || typeof data.allowed !== "boolean" || data.version !== TEAM_DATA_CONSENT_VERSION)
    throw new Error("Não foi possível conferir sua escolha. Tente novamente.");
  return data;
}
export async function saveTeamDataConsent(allow: boolean): Promise<TeamDataConsent> {
  const { data, error } = await (supabase.rpc as any)("set_my_team_data_consent", { p_allow: allow, p_version: TEAM_DATA_CONSENT_VERSION });
  if (error || !data || data.allowed !== allow) throw new Error("Não foi possível salvar sua escolha. Tente novamente.");
  return data;
}
export function clearTeamCache(userId: string) {
  try { localStorage.removeItem(`louvor_team_cache:${userId}`); localStorage.removeItem("louvor_current_team"); } catch { /* storage indisponível */ }
}
