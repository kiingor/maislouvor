import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";
import type { ChatModerationFunctions, ChatModerationTables } from "./chat-moderation-types";

type ChatModerationDatabase = {
  __InternalSupabase: { PostgrestVersion: "14.1" };
  public: {
    Tables: ChatModerationTables;
    Views: Record<never, never>;
    Functions: ChatModerationFunctions;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

// Mesma conexão autenticada do app, com os tipos só da moderação do chat
// (o types.ts gerado continua intacto, como em platform-client.ts).
export const chatModerationSupabase = supabase as unknown as SupabaseClient<ChatModerationDatabase>;
