import { describe, expect, it } from 'vitest';
import { eventCustomerIds, projectSubscriber, safeManagementUrl, type BillingProduct, type SubscriberResponse } from '../../../supabase/functions/_shared/revenuecat-model';
import { canStartSubscription, type BillingContext } from './types';

const now = Date.parse('2026-10-06T12:00:00Z');
const future = '2026-11-06T12:00:00Z';
const past = '2026-10-05T12:00:00Z';
const product: BillingProduct = { product_id: 'completo_20_monthly', entitlement_id: 'completo', plan: 'completo', member_limit: 20, billing_period: 'monthly', enabled: true };
function fixture(): SubscriberResponse {
  return { request_date_ms: now, subscriber: {
    entitlements: { completo: { product_identifier: product.product_id, expires_date: future } },
    subscriptions: { [product.product_id]: { is_sandbox: false, store: 'app_store', expires_date: future, period_type: 'normal' } },
  } };
}
const project = (data: SubscriberResponse, products = [product]) => projectSubscriber(data, products, 'PRODUCTION');

describe('RevenueCat server projection', () => {
  it('grants the mapped plan and seat limit only from a verified subscriber', () => {
    expect(project(fixture())).toMatchObject({ product_id: product.product_id, is_active: true, status: 'active', will_renew: true, entitlement_ids: ['completo'], environment: 'PRODUCTION' });
  });
  it('preserves access until expiration when renewal is cancelled', () => {
    const data = fixture(); data.subscriber.subscriptions[product.product_id].unsubscribe_detected_at = past;
    expect(project(data)).toMatchObject({ is_active: true, status: 'active', will_renew: false, access_expires_at: future.replace('Z', '.000Z') });
  });
  it('preserves paid access during a billing issue and grace period', () => {
    const data = fixture();
    data.subscriber.entitlements.completo.expires_date = past;
    Object.assign(data.subscriber.subscriptions[product.product_id], { expires_date: past, billing_issues_detected_at: past, grace_period_expires_date: future });
    expect(project(data)).toMatchObject({ is_active: true, status: 'past_due', will_renew: false });
  });
  it('expires after the grace period', () => {
    const data = fixture();
    data.subscriber.entitlements.completo.expires_date = past;
    Object.assign(data.subscriber.subscriptions[product.product_id], { expires_date: past, grace_period_expires_date: past });
    expect(project(data)).toMatchObject({ is_active: false, status: 'expired', entitlement_ids: [], access_expires_at: null });
  });
  it('revokes refunded purchases even if the old date is in the future', () => {
    const data = fixture(); data.subscriber.subscriptions[product.product_id].refunded_at = past;
    expect(project(data).is_active).toBe(false);
  });
  it('recognizes trials', () => {
    const data = fixture(); data.subscriber.subscriptions[product.product_id].period_type = 'trial';
    expect(project(data).status).toBe('trialing');
  });
  it('never grants sandbox purchases in production, or production in sandbox', () => {
    const data = fixture();
    expect(projectSubscriber(data, [product], 'SANDBOX').is_active).toBe(false);
    data.subscriber.subscriptions[product.product_id].is_sandbox = true;
    expect(project(data).is_active).toBe(false);
    expect(projectSubscriber(data, [product], 'SANDBOX').is_active).toBe(true);
  });
  it('accepts existing subscribers to a product removed from sale', () => {
    expect(project(fixture(), [{ ...product, enabled: false }]).is_active).toBe(true);
  });
  it('fails without revoking a live entitlement when catalog mapping is missing', () => {
    expect(() => project(fixture(), [])).toThrow('missing from the billing catalog');
  });
  it('rejects malformed dates and responses instead of downgrading the team', () => {
    const data = fixture(); data.subscriber.entitlements.completo.expires_date = 'invalid';
    expect(() => project(data)).toThrow('date');
    expect(() => project({ request_date_ms: now } as SubscriberResponse)).toThrow('response');
  });
  it('does not grant indefinite access to null expiration or non-subscription purchases', () => {
    const data = fixture(); data.subscriber.entitlements.completo.expires_date = null;
    expect(project(data).is_active).toBe(false);
    delete data.subscriber.subscriptions[product.product_id];
    expect(project(data).is_active).toBe(false);
  });
  it('prefers a live entitlement over an expired higher plan', () => {
    const data = fixture(); data.subscriber.entitlements.completo.expires_date = past;
    const basic: BillingProduct = { ...product, product_id: 'essencial_10', entitlement_id: 'essencial', plan: 'essencial', member_limit: 10 };
    data.subscriber.entitlements.essencial = { product_identifier: basic.product_id, expires_date: future };
    data.subscriber.subscriptions[basic.product_id] = { is_sandbox: false, store: 'rc_billing', expires_date: future };
    expect(project(data, [product, basic])).toMatchObject({ product_id: basic.product_id, is_active: true, entitlement_ids: ['essencial'] });
  });
  it('accepts an empty valid response after expiration or transfer', () => {
    expect(project({ request_date_ms: now, subscriber: { subscriptions: {}, entitlements: {} } })).toMatchObject({ is_active: false, entitlement_ids: [] });
  });
});

describe('webhook identities and management URLs', () => {
  const from = '10000000-0000-4000-8000-000000000001';
  const to = '10000000-0000-4000-8000-000000000002';
  it('reconciles both sides of transfers, deduplicates aliases, ignores anonymous IDs', () => {
    expect(eventCustomerIds({ id: 'event', type: 'TRANSFER', app_user_id: from, aliases: [from, '$RCAnonymousID:123'], transferred_from: [from], transferred_to: [to] })).toEqual([from, to]);
  });
  it('rejects unsafe protocols, credentials and malformed URLs', () => {
    for (const value of ['javascript:alert(1)', 'http://example.test', 'https://user:pass@example.test', '//example.test', null]) expect(safeManagementUrl(value)).toBeNull();
    expect(safeManagementUrl('https://apps.apple.com/account/subscriptions')).toBe('https://apps.apple.com/account/subscriptions');
  });
});

it('prevents checkout for members, live subscriptions and existing manual/other contracts', () => {
  const base = { can_manage: true, subscription: { provider: 'manual', plan: 'free', is_active: false } } as BillingContext;
  expect(canStartSubscription(base)).toBe(true);
  expect(canStartSubscription({ ...base, can_manage: false })).toBe(false);
  expect(canStartSubscription({ ...base, subscription: { ...base.subscription, plan: 'pro' } })).toBe(false);
  expect(canStartSubscription({ ...base, subscription: { ...base.subscription, provider: 'stripe' } })).toBe(false);
  expect(canStartSubscription({ ...base, subscription: { ...base.subscription, provider: 'revenuecat', is_active: true } })).toBe(false);
  expect(canStartSubscription({ ...base, subscription: { ...base.subscription, provider: 'revenuecat', is_active: false } })).toBe(true);
});
