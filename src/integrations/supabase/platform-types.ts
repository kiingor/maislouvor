import type { Json } from "./types";

type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };

export type PlatformTables = {
  platform_admins: ReadOnlyTable<{ user_id: string; created_at: string }>;
  platform_settings: ReadOnlyTable<{
    id: boolean; support_enabled: boolean; support_email: string; announcement: string;
    updated_at: string; updated_by: string | null;
  }>;
  platform_audit_log: ReadOnlyTable<{
    id: string; actor_user_id: string | null; action: string; entity_id: string | null;
    details: Json; created_at: string;
  }>;
  account_subscriptions: ReadOnlyTable<{
    team_id: string; plan: string; status: string; provider: string;
    monthly_amount: number | null; current_period_end: string | null; notes: string;
    updated_at: string; updated_by: string | null;
  }>;
  support_tickets: ReadOnlyTable<{
    id: string; ticket_number: number; requester_profile_id: string; team_id: string | null;
    category: string; title: string; description: string; status: string; priority: string;
    last_admin_response_at: string | null; created_at: string; updated_at: string;
  }>;
  support_ticket_messages: ReadOnlyTable<{
    id: string; ticket_id: string; author_profile_id: string | null;
    is_staff: boolean; message: string; created_at: string;
  }>;
};

type JsonFunction<Args> = { Args: Args; Returns: Json };
export type PlatformFunctions = {
  is_platform_admin: { Args: never; Returns: boolean };
  get_support_settings: JsonFunction<never>;
  create_support_ticket: {
    Args: { p_title: string; p_description: string; p_category: string; p_team_id?: string | null };
    Returns: string;
  };
  list_support_tickets: JsonFunction<{
    p_admin?: boolean; p_search?: string; p_status?: string; p_category?: string;
    p_priority?: string; p_page?: number; p_page_size?: number;
  }>;
  get_support_ticket: JsonFunction<{ p_ticket_id: string }>;
  reply_support_ticket: JsonFunction<{
    p_ticket_id: string; p_message?: string | null; p_status?: string | null; p_priority?: string | null;
  }>;
  admin_get_overview: JsonFunction<{ p_days?: number }>;
  admin_list_accounts: JsonFunction<{ p_search?: string; p_plan?: string; p_page?: number; p_page_size?: number }>;
  admin_get_account: JsonFunction<{ p_team_id: string }>;
  admin_list_members: JsonFunction<{ p_search?: string; p_page?: number; p_page_size?: number }>;
  admin_list_subscriptions: JsonFunction<{ p_search?: string; p_status?: string; p_page?: number; p_page_size?: number }>;
  admin_update_subscription: JsonFunction<{
    p_team_id: string; p_plan: string; p_status: string; p_monthly_amount?: number | null;
    p_current_period_end?: string | null; p_notes?: string; p_member_limit?: number; p_is_unlimited?: boolean;
  }>;
  admin_update_settings: JsonFunction<{ p_support_enabled: boolean; p_support_email: string; p_announcement: string }>;
};
