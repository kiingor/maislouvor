import type { SecurityContext } from './security.ts';
import { HttpError, readResponseText, requiredEnv } from './security.ts';
import { projectCustomerSubscriber, safeManagementUrl, type BillingCustomerPolicy, type BillingEnvironment, type BillingProduct, type SubscriberResponse } from './revenuecat-model.ts';

export function billingEnvironment(): BillingEnvironment {
  const value = requiredEnv('REVENUECAT_ENVIRONMENT');
  if (value !== 'PRODUCTION' && value !== 'SANDBOX') throw new HttpError(503, 'Ambiente de cobrança não configurado.');
  return value;
}

export async function customerBillingPolicy(admin: SecurityContext['admin'], appUserId: string): Promise<BillingCustomerPolicy> {
  const { data, error } = await admin.rpc('revenuecat_customer_policy', { p_app_user_id: appUserId });
  if (error || !data || typeof data.known !== 'boolean' || typeof data.may_sync !== 'boolean' ||
    !['PRODUCTION', 'SANDBOX'].includes(data.environment) ||
    (data.environment === 'SANDBOX' ? data.store !== 'app_store' : data.store !== null)) {
    throw new HttpError(503, 'Política de cobrança indisponível.');
  }
  return data as BillingCustomerPolicy;
}

export async function syncRevenueCat(admin: SecurityContext['admin'], appUserId: string) {
  const policy = await customerBillingPolicy(admin, appUserId);
  if (!policy.known || !policy.may_sync) throw new HttpError(409, 'O teste desta equipe foi encerrado. Entre em contato com o suporte.');
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${requiredEnv('REVENUECAT_SECRET_API_KEY')}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  // Never turn a timeout, 404, 429 or malformed response into a free subscription.
  if (!response.ok) throw new HttpError(502, 'Não foi possível consultar a assinatura. Tente novamente.');
  const subscriber = JSON.parse(await readResponseText(response, 1_048_576)) as SubscriberResponse;
  const { data: products, error: catalogError } = await admin.from('revenuecat_products').select('*');
  if (catalogError) throw new HttpError(503, 'Catálogo de assinaturas indisponível.');
  const snapshot = projectCustomerSubscriber(subscriber, products as BillingProduct[], policy);
  const { error } = await admin.rpc('apply_revenuecat_snapshot', { p_app_user_id: appUserId, p_snapshot: snapshot });
  if (error) throw new HttpError(503, 'Não foi possível atualizar a assinatura.');
  return { management_url: safeManagementUrl(subscriber.subscriber.management_url), is_active: snapshot.is_active };
}

// Stripe advances a renewal period before its invoice-paid webhook arrives.
// Recheck the provider before treating a stale cached expiry as loss of seats.
// Caller must authorize team membership / invite ownership before invoking this.
export async function refreshExpiredStripeSubscription(admin: SecurityContext['admin'], teamId: string): Promise<boolean> {
  const { data: subscription, error } = await admin.from('account_subscriptions')
    .select('provider,store,is_unlimited,access_expires_at,entitlement_ids').eq('team_id', teamId).maybeSingle();
  if (error) throw new HttpError(503, 'Não foi possível conferir as vagas da equipe.');
  if (!subscription || subscription.is_unlimited || subscription.provider !== 'revenuecat' || subscription.store !== 'stripe' ||
    !subscription.entitlement_ids?.length || !subscription.access_expires_at || Date.parse(subscription.access_expires_at) > Date.now()) return false;
  const { data: customer, error: customerError } = await admin.from('revenuecat_customers').select('app_user_id').eq('team_id', teamId).maybeSingle();
  if (customerError || !customer) throw new HttpError(503, 'Não foi possível conferir a renovação.');
  await syncRevenueCat(admin, customer.app_user_id);
  return true;
}

export async function matchesWebhookAuthorization(actual: string | null, expected: string): Promise<boolean> {
  // Compare fixed-length digests so no prefix of the configured secret is leaked.
  if (!actual || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left); const b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}
