import { supabase } from "@/integrations/supabase/client";
import { chatModerationSupabase } from "@/integrations/supabase/chat-moderation-client";
import type { OwnedTeam, SuspensionAction } from "../../supabase/functions/platform-suspend-account/flow";
import { SUSPENSION_REASON_MAX } from "../../supabase/functions/platform-suspend-account/flow";

// Suspensão de contas pela plataforma (painel /admin): edge function
// platform-suspend-account (banimento no GoTrue + registro no banco) e as RPCs de
// 20261003132000_chat_moderation.sql para a propriedade das equipes.

export type { OwnedTeam, SuspensionAction };
export { SUSPENSION_REASON_MAX };

export interface SuspensionResult {
  suspended: boolean;
  sessionsRevoked: boolean;
  ownedTeams: OwnedTeam[];
}

export interface MemberSuspension {
  member_id: string;
  profile_id: string;
  suspended: boolean;
  suspended_at: string | null;
  reason: string | null;
}

/** Corpo JSON de uma resposta de erro da edge function (FunctionsHttpError.context é a Response). */
async function readFunctionError(error: unknown): Promise<Record<string, unknown> | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } } | null)?.context;
  if (!context || typeof context.json !== "function") return null;
  try {
    const body = await context.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Suspende (não entra mais no app) ou reativa a conta de um perfil. */
export async function setAccountSuspension(
  profileId: string,
  action: SuspensionAction,
  options: { reason?: string | null; reportId?: string | null } = {},
): Promise<SuspensionResult> {
  const { data, error } = await supabase.functions.invoke("platform-suspend-account", {
    body: { profile_id: profileId, action, reason: options.reason?.trim() || null, report_id: options.reportId ?? null },
  });
  if (!error && data?.ok) {
    return {
      suspended: data.suspended === true,
      sessionsRevoked: data.sessions_revoked === true,
      ownedTeams: Array.isArray(data.owned_teams) ? (data.owned_teams as OwnedTeam[]) : [],
    };
  }
  const body = (data && typeof data === "object" ? data : null) ?? (await readFunctionError(error));
  throw new Error(typeof body?.message === "string" ? body.message : "Não foi possível concluir agora. Tente novamente.");
}

/** Equipes de que a pessoa suspensa é dona e que têm outros membros (precisam de novo responsável). */
export function teamsNeedingNewOwner(teams: OwnedTeam[]): OwnedTeam[] {
  return teams.filter((team) => team.other_members > 0);
}

export async function listTeamMemberSuspensions(teamId: string): Promise<MemberSuspension[]> {
  const { data, error } = await chatModerationSupabase.rpc("platform_team_member_suspensions", { p_team_id: teamId });
  if (error) throw error;
  return (data ?? []) as unknown as MemberSuspension[];
}

/** A plataforma passa a propriedade da equipe para outro membro (que vira líder). */
export async function transferTeamOwnershipAsPlatform(teamId: string, memberId: string) {
  const { data, error } = await chatModerationSupabase.rpc("platform_transfer_team_ownership", {
    p_team_id: teamId,
    p_new_owner_member_id: memberId,
  });
  if (error) throw error;
  return data as unknown as { team_id: string; owner_profile_id: string };
}
