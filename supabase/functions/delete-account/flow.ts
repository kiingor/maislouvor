// Passos da exclusão de conta, sem dependência do Deno nem do supabase-js:
// a edge function (index.ts) injeta as chamadas reais e o vitest testa a ordem,
// os erros e as repetições (src/lib/accountDeletion.test.ts).
//
// Ordem: prévia (bloqueios) -> banco (uma transação, que também lista os
// arquivos numa fila) -> arquivos no Storage -> usuário do Auth. Arquivo só sai
// depois que o banco confirmou: se o banco falhar, nada foi apagado. Cada passo
// é seguro de repetir: numa nova tentativa o banco devolve os arquivos que ainda
// estão na fila e os passos já feitos viram operações vazias.

/** Palavra que a pessoa digita para confirmar. */
export const DELETE_CONFIRMATION = "EXCLUIR";

/** Remoções por chamada à Storage API. */
export const STORAGE_BATCH_SIZE = 100;

/**
 * O que acontece com cada equipe. transfer_required / promote_required: a pessoa
 * resolve no app (transfere a propriedade ou promove um líder). support_required:
 * dono que não é mais líder, numa equipe sem outro líder — o guarda de
 * 20261003120000 não o deixa promover ninguém, então só a plataforma passa a equipe.
 */
export type DeletionTeamAction = "delete_team" | "leave" | "transfer_required" | "promote_required" | "support_required";

/** Ações que impedem a exclusão até serem resolvidas. */
export const BLOCKING_ACTIONS: readonly DeletionTeamAction[] = ["transfer_required", "promote_required", "support_required"];
export const isBlockingAction = (action: DeletionTeamAction) => BLOCKING_ACTIONS.includes(action);

export interface DeletionCandidate {
  profile_id: string;
  full_name: string | null;
  role: "admin" | "editor" | "viewer";
}

export interface DeletionTeam {
  team_id: string;
  team_name: string;
  role: "admin" | "editor" | "viewer" | null;
  is_owner: boolean;
  member_count: number;
  action: DeletionTeamAction;
  candidates: DeletionCandidate[];
}

export interface DeletionPreview {
  has_profile: boolean;
  can_delete: boolean;
  teams: DeletionTeam[];
  personal: { chat_messages: number; support_tickets: number; draft_songs: number };
}

export interface StorageObjectRef {
  bucket: string;
  path: string;
}

export interface DeleteDataResult {
  deleted: boolean;
  already_deleted: boolean;
  deleted_team_ids: string[];
  left_team_count: number;
  /** Arquivos ainda na fila (account_deletion_storage_queue) para remover. */
  storage_objects: StorageObjectRef[];
}

export interface DeletionDeps {
  preview(userId: string): Promise<DeletionPreview>;
  revokeProvider?(): Promise<void>;
  deleteData(userId: string): Promise<DeleteDataResult>;
  removeStorage(bucket: string, paths: string[]): Promise<void>;
  /** Tira da fila os arquivos já removidos (account_deletion_storage_done). */
  storageDone(userId: string, objects: StorageObjectRef[]): Promise<void>;
  /** Deve terminar sem erro também quando o usuário já não existe. */
  deleteAuthUser(userId: string): Promise<void>;
  log?(step: string, error: unknown): void;
}

export interface DeletionOutcome {
  status: number;
  body: Record<string, unknown>;
}

export const BLOCKED_MESSAGE =
  "Antes de excluir a conta, resolva as equipes indicadas: transfira a propriedade, passe a liderança ou escolha quem assume a equipe.";

/** Confirmação vinda do corpo da requisição: { confirmation: "EXCLUIR" } (sem diferenciar maiúsculas). */
export function isDeletionConfirmed(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const value = (body as Record<string, unknown>).confirmation;
  return typeof value === "string" && value.trim().toLocaleUpperCase("pt-BR") === DELETE_CONFIRMATION;
}

/** Agrupa por bucket, sem repetir caminhos, em lotes para a Storage API. */
export function storageBatches(objects: unknown, size = STORAGE_BATCH_SIZE): Array<[string, string[]]> {
  const byBucket = new Map<string, Set<string>>();
  for (const item of Array.isArray(objects) ? objects : []) {
    const { bucket, path } = (item ?? {}) as Partial<StorageObjectRef>;
    if (typeof bucket !== "string" || !bucket || typeof path !== "string" || !path) continue;
    if (!byBucket.has(bucket)) byBucket.set(bucket, new Set());
    byBucket.get(bucket)!.add(path);
  }
  const batches: Array<[string, string[]]> = [];
  for (const [bucket, paths] of byBucket) {
    const list = [...paths];
    for (let i = 0; i < list.length; i += size) batches.push([bucket, list.slice(i, i + size)]);
  }
  return batches;
}

/**
 * O GoTrue diz que o usuário do token não existe mais: código user_not_found
 * (ou, em versões sem código, "User from sub claim in JWT does not exist").
 * Sessão revogada ("Session from session_id claim in JWT does not exist",
 * session_not_found) NÃO conta: a conta continua lá.
 */
export function isMissingUserError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "user_not_found" || (typeof message === "string" && /user from sub claim in jwt does not exist/i.test(message));
}

/** sub do JWT do cabeçalho Authorization (só leitura; quem valida é o GoTrue). */
export function jwtSubject(authorization: string | null | undefined): string | null {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const sub = JSON.parse(atob(base64))?.sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

/**
 * getUser() falhou. Só responde "conta já excluída" quando o GoTrue disse que o
 * usuário do token não existe E a Admin API confirma; qualquer outro erro
 * (sessão revogada, token inválido, falha de rede) pede para entrar de novo.
 */
export async function isCallerAlreadyDeleted(
  authError: unknown,
  authorization: string | null | undefined,
  userExists: (userId: string) => Promise<boolean>,
): Promise<boolean> {
  if (!isMissingUserError(authError)) return false;
  const sub = jwtSubject(authorization);
  if (!sub) return false;
  try {
    return !(await userExists(sub));
  } catch {
    return false;
  }
}

/** delete_account_data recusa com 55000 quando uma equipe ainda depende da pessoa. */
export function isBlockedError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "55000";
}

const blockingTeams = (preview: DeletionPreview | null) =>
  (preview?.teams ?? [])
    .filter((team) => isBlockingAction(team.action))
    .map(({ team_id, team_name, action }) => ({ team_id, team_name, action }));

const failure = (status: number, error: string, message: string, extra: Record<string, unknown> = {}): DeletionOutcome => ({
  status,
  body: { ok: false, error, message, ...extra },
});

export async function runAccountDeletion(userId: string, deps: DeletionDeps): Promise<DeletionOutcome> {
  const log = deps.log ?? (() => {});

  let preview: DeletionPreview;
  try {
    preview = await deps.preview(userId);
  } catch (error) {
    log("preview", error);
    return failure(500, "preview_failed", "Não foi possível conferir sua conta agora. Tente novamente.");
  }
  if (!preview.can_delete) {
    return failure(409, "blocked", BLOCKED_MESSAGE, { teams: blockingTeams(preview) });
  }

  try {
    await deps.revokeProvider?.();
  } catch (error) {
    log("provider", error);
    return failure(502, "provider_revocation_failed", "A Apple não confirmou a revogação agora. Seus dados continuam no app; tente novamente.");
  }

  // Banco primeiro, numa transação: se falhar, nada foi apagado (nem arquivo).
  let result: DeleteDataResult;
  try {
    result = await deps.deleteData(userId);
  } catch (error) {
    if (isBlockedError(error)) {
      // Alguém entrou numa equipe entre a prévia e a exclusão.
      const latest = await deps.preview(userId).catch(() => null);
      return failure(409, "blocked", BLOCKED_MESSAGE, { teams: blockingTeams(latest) });
    }
    log("database", error);
    return failure(500, "database_failed", "Não foi possível excluir sua conta agora. Nada foi apagado; tente novamente.");
  }

  // Depois do banco: o que não sair agora continua na fila e sai na próxima tentativa.
  try {
    const batches = storageBatches(result?.storage_objects);
    for (const [bucket, paths] of batches) {
      await deps.removeStorage(bucket, paths);
    }
    if (batches.length) {
      await deps.storageDone(userId, batches.flatMap(([bucket, paths]) => paths.map((path) => ({ bucket, path }))));
    }
  } catch (error) {
    log("storage", error);
    return failure(502, "storage_failed", "Seus dados foram apagados, mas alguns arquivos ainda não. Tente novamente para concluir.");
  }

  try {
    await deps.deleteAuthUser(userId);
  } catch (error) {
    log("auth", error);
    return failure(502, "auth_failed", "Seus dados foram apagados, mas o acesso ainda não foi encerrado. Tente novamente para concluir.");
  }

  return {
    status: 200,
    body: {
      ok: true,
      already_deleted: !!result?.already_deleted,
      deleted_team_ids: Array.isArray(result?.deleted_team_ids) ? result.deleted_team_ids : [],
    },
  };
}
