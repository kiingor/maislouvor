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

/** Duração do banimento no GoTrue: "até a plataforma reativar" (~100 anos). */
export const SUSPENSION_BAN_DURATION = "876000h";
export const SUSPENSION_REASON_MAX = 500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SuspensionAction = "suspend" | "reactivate";

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
