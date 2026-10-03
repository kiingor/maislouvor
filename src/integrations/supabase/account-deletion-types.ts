import type { Json } from "./types";

type TeamRole = "admin" | "editor" | "viewer";

// Só o que a exclusão de conta usa. A coluna permissions ainda não está nos
// tipos gerados (types.ts), e o líder promovido fica sem exceções.
export type AccountDeletionTables = {
  team_members: {
    Row: { id: string; team_id: string; profile_id: string; role: TeamRole; permissions: Json };
    Insert: never;
    Update: { role?: TeamRole; permissions?: Json };
    Relationships: [];
  };
};

// Migração 20261003130000_account_deletion.sql. As funções internas
// (account_deletion_preview_for, delete_account_data...) só a edge function chama.
export type AccountDeletionFunctions = {
  get_account_deletion_preview: { Args: never; Returns: Json };
  transfer_team_ownership: {
    Args: { p_team_id: string; p_new_owner_profile_id: string };
    Returns: Json;
  };
};
