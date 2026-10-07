import type { BillingProduct } from '../../../supabase/functions/_shared/revenuecat-model';
export type { BillingProduct };

export const billingPlanLabels = { essencial: 'Essencial', estudio: 'Estúdio', asafe: 'Asafe', completo: 'Completo' } as const;
export interface TeamSubscription {
  plan: string;
  status: string;
  provider: string;
  product_id?: string | null;
  store?: string | null;
  member_limit?: number | null;
  current_period_end?: string | null;
  access_expires_at?: string | null;
  is_active: boolean;
  will_renew: boolean;
  entitlement_ids: string[];
  environment?: 'PRODUCTION' | 'SANDBOX' | null;
  is_unlimited?: boolean;
  unlimited_reason?: 'legacy' | 'admin' | null;
}
export interface MemberCapacity {
  member_count: number;
  member_limit: number | null;
  is_unlimited: boolean;
  unlimited_reason: 'legacy' | 'admin' | null;
  effective_plan: string;
  can_add_member: boolean;
  can_manage: boolean;
}
export interface BillingContext {
  team_id: string;
  can_manage: boolean;
  app_user_id: string | null;
  member_count: number;
  products: BillingProduct[];
  subscription: TeamSubscription;
  capacity?: MemberCapacity;
}
export interface BillingOffer {
  key: string;
  product: BillingProduct;
  title: string;
  price: string;
  priceAmount?: number;
  currency?: string;
}

export function canStartSubscription(context: BillingContext): boolean {
  const subscription = context.subscription;
  return context.can_manage && !subscription.is_unlimited && !subscription.is_active &&
    (subscription.provider === 'revenuecat' || subscription.provider === 'manual' && subscription.plan === 'free');
}
