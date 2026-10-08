import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { BillingContext, BillingOffer, MemberCapacity } from './types';
import { functionError } from '@/lib/function-error';

// Keep the billing RPC extension separate from the generated, shared schema file.
type BillingDatabase = {
  public: {
    Tables: Record<string, never>; Views: Record<string, never>; Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
    Functions: {
      get_team_billing_context: { Args: { p_team_id: string }; Returns: Json };
      get_team_member_capacity: { Args: { p_team_id: string }; Returns: Json };
    };
  };
};
const client = supabase as unknown as SupabaseClient<BillingDatabase>;

export async function getMemberCapacity(teamId: string): Promise<MemberCapacity> {
  const { data, error } = await client.rpc('get_team_member_capacity', { p_team_id: teamId });
  if (error) throw error;
  const capacity = data as unknown as MemberCapacity;
  if (capacity.can_add_member || capacity.is_unlimited) return capacity;
  const refresh = await supabase.functions.invoke('revenuecat-sync', { body: { team_id: teamId, capacity_only: true } });
  if (refresh.error) throw new Error('Não foi possível conferir a renovação da equipe. Tente novamente.');
  if (!refresh.data?.refreshed) return capacity;
  const latest = await client.rpc('get_team_member_capacity', { p_team_id: teamId });
  if (latest.error) throw latest.error;
  return latest.data as unknown as MemberCapacity;
}

export async function getBillingContext(teamId: string): Promise<BillingContext> {
  const { data, error } = await client.rpc('get_team_billing_context', { p_team_id: teamId });
  if (error) throw error;
  return data as unknown as BillingContext;
}

export async function requireBillingOwner(teamId: string): Promise<BillingContext> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('Entre novamente para gerenciar a assinatura.');
  const context = await getBillingContext(teamId);
  if (!context.can_manage || !context.app_user_id) throw new Error('Somente o responsável pela equipe pode gerenciar a assinatura.');
  return context;
}

export async function syncBilling(teamId: string): Promise<{ management_url: string | null; is_active: boolean }> {
  const { data, error } = await supabase.functions.invoke('revenuecat-sync', { body: { team_id: teamId } });
  if (error) throw new Error('Não foi possível confirmar a assinatura. Tente atualizar novamente.');
  return data;
}

export async function getWebBillingPortal(teamId: string, offer?: BillingOffer): Promise<string> {
  const { data, error } = await supabase.functions.invoke('revenuecat-web-portal', { body: {
    team_id: teamId,
    ...(offer ? { product_id: offer.product.product_id, expected_price_cents: Math.round((offer.priceAmount ?? 0) * 100), currency: offer.currency } : {}),
  } });
  if (error) throw new Error((await functionError(error, data)).error ?? 'Não foi possível abrir o gerenciamento.');
  if (typeof data?.url !== 'string') throw new Error('Gerenciamento indisponível. Tente novamente.');
  return data.url;
}
