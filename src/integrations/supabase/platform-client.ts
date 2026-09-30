import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { PlatformFunctions, PlatformTables } from "./platform-types";

type PlatformDatabase = {
  __InternalSupabase: { PostgrestVersion: "14.1" };
  public: {
    Tables: PlatformTables;
    Views: Record<never, never>;
    Functions: PlatformFunctions;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// Reuses the existing authenticated connection. The separate type keeps the
// published application's generated schema unchanged during this integration.
export const platformSupabase = supabase as unknown as SupabaseClient<PlatformDatabase>;
