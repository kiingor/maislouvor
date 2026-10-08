import { supabase } from "@/integrations/supabase/client";
import { accountDeletionSupabase } from "@/integrations/supabase/account-deletion-client";
import type { TransferTeamOwnershipError } from "@/integrations/supabase/account-deletion-types";
import { DELETE_ACCOUNT_ANCHOR, DELETE_ACCOUNT_SETTINGS_PATH } from "@/lib/legal";
import {
  DELETE_CONFIRMATION,
  isBlockingAction,
  isDeletionConfirmed,
  type DeletionCandidate,
  type DeletionPreview,
  type DeletionTeam,
  type DeletionTeamAction,
} from "../../supabase/functions/delete-account/flow.ts";

export { DELETE_CONFIRMATION, isBlockingAction, type DeletionCandidate, type DeletionPreview, type DeletionTeam, type DeletionTeamAction };

/* O e-mail para pedidos, os prazos (backups, resposta por e-mail) e os caminhos
   (/excluir-conta e a seção em Usuário › Perfil) ficam em src/lib/legal.ts,
   a mesma fonte dos Termos e da Política de Privacidade. */
export { DELETE_ACCOUNT_ANCHOR, DELETE_ACCOUNT_SETTINGS_PATH };

export const isConfirmationTyped = (text: string) => isDeletionConfirmed({ confirmation: text });

const ACTIONS: DeletionTeamAction[] = ["delete_team", "leave", "transfer_required", "promote_required", "support_required"];
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
  const blocked = teams.some((t) => isBlockingAction(t.action));
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

/** Recusas de transfer_team_ownership ({ ok: false, error }) em português. */
export const TRANSFER_OWNERSHIP_ERRORS: Record<TransferTeamOwnershipError, string> = {
  forbidden: "Só o dono da equipe pode transferi-la. Atualize a tela: talvez a equipe já tenha outro dono.",
  not_member: "A pessoa escolhida não faz mais parte da equipe. Atualize a tela e escolha outra pessoa.",
};

/**
 * O guarda de 20261003120000 recusou promover o novo dono (42501): quem transfere
 * não é mais líder da equipe (rebaixado ou removido antes do guarda) e a pessoa
 * escolhida também não é. A prévia, recarregada, só oferece líderes ou o suporte.
 */
export const TRANSFER_NOT_LEADER_MESSAGE =
  "Você não é mais líder desta equipe, então só pode passá-la para alguém que já é líder. Escolha um líder ou, se não houver, fale com o suporte.";

type TransferRefusalCode = TransferTeamOwnershipError | "not_leader" | "unknown";

/** O banco recusou a transferência: a equipe mudou desde a prévia (vale recarregá-la). */
export class TeamOwnershipTransferRefused extends Error {
  constructor(readonly code: TransferRefusalCode) {
    super(
      code === "unknown" ? "Não foi possível transferir a equipe agora. Tente novamente."
        : code === "not_leader" ? TRANSFER_NOT_LEADER_MESSAGE
        : TRANSFER_OWNERSHIP_ERRORS[code],
    );
    this.name = "TeamOwnershipTransferRefused";
  }
}

/** Erro do PostgREST que é a recusa do guarda de líderes (e não falta de permissão na função). */
const isLeaderGuardRefusal = (error: { code?: unknown; message?: unknown }) =>
  error.code === "42501" && typeof error.message === "string" && /l[ií]der/i.test(error.message);

/**
 * Dono passa a equipe para outro membro, que vira líder; o dono atual continua
 * líder. RPC transfer_team_ownership de 20261003120000 (já em produção): responde
 * { ok: true } ou { ok: false, error: "forbidden" | "not_member" } em vez de erro.
 * A exceção é o guarda de líderes (42501), quando o dono já não é líder e a pessoa
 * escolhida também não: vira recusa "not_leader". Falha de rede ou do PostgREST
 * continua sendo Error com a mensagem do cliente.
 */
export async function transferTeamOwnership(teamId: string, newOwnerProfileId: string) {
  const { data, error } = await accountDeletionSupabase.rpc("transfer_team_ownership", {
    p_team_id: teamId,
    p_new_owner_profile_id: newOwnerProfileId,
  });
  if (error && isLeaderGuardRefusal(error)) throw new TeamOwnershipTransferRefused("not_leader");
  if (error) throw new Error(error.message);
  const result = (data ?? {}) as { ok?: unknown; error?: unknown };
  if (result.ok === true) return;
  throw new TeamOwnershipTransferRefused(result.error === "forbidden" || result.error === "not_member" ? result.error : "unknown");
}

/** RPC limitada à preparação da exclusão, acessível mesmo após retirar o consentimento. */
export async function promoteTeamLeader(teamId: string, profileId: string) {
  const { error } = await accountDeletionSupabase.rpc("account_deletion_promote_leader", {
    p_team_id: teamId, p_profile_id: profileId,
  });
  if (error) throw new Error(error.message);
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
    return { appleManualRevoke: data.apple_manual_revoke === true, alreadyDeleted: data.already_deleted === true, deletedTeamIds: (data.deleted_team_ids ?? []) as string[] };
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
    if (userId) {
      localStorage.removeItem(`louvor_team_cache:${userId}`);
      localStorage.removeItem(`maislouvor.faceid.prompted.${userId}`);
    }
    localStorage.removeItem("louvor_current_team");
  } catch {
    /* sem storage */
  }
}

/** Recuperação específica do dono legado de uma equipe sem liderança. */
export async function recoverDeletionTeam(teamId: string, newOwner: string) {
  const { data, error } = await supabase.functions.invoke("delete-account", { body: { action: "resolve_team", teamId, newOwner } });
  if (error || !data?.ok) throw new Error("Não foi possível transferir a equipe. Atualize a tela e tente novamente.");
}
