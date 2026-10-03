import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { AssistantConsentFunctions, AssistantConsentTables } from "./assistant-consent-types";

type AssistantConsentDatabase = {
  __InternalSupabase: { PostgrestVersion: "14.1" };
  public: {
    Tables: AssistantConsentTables;
    Views: Record<never, never>;
    Functions: AssistantConsentFunctions;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// Mesma conexão autenticada do app, com os tipos só desta funcionalidade.
export const assistantConsentSupabase = supabase as unknown as SupabaseClient<AssistantConsentDatabase>;
