import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { AccountDeletionFunctions, AccountDeletionTables } from "./account-deletion-types";

type AccountDeletionDatabase = {
  __InternalSupabase: { PostgrestVersion: "14.1" };
  public: {
    Tables: AccountDeletionTables;
    Views: Record<never, never>;
    Functions: AccountDeletionFunctions;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// Mesma conexão autenticada; o tipo separado mantém types.ts intocado (como platform-client.ts).
export const accountDeletionSupabase = supabase as unknown as SupabaseClient<AccountDeletionDatabase>;
