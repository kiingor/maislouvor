import { platformSupabase } from "@/integrations/supabase/platform-client";
import type { PlatformFunctions } from "@/integrations/supabase/platform-types";

export const ticketStatusLabels = {
  open: "Aberto", in_review: "Em análise", planned: "Planejado", in_progress: "Em andamento",
  resolved: "Resolvido", closed: "Encerrado",
} as const;
export const ticketPriorityLabels = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" } as const;
export const ticketCategoryLabels = { bug: "Bug", improvement: "Melhoria" } as const;
export const planLabels = { free: "Essencial gratuito", pro: "Pro", custom: "Personalizado", essencial: "Essencial", estudio: "Estúdio", asafe: "Asafe", completo: "Completo" } as const;
export const subscriptionStatusLabels = {
  free: "Gratuito", trialing: "Em teste", active: "Ativa", past_due: "Em atraso", canceled: "Cancelada", expired: "Expirada",
} as const;
export const providerLabels: Record<string, string> = {
  manual: "Controle manual", app_store: "App Store", google_play: "Google Play", stripe: "Stripe", abacatepay: "AbacatePay", revenuecat: "RevenueCat",
};
export const roleLabels: Record<string, string> = { admin: "Líder", editor: "Editor", viewer: "Membro" };
export type TicketStatus = keyof typeof ticketStatusLabels;
export type TicketPriority = keyof typeof ticketPriorityLabels;
export type TicketCategory = keyof typeof ticketCategoryLabels;
export type Plan = keyof typeof planLabels;
export type SubscriptionStatus = keyof typeof subscriptionStatusLabels;

export interface Paged<T> { items: T[]; total: number; page: number; page_size: number }
export interface SupportSettings { support_enabled: boolean; support_email: string; announcement: string }
export interface PlatformSettings extends SupportSettings { updated_at: string }
export interface Ticket {
  id: string; ticket_number: number; title: string; description: string; category: TicketCategory;
  status: TicketStatus; priority: TicketPriority; requester_profile_id: string; team_id: string | null;
  requester_name: string | null; requester_email: string | null; team_name: string | null;
  created_at: string; updated_at: string; last_admin_response_at: string | null;
  message_count: number; waiting_for_staff: boolean;
}
export interface TicketMessage { id: string; message: string; is_staff: boolean; author_name: string; created_at: string }
export interface TicketDetail extends Ticket { messages: TicketMessage[]; notified?: boolean }
export interface Account {
  id: string; name: string; owner_id: string; owner_name: string | null; owner_email: string | null;
  created_at: string; plan: Plan; subscription_status: SubscriptionStatus; is_unlimited?: boolean; unlimited_reason?: "legacy" | "admin" | null;
  member_count: number; song_count: number; repertorio_count: number; culto_count: number; last_activity_at: string | null;
}
export interface Member {
  user_id: string; profile_id: string | null; full_name: string | null; avatar_url: string | null;
  email: string | null; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean;
  teams: { id: string; name: string; role: string; instruments: string[] | null }[];
}
export interface AccountMember {
  id: string; full_name: string | null; email: string | null; role: string;
  instruments: string[] | null; created_at: string; last_sign_in_at: string | null; email_confirmed: boolean;
}
export interface Subscription {
  team_id: string; plan: Plan; status: SubscriptionStatus; provider: string;
  monthly_amount: number | null; current_period_end: string | null; notes: string; updated_at?: string;
  team_name?: string; owner_email?: string;
  member_limit?: number | null; is_unlimited?: boolean; unlimited_reason?: "legacy" | "admin" | null;
  product_id?: string | null; store?: string | null; access_expires_at?: string | null;
}
export interface SubscriptionsPage extends Paged<Subscription> {
  summary: { registered: number; active: number; trialing: number; monthly_amount: number };
}
export interface AccountDetail {
  id: string; name: string; owner_name: string | null; owner_email: string | null; owner_id: string; created_at: string;
  song_count: number; repertorio_count: number; culto_count: number; pending_invites: number;
  subscription: Subscription; members: AccountMember[];
  recent_repertorios: { id: string; name: string; created_at: string }[];
  recent_cultos: { id: string; name: string; date: string }[];
  tickets: Pick<Ticket, "id" | "ticket_number" | "title" | "status" | "category" | "updated_at">[];
}
export interface Overview {
  total_accounts: number; total_users: number; total_memberships: number; total_songs: number;
  total_repertorios: number; total_cultos: number; new_accounts: number; new_users: number;
  active_accounts: number; open_tickets: number; waiting_tickets: number; active_subscriptions: number;
  growth: { date: string; accounts: number; users: number }[]; recent_accounts: Account[]; recent_tickets: Ticket[];
}

// Use RPCs with server authorization. Service-role credentials never enter the UI.
export async function platformRpc<T, N extends keyof PlatformFunctions = keyof PlatformFunctions>(
  name: N, args?: PlatformFunctions[N]["Args"],
): Promise<T> {
  const { data, error } = await platformSupabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export function platformError(error: unknown): string {
  const issue = error as { code?: string; message?: string } | null;
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(issue?.code ?? ""))
    return "Esta área ainda não está disponível. Tente novamente mais tarde.";
  if (issue?.code === "42501") return "Você não tem permissão para acessar estes dados.";
  if (issue?.code === "23514" || issue?.code === "23502") return "Confira os campos e os limites indicados antes de salvar.";
  if (["P0001", "P0002", "22023"].includes(issue?.code ?? "")) return issue?.message ?? "Confira os dados e tente novamente.";
  return "Não foi possível concluir a operação. Confira sua conexão e tente novamente.";
}

export const integerFormat = new Intl.NumberFormat("pt-BR");
export const currencyFormat = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export function displayDate(value: string | null | undefined, withTime = false) {
  if (!value) return "—";
  // Date-only values are calendar days, not midnight UTC.
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}
export function initials(value: string | null) {
  return (value || "Usuário").trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}
