// Pure subscription projection, also exercised by Vitest. No client receipts are trusted.
export type BillingPlan = 'essencial' | 'estudio' | 'asafe' | 'completo';
export interface BillingProduct {
  product_id: string;
  entitlement_id: string;
  plan: BillingPlan;
  member_limit: number;
  billing_period: 'monthly' | 'annual';
  enabled: boolean;
}
export type BillingEnvironment = 'PRODUCTION' | 'SANDBOX';
interface Entitlement {
  product_identifier: string;
  expires_date: string | null;
  grace_period_expires_date?: string | null;
}
interface Subscription {
  is_sandbox: boolean;
  store: string;
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  period_type?: string;
  billing_issues_detected_at?: string | null;
  unsubscribe_detected_at?: string | null;
  refunded_at?: string | null;
}
export interface SubscriberResponse {
  request_date_ms: number;
  subscriber: {
    entitlements: Record<string, Entitlement>;
    subscriptions: Record<string, Subscription>;
    management_url?: string | null;
  };
}

function timestamp(value: string | null | undefined): number {
  if (value == null) return 0;
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new Error('Invalid RevenueCat date');
  return result;
}

export function projectSubscriber(data: SubscriberResponse, products: BillingProduct[], environment: BillingEnvironment) {
  if (!Number.isSafeInteger(data?.request_date_ms) || data.request_date_ms <= 0 ||
    !data.subscriber?.entitlements || typeof data.subscriber.entitlements !== 'object' || Array.isArray(data.subscriber.entitlements) ||
    !data.subscriber?.subscriptions || typeof data.subscriber.subscriptions !== 'object' || Array.isArray(data.subscriber.subscriptions)) {
    throw new Error('Invalid RevenueCat subscriber response');
  }
  const now = data.request_date_ms;
  const candidates = Object.entries(data.subscriber.entitlements).flatMap(([id, entitlement]) => {
    if (!entitlement || typeof entitlement.product_identifier !== 'string' ||
      (entitlement.expires_date !== null && typeof entitlement.expires_date !== 'string')) throw new Error('Invalid entitlement');
    const subscription = data.subscriber.subscriptions[entitlement.product_identifier];
    if (!subscription) return []; // One-time and promotional grants are not team subscriptions.
    if (typeof subscription.is_sandbox !== 'boolean' || typeof subscription.store !== 'string') throw new Error('Invalid subscription');
    if (subscription.is_sandbox !== (environment === 'SANDBOX')) return [];
    const expires = timestamp(entitlement.expires_date);
    const accessExpires = Math.max(expires, timestamp(entitlement.grace_period_expires_date), timestamp(subscription.grace_period_expires_date));
    const active = !subscription.refunded_at && expires > 0 && accessExpires > now;
    // Disabled products still recognize existing purchases. Never silently revoke
    // a live subscription because an operator forgot its catalog mapping.
    const product = products.find((item) => item.product_id === entitlement.product_identifier && item.entitlement_id === id);
    if (!product) {
      if (active) throw new Error('Active RevenueCat product is missing from the billing catalog');
      return [];
    }
    return [{ id, product, subscription, expires, accessExpires, active }];
  });
  // Prefer live access, then the largest plan. This handles overlapping renewals
  // and upgrades without allowing an expired entitlement to win.
  const rank: Record<BillingPlan, number> = { essencial: 1, estudio: 2, asafe: 2, completo: 3 };
  candidates.sort((a, b) => Number(b.active) - Number(a.active) ||
    (a.active ? rank[b.product.plan] - rank[a.product.plan] || b.product.member_limit - a.product.member_limit : 0) ||
    b.accessExpires - a.accessExpires);
  const selected = candidates[0];
  const active = selected?.active ?? false;
  const sub = selected?.subscription;
  return {
    request_date_ms: now,
    environment,
    product_id: selected?.product.product_id ?? null,
    store: sub?.store ?? null,
    is_active: active,
    status: !active ? 'expired' : sub?.billing_issues_detected_at ? 'past_due' : sub?.period_type === 'trial' ? 'trialing' : 'active',
    current_period_end: selected?.expires ? new Date(selected.expires).toISOString() : null,
    access_expires_at: active ? new Date(selected.accessExpires).toISOString() : null,
    will_renew: active && !sub?.unsubscribe_detected_at && !sub?.billing_issues_detected_at,
    entitlement_ids: active ? [selected.id] : [],
  };
}

export interface RevenueCatEvent {
  id: string;
  type: string;
  environment?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}

export function eventCustomerIds(event: RevenueCatEvent): string[] {
  const ids = [event.app_user_id, event.original_app_user_id,
    ...(Array.isArray(event.aliases) ? event.aliases : []),
    ...(Array.isArray(event.transferred_from) ? event.transferred_from : []),
    ...(Array.isArray(event.transferred_to) ? event.transferred_to : [])];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))];
}

export function safeManagementUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
