// Sistema de permissões do +Louvor.
//
// O papel (role) do membro na equipe é o "grupo/preset" e já vem com um conjunto
// de permissões marcadas. Por cima do preset, o líder pode personalizar por membro
// marcando/desmarcando cada caixa — essas exceções ficam guardadas como `overrides`
// na coluna team_members.permissions (jsonb).
//
// IMPORTANTE: a função `canDo` aqui DEVE espelhar exatamente a função SQL
// `member_can(uid, team_id, resource, action)` no banco. Qualquer mudança nas regras
// padrão precisa ser feita nos dois lugares.

export type PermRole = "admin" | "editor" | "viewer";
export type PermAction = "ver" | "editar";
export type PermResource =
  | "musicas"
  | "repertorios"
  | "cultos"
  | "chat"
  | "avisos"
  | "membros";

// Exceções por recurso/ação, ex.: { repertorios: { editar: false }, musicas: { ver: false } }
export type PermOverrides = Partial<
  Record<PermResource, Partial<Record<PermAction, boolean>>>
>;

export interface ResourceDef {
  key: PermResource;
  label: string;
  /** Mostra a caixa "ver" na matriz. avisos/membros não têm restrição de "ver". */
  showVer: boolean;
  verLabel: string;
  editarLabel: string;
  /** Recurso usado como guarda de rota/menu (precisa de "ver" para acessar). */
  navResource?: boolean;
}

// Ordem e rótulos exibidos na matriz de permissões.
export const RESOURCES: ResourceDef[] = [
  { key: "musicas", label: "Músicas", showVer: true, verLabel: "Ver", editarLabel: "Editar", navResource: true },
  { key: "repertorios", label: "Repertório", showVer: true, verLabel: "Ver", editarLabel: "Editar", navResource: true },
  { key: "cultos", label: "Cultos & Escalas", showVer: true, verLabel: "Ver", editarLabel: "Editar", navResource: true },
  { key: "chat", label: "Chat", showVer: true, verLabel: "Ver", editarLabel: "Gerenciar canais", navResource: true },
  { key: "avisos", label: "Avisos", showVer: false, verLabel: "Receber", editarLabel: "Enviar avisos" },
  { key: "membros", label: "Membros & Equipe", showVer: false, verLabel: "Ver", editarLabel: "Gerenciar membros" },
];

export const ROLE_LABELS: Record<PermRole, string> = {
  admin: "Líder",
  editor: "Editor",
  viewer: "Membro",
};

/**
 * Permissão PADRÃO de um preset (sem exceções). Espelha member_can no SQL:
 * - admin: tudo
 * - ver: editor e viewer enxergam tudo por padrão
 * - editar: editor edita todo conteúdo (menos gerenciar membros); viewer não edita nada
 */
export function defaultFor(role: PermRole, resource: PermResource, action: PermAction): boolean {
  if (role === "admin") return true;
  if (action === "ver") return true;
  // action === "editar"
  if (role === "editor") return resource !== "membros";
  return false; // viewer
}

/** Permissão efetiva = preset + exceção do membro. */
export function canDo(
  role: PermRole | null | undefined,
  overrides: PermOverrides | null | undefined,
  resource: PermResource,
  action: PermAction
): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  const o = overrides?.[resource]?.[action];
  if (typeof o === "boolean") return o;
  return defaultFor(role, resource, action);
}

/** Matriz efetiva completa (para preencher os checkboxes). */
export function effectiveMatrix(
  role: PermRole,
  overrides: PermOverrides | null | undefined
): Record<PermResource, Record<PermAction, boolean>> {
  const out = {} as Record<PermResource, Record<PermAction, boolean>>;
  for (const r of RESOURCES) {
    out[r.key] = {
      ver: canDo(role, overrides, r.key, "ver"),
      editar: canDo(role, overrides, r.key, "editar"),
    };
  }
  return out;
}

/**
 * A partir de uma matriz editada pelo usuário, devolve só as exceções
 * (células que diferem do preset do papel). Guardar isso em permissions
 * mantém o jsonb enxuto e faz o membro "seguir" o preset quando não há exceção.
 */
export function diffOverrides(
  role: PermRole,
  matrix: Record<PermResource, Record<PermAction, boolean>>
): PermOverrides {
  const overrides: PermOverrides = {};
  for (const r of RESOURCES) {
    for (const action of ["ver", "editar"] as PermAction[]) {
      const value = matrix[r.key]?.[action];
      if (typeof value !== "boolean") continue;
      if (value !== defaultFor(role, r.key, action)) {
        (overrides[r.key] ||= {})[action] = value;
      }
    }
  }
  return overrides;
}

/** Normaliza o jsonb vindo do banco para PermOverrides. */
export function parseOverrides(raw: unknown): PermOverrides {
  if (!raw || typeof raw !== "object") return {};
  return raw as PermOverrides;
}
