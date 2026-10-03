import { supabase } from "@/integrations/supabase/client";
import { accountDeletionSupabase } from "@/integrations/supabase/account-deletion-client";
import {
  DELETE_CONFIRMATION,
  isDeletionConfirmed,
  type DeletionCandidate,
  type DeletionPreview,
  type DeletionTeam,
  type DeletionTeamAction,
} from "../../supabase/functions/delete-account/flow.ts";

export { DELETE_CONFIRMATION, type DeletionCandidate, type DeletionPreview, type DeletionTeam, type DeletionTeamAction };

/* ------------------------------------------------------------------
   PLACEHOLDERS para o integrador: confirmar antes de publicar e, quando
   src/lib/legal.ts (branch das páginas legais) entrar, apontar para lá.
   ------------------------------------------------------------------ */
/** PLACEHOLDER: e-mail para quem não consegue entrar pedir a exclusão. */
export const DELETE_REQUEST_EMAIL = "privacidade@maislouvor.com";
/** PLACEHOLDER: dias até as cópias de segurança com os dados apagados serem substituídas. */
export const BACKUP_RETENTION_DAYS = 30;
/** PLACEHOLDER: prazo para atender um pedido por e-mail (LGPD, art. 19: até 15 dias). */
export const DELETE_REQUEST_RESPONSE_DAYS = 15;

/** Âncora da seção em Ajustes › Meu usuário (a página pública leva direto para ela). */
export const DELETE_ACCOUNT_ANCHOR = "excluir-conta";
export const DELETE_ACCOUNT_SETTINGS_PATH = `/app/settings#${DELETE_ACCOUNT_ANCHOR}`;

export const isConfirmationTyped = (text: string) => isDeletionConfirmed({ confirmation: text });

const ACTIONS: DeletionTeamAction[] = ["delete_team", "leave", "transfer_required", "promote_required"];
const ROLES = ["admin", "editor", "viewer"] as const;
const asRole = (value: unknown) => (ROLES as readonly unknown[]).includes(value) ? (value as DeletionCandidate["role"]) : null;

/** O JSON da RPC vira um objeto previsível (a tela não quebra com campos faltando). */
export function parseDeletionPreview(value: unknown): DeletionPreview {
  const raw = (value ?? {}) as Record<string, unknown>;
  const personal = (raw.personal ?? {}) as Record<string, unknown>;
  const teams = (Array.isArray(raw.teams) ? raw.teams : []).map((item) => {
    const team = (item ?? {}) as Record<string, unknown>;
    const action = ACTIONS.includes(team.action as DeletionTeamAction) ? (team.action as DeletionTeamAction) : "leave";
    return {
      team_id: String(team.team_id ?? ""),
      team_name: String(team.team_name ?? "Equipe"),
      role: asRole(team.role),
      is_owner: team.is_owner === true,
      member_count: Number(team.member_count) || 0,
      action,
      candidates: (Array.isArray(team.candidates) ? team.candidates : []).map((c) => {
        const candidate = (c ?? {}) as Record<string, unknown>;
        return {
          profile_id: String(candidate.profile_id ?? ""),
          full_name: typeof candidate.full_name === "string" ? candidate.full_name : null,
          role: asRole(candidate.role) ?? "viewer",
        };
      }),
    };
  });
  const blocked = teams.some((t) => t.action === "transfer_required" || t.action === "promote_required");
  return {
    has_profile: raw.has_profile !== false,
    can_delete: raw.can_delete === true && !blocked,
    teams,
    personal: {
      chat_messages: Number(personal.chat_messages) || 0,
      support_tickets: Number(personal.support_tickets) || 0,
      draft_songs: Number(personal.draft_songs) || 0,
    },
  };
}

export async function fetchDeletionPreview(): Promise<DeletionPreview> {
  const { data, error } = await accountDeletionSupabase.rpc("get_account_deletion_preview");
  if (error) throw new Error(error.message);
  return parseDeletionPreview(data);
}

/** Dono passa a equipe para outro membro, que vira líder (RPC transfer_team_ownership). */
export async function transferTeamOwnership(teamId: string, newOwnerProfileId: string) {
  const { error } = await accountDeletionSupabase.rpc("transfer_team_ownership", {
    p_team_id: teamId,
    p_new_owner_profile_id: newOwnerProfileId,
  });
  if (error) throw new Error(error.message);
}

/** Único líder (sem ser dono) promove outro membro: mesmo update de papel da aba Membros. */
export async function promoteTeamLeader(teamId: string, profileId: string) {
  const { data, error } = await accountDeletionSupabase
    .from("team_members")
    .update({ role: "admin", permissions: {} })
    .eq("team_id", teamId)
    .eq("profile_id", profileId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Não foi possível promover esta pessoa. Confira se você ainda é líder da equipe.");
}

export type BlockingTeam = { team_id: string; team_name: string; action: DeletionTeamAction };

export class AccountDeletionError extends Error {
  constructor(message: string, readonly code: string, readonly teams: BlockingTeam[] = []) {
    super(message);
    this.name = "AccountDeletionError";
  }
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

export async function requestAccountDeletion(confirmation: string) {
  const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirmation } });
  if (!error && data?.ok) {
    return { alreadyDeleted: data.already_deleted === true, deletedTeamIds: (data.deleted_team_ids ?? []) as string[] };
  }
  const body = (data && typeof data === "object" ? data : null) ?? (await readFunctionError(error));
  throw new AccountDeletionError(
    typeof body?.message === "string" ? body.message : "Não foi possível excluir sua conta agora. Tente novamente.",
    typeof body?.error === "string" ? body.error : "unknown",
    Array.isArray(body?.teams) ? (body.teams as BlockingTeam[]) : [],
  );
}

/** Esquece o que o app guardou no aparelho para a conta (mesmas chaves do TeamContext). */
export function clearLocalAccountData(userId: string | null | undefined) {
  try {
    if (userId) localStorage.removeItem(`louvor_team_cache:${userId}`);
    localStorage.removeItem("louvor_current_team");
  } catch {
    /* sem storage */
  }
}
