// Passos da exclusão de conta, sem dependência do Deno nem do supabase-js:
// a edge function (index.ts) injeta as chamadas reais e o vitest testa a ordem,
// os erros e as repetições (src/lib/accountDeletion.test.ts).
//
// Ordem: prévia (bloqueios) -> arquivos pessoais no Storage -> banco (uma
// transação) -> usuário do Auth. Cada passo é seguro de repetir: se um falha,
// a pessoa tenta de novo e os passos já feitos viram operações vazias.

/** Palavra que a pessoa digita para confirmar. */
export const DELETE_CONFIRMATION = "EXCLUIR";

/** Remoções por chamada à Storage API. */
export const STORAGE_BATCH_SIZE = 100;

export type DeletionTeamAction = "delete_team" | "leave" | "transfer_required" | "promote_required";

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
  personal: { chat_messages: number; support_tickets: number };
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
}

export interface DeletionDeps {
  preview(userId: string): Promise<DeletionPreview>;
  listStorage(userId: string): Promise<StorageObjectRef[]>;
  removeStorage(bucket: string, paths: string[]): Promise<void>;
  deleteData(userId: string): Promise<DeleteDataResult>;
  /** Deve terminar sem erro também quando o usuário já não existe. */
  deleteAuthUser(userId: string): Promise<void>;
  log?(step: string, error: unknown): void;
}

export interface DeletionOutcome {
  status: number;
  body: Record<string, unknown>;
}

export const BLOCKED_MESSAGE =
  "Antes de excluir a conta, transfira a propriedade ou passe a liderança das equipes indicadas.";

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

/** delete_account_data recusa com 55000 quando uma equipe ainda depende da pessoa. */
export function isBlockedError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: unknown }).code === "55000";
}

const blockingTeams = (preview: DeletionPreview | null) =>
  (preview?.teams ?? [])
    .filter((team) => team.action === "transfer_required" || team.action === "promote_required")
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

  // Antes do banco: se o Storage falhar, a conta continua inteira e a pessoa tenta de novo.
  try {
    for (const [bucket, paths] of storageBatches(await deps.listStorage(userId))) {
      await deps.removeStorage(bucket, paths);
    }
  } catch (error) {
    log("storage", error);
    return failure(502, "storage_failed", "Não foi possível apagar seus arquivos agora. Sua conta continua ativa; tente novamente.");
  }

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
    return failure(500, "database_failed", "Não foi possível excluir sua conta agora. Nada foi apagado do banco; tente novamente.");
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
