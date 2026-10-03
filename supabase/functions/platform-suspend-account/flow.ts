// Suspender ou reativar uma conta pela plataforma (Termos: "conta suspensa ou
// encerrada"; App Store 1.2: afastar quem publica conteúdo abusivo — inclusive o
// dono de uma equipe, que a moderação da equipe não remove).
//
// Sem dependência do Deno nem do supabase-js: a edge function (index.ts) injeta
// as chamadas reais e o vitest testa a ordem e os erros
// (src/lib/platformSuspension.test.ts).
//
// Ordem: o banco confere o alvo (quem pede administra a plataforma; não é a
// própria conta nem a de outro administrador) -> o GoTrue bane ou desbane (sem
// entrar e sem renovar a sessão) -> o banco grava (tabela, histórico e sessões
// guardadas). GoTrue falhou: nada foi gravado. Gravação falhou depois do
// banimento: repetir o pedido é seguro (o banco faz upsert).
//
// Também passa a propriedade de uma equipe para outro membro (action
// "transfer_ownership", ex.: o dono foi suspenso). Vai pelo servidor, com a
// service_role: com o JWT de quem administra a plataforma (sem ser líder da
// equipe), os guardas de 20261003120000 recusam a promoção a líder e a troca do
// dono. O banco (platform_transfer_team_ownership) confere de novo quem pede.

/** Duração do banimento no GoTrue: "até a plataforma reativar" (~100 anos). */
export const SUSPENSION_BAN_DURATION = "876000h";
export const SUSPENSION_REASON_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SuspensionAction = "suspend" | "reactivate";
export const TRANSFER_OWNERSHIP_ACTION = "transfer_ownership";

export interface SuspensionRequest {
  profileId: string;
  action: SuspensionAction;
  reason: string | null;
  /** Denúncia que motivou (fica no registro). */
  reportId: string | null;
}

export interface OwnedTeam {
  team_id: string;
  team_name: string;
  other_members: number;
}

export interface SuspensionTarget {
  user_id: string;
  profile_id: string;
  full_name: string | null;
  suspended: boolean;
  owned_teams: OwnedTeam[];
}

export interface SuspensionRecord {
  suspended: boolean;
  sessions_revoked: boolean;
  owned_teams: OwnedTeam[];
}

export interface SuspensionDeps {
  target(actorUserId: string, profileId: string): Promise<SuspensionTarget>;
  setBan(userId: string, banned: boolean): Promise<void>;
  record(actorUserId: string, request: SuspensionRequest): Promise<SuspensionRecord>;
  log?(step: string, error: unknown): void;
}

export interface SuspensionOutcome {
  status: number;
  body: Record<string, unknown>;
}

export interface OwnershipTransferRequest {
  teamId: string;
  /** team_members.id de quem passa a ser dono (vira líder). */
  newOwnerMemberId: string;
}

export interface OwnershipTransferResult {
  team_id: string;
  owner_profile_id: string;
}

export interface OwnershipTransferDeps {
  transfer(actorUserId: string, request: OwnershipTransferRequest): Promise<OwnershipTransferResult>;
  log?(step: string, error: unknown): void;
}

/** O que o painel pode pedir a esta function. */
export type PlatformAccountRequest =
  | { kind: "suspension"; request: SuspensionRequest }
  | { kind: "transfer"; request: OwnershipTransferRequest };

/** Corpo: { profile_id, action: "suspend" | "reactivate", reason?, report_id? }. Inválido: null. */
export function parseSuspensionRequest(body: unknown): SuspensionRequest | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const profileId = typeof raw.profile_id === "string" ? raw.profile_id.trim() : "";
  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : null;
  const reportId = typeof raw.report_id === "string" && raw.report_id.trim() ? raw.report_id.trim() : null;
  if (!UUID.test(profileId) || (raw.action !== "suspend" && raw.action !== "reactivate")) return null;
  if ((reason && reason.length > SUSPENSION_REASON_MAX) || (reportId && !UUID.test(reportId))) return null;
  return { profileId, action: raw.action, reason, reportId };
}

/** Corpo: { action: "transfer_ownership", team_id, new_owner_member_id }. Inválido: null. */
export function parseOwnershipTransferRequest(body: unknown): OwnershipTransferRequest | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const teamId = typeof raw.team_id === "string" ? raw.team_id.trim() : "";
  const newOwnerMemberId = typeof raw.new_owner_member_id === "string" ? raw.new_owner_member_id.trim() : "";
  if (raw.action !== TRANSFER_OWNERSHIP_ACTION || !UUID.test(teamId) || !UUID.test(newOwnerMemberId)) return null;
  return { teamId, newOwnerMemberId };
}

/** Escolhe a ação pelo campo action. Inválido: null. */
export function parsePlatformAccountRequest(body: unknown): PlatformAccountRequest | null {
  const transfer = parseOwnershipTransferRequest(body);
  if (transfer) return { kind: "transfer", request: transfer };
  const suspension = parseSuspensionRequest(body);
  return suspension ? { kind: "suspension", request: suspension } : null;
}

/** Resposta 400 para um corpo que nenhuma ação aceitou. */
export function invalidRequestMessage(body: unknown): string {
  const action = body && typeof body === "object" ? (body as Record<string, unknown>).action : undefined;
  return action === TRANSFER_OWNERSHIP_ACTION
    ? "Pedido inválido: informe a equipe e o novo responsável."
    : "Pedido inválido: informe a conta e a ação (suspender ou reativar).";
}

/** Erros esperados do banco (código do Postgres vindo do PostgREST) viram resposta para o painel. */
function expectedFailure(error: unknown): SuspensionOutcome | null {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  const status = code === "42501" ? 403 : code === "P0002" ? 404 : code === "22023" ? 400 : 0;
  if (!status) return null;
  const kind = status === 403 ? "forbidden" : status === 404 ? "not_found" : "invalid";
  return { status, body: { ok: false, error: kind, message: message || "Não foi possível concluir o pedido." } };
}

export async function runSuspension(
  actorUserId: string,
  request: SuspensionRequest,
  deps: SuspensionDeps,
): Promise<SuspensionOutcome> {
  const suspend = request.action === "suspend";
  let target: SuspensionTarget;
  try {
    target = await deps.target(actorUserId, request.profileId);
  } catch (error) {
    const expected = expectedFailure(error);
    if (expected) return expected;
    deps.log?.("target", error);
    return { status: 500, body: { ok: false, error: "unexpected", message: "Não foi possível conferir a conta. Tente novamente." } };
  }

  try {
    await deps.setBan(target.user_id, suspend);
  } catch (error) {
    deps.log?.("ban", error);
    return {
      status: 502,
      body: {
        ok: false,
        error: "auth_failed",
        message: suspend
          ? "O servidor de login não confirmou a suspensão. Nada foi alterado; tente novamente."
          : "O servidor de login não confirmou a reativação. Nada foi alterado; tente novamente.",
      },
    };
  }

  try {
    const record = await deps.record(actorUserId, request);
    return {
      status: 200,
      body: { ok: true, suspended: record.suspended, sessions_revoked: record.sessions_revoked, owned_teams: record.owned_teams ?? [] },
    };
  } catch (error) {
    deps.log?.("record", error);
    return {
      status: 500,
      body: {
        ok: false,
        error: "record_failed",
        message: suspend
          ? "A conta já não entra no app, mas o registro da suspensão falhou. Tente de novo para concluir."
          : "A conta já entra no app, mas o registro da reativação falhou. Tente de novo para concluir.",
      },
    };
  }
}

/** Uma transação no banco: confere quem pede, a equipe e o novo dono, promove e troca o dono. */
export async function runOwnershipTransfer(
  actorUserId: string,
  request: OwnershipTransferRequest,
  deps: OwnershipTransferDeps,
): Promise<SuspensionOutcome> {
  try {
    const result = await deps.transfer(actorUserId, request);
    return { status: 200, body: { ok: true, team_id: result.team_id, owner_profile_id: result.owner_profile_id } };
  } catch (error) {
    const expected = expectedFailure(error);
    if (expected) return expected;
    deps.log?.("transfer", error);
    return {
      status: 500,
      body: { ok: false, error: "unexpected", message: "Não foi possível transferir a propriedade agora. Confira a equipe e tente novamente." },
    };
  }
}
