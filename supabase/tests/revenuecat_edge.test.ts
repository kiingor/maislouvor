// deno test --allow-env --allow-net=esm.sh supabase/tests/revenuecat_edge.test.ts
// All HTTP during requests is intercepted; no external billing or database writes.
import { handleRevenueCatWebhook } from '../functions/revenuecat-webhook/handler.ts';
import { handleRevenueCatSync } from '../functions/revenuecat-sync/handler.ts';

const customer = '40000000-0000-4000-8000-000000000001';
const destination = '40000000-0000-4000-8000-000000000002';
const owner = '10000000-0000-4000-8000-000000000001';
const team = '30000000-0000-4000-8000-000000000001';
const equal = (actual: unknown, expected: unknown) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const product = { product_id: 'completo_20', entitlement_id: 'completo', plan: 'completo', member_limit: 20, billing_period: 'monthly', enabled: true };

function harness() {
  const originalFetch = globalThis.fetch;
  const originalEnv = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({ SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture',
    REVENUECAT_SECRET_API_KEY: 'sk_fixture', REVENUECAT_ENVIRONMENT: 'PRODUCTION', REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer webhook-fixture' })) {
    originalEnv.set(key, Deno.env.get(key)); Deno.env.set(key, value);
  }
  const state = { receipts: new Set<string>(), synced: [] as string[], calls: [] as string[], failRevenueCat: false, wrongOwner: false, unknownCustomer: false,
    sandboxCustomers: new Set<string>(), sandboxProvider: new Set<string>(), providerStores: new Map<string, string>(), snapshots: [] as Record<string, unknown>[],
    memberRole: 'admin', subscription: { provider: 'revenuecat', store: 'stripe', is_unlimited: false, access_expires_at: '2000-01-01T00:00:00Z', entitlement_ids: ['completo'] } };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    state.calls.push(url.pathname);
    if (url.hostname === 'api.revenuecat.com') {
      equal(new Headers(init?.headers).get('Authorization'), 'Bearer sk_fixture');
      if (state.failRevenueCat) return json({ error: 'temporary' }, 503);
      return json({ request_date_ms: Date.now(), subscriber: { entitlements: { completo: { product_identifier: product.product_id, expires_date: '2099-01-01T00:00:00Z' } },
        subscriptions: { [product.product_id]: { is_sandbox: state.sandboxProvider.has(url.pathname.split('/').pop()!), store: state.providerStores.get(url.pathname.split('/').pop()!) ?? 'app_store', expires_date: '2099-01-01T00:00:00Z' } }, management_url: 'https://apps.apple.com/account/subscriptions' } });
    }
    if (url.hostname !== 'supabase.test') throw new Error(`Unexpected request to ${url.hostname}`);
    if (url.pathname === '/auth/v1/user') return json({ id: owner, email: 'fixture@example.test' });
    if (url.pathname.endsWith('/profiles')) return json({ id: owner });
    if (url.pathname.endsWith('/teams')) return json({ owner_id: state.wrongOwner ? destination : owner });
    if (url.pathname.endsWith('/team_members')) return json({ role: state.memberRole });
    if (url.pathname.endsWith('/account_subscriptions')) return json(state.subscription);
    if (url.pathname.endsWith('/rpc/consume_edge_rate_limit')) return json(true);
    if (url.pathname.endsWith('/revenuecat_webhook_events')) {
      if (init?.method === 'POST') { state.receipts.add(body.event_id); return json(null); }
      const eventId = url.searchParams.get('event_id')?.replace(/^eq\./, '');
      return json(eventId && state.receipts.has(eventId) ? { event_id: eventId } : null);
    }
    if (url.pathname.endsWith('/revenuecat_customers')) {
      if (url.searchParams.has('team_id')) return json({ app_user_id: customer });
      if (state.unknownCustomer) return json([]);
      return json((url.searchParams.get('app_user_id')?.includes(destination) ? [customer, destination] : [customer]).map((id) => ({ app_user_id: id })));
    }
    if (url.pathname.endsWith('/revenuecat_products')) return json([product]);
    if (url.pathname.endsWith('/rpc/revenuecat_customer_policy')) return json({ known: !state.unknownCustomer, may_sync: !state.unknownCustomer, environment: state.sandboxCustomers.has(body.p_app_user_id) ? 'SANDBOX' : 'PRODUCTION', store: state.sandboxCustomers.has(body.p_app_user_id) ? 'app_store' : null, requires_test_reset: false });
    if (url.pathname.endsWith('/rpc/apply_revenuecat_snapshot')) { state.synced.push(body.p_app_user_id); state.snapshots.push(body.p_snapshot); return json(true); }
    throw new Error(`Unhandled path ${url.pathname}`);
  };
  return { state, cleanup() { globalThis.fetch = originalFetch; for (const [key, value] of originalEnv) { if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); } } };
}
function webhook(event: Record<string, unknown> = {}, authorization = 'Bearer webhook-fixture') {
  return new Request('https://functions.test/revenuecat-webhook', { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: { id: 'evt-1', type: 'RENEWAL', environment: 'PRODUCTION', app_user_id: customer, ...event } }) });
}
function syncRequest(capacityOnly = false) {
  // HS256 uses Supabase Auth getUser to validate the token; intercepted above.
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })}.${encode('fixture')}`;
  return new Request('https://functions.test/revenuecat-sync', { method: 'POST', headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ team_id: team, app_user_id: destination, is_active: true, plan: 'forged', ...(capacityOnly ? { capacity_only: true } : {}) }) });
}

Deno.test('webhook rejects missing/wrong authorization before any data access', async () => {
  const { state, cleanup } = harness();
  try { equal((await handleRevenueCatWebhook(webhook({}, 'Bearer wrong'))).status, 401); equal(state.calls, []); } finally { cleanup(); }
});
Deno.test('test and other-environment events never grant paid access', async () => {
  const { state, cleanup } = harness();
  try {
    equal((await handleRevenueCatWebhook(webhook({ type: 'TEST' }))).status, 200); equal(state.calls, []);
    equal((await handleRevenueCatWebhook(webhook({ environment: 'SANDBOX' }))).status, 200);
    equal(state.synced, []); equal(state.calls.some(path => path.startsWith('/v1/subscribers/')), false);
  } finally { cleanup(); }
});
Deno.test('replay is acknowledged once; signed notification fetches live subscriber', async () => {
  const { state, cleanup } = harness();
  try {
    equal((await handleRevenueCatWebhook(webhook())).status, 200);
    const replay = await handleRevenueCatWebhook(webhook());
    equal(await replay.json(), { received: true, duplicate: true });
    equal(state.synced, [customer]);
  } finally { cleanup(); }
});
Deno.test('temporary provider failure does not record success and is retryable', async () => {
  const { state, cleanup } = harness();
  try {
    state.failRevenueCat = true;
    equal((await handleRevenueCatWebhook(webhook())).status, 502);
    equal(state.receipts.size, 0); equal(state.synced, []);
    state.failRevenueCat = false;
    equal((await handleRevenueCatWebhook(webhook())).status, 200);
    equal(state.receipts.size, 1); equal(state.synced, [customer]);
  } finally { cleanup(); }
});
Deno.test('transfer reconciles both registered identities; unknown customers are ignored', async () => {
  const { state, cleanup } = harness();
  try {
    equal((await handleRevenueCatWebhook(webhook({ type: 'TRANSFER', app_user_id: undefined, environment: undefined, transferred_from: [customer], transferred_to: [destination] }))).status, 200);
    equal(state.synced, [customer, destination]);
    state.unknownCustomer = true;
    equal((await handleRevenueCatWebhook(webhook({ id: 'evt-2' }))).status, 200);
    equal(state.synced, [customer, destination]);
  } finally { cleanup(); }
});
Deno.test('sync authenticates the owner and ignores client-supplied purchase data', async () => {
  const { state, cleanup } = harness();
  try {
    const response = await handleRevenueCatSync(syncRequest());
    equal(response.status, 200); equal(state.synced, [customer]);
    equal((await response.json()).is_active, true);
  } finally { cleanup(); }
});
Deno.test('sync rejects non-owners and unauthenticated calls', async () => {
  const { state, cleanup } = harness();
  try {
    state.wrongOwner = true;
    equal((await handleRevenueCatSync(syncRequest())).status, 403);
    equal((await handleRevenueCatSync(new Request('https://functions.test/sync', { method: 'POST', body: '{}' }))).status, 401);
    equal(state.synced, []);
  } finally { cleanup(); }
});

Deno.test('a leader may refresh expired Stripe seats without receiving a management URL', async () => {
  const { state, cleanup } = harness(); try {
    state.wrongOwner = true;
    const response = await handleRevenueCatSync(syncRequest(true));
    equal(response.status, 200); equal(await response.json(), { refreshed: true }); equal(state.synced, [customer]);
  } finally { cleanup(); }
});
Deno.test('capacity-only cannot be used by a viewer or to obtain full billing access', async () => {
  const { state, cleanup } = harness(); try {
    state.wrongOwner = true; state.memberRole = 'viewer';
    equal((await handleRevenueCatSync(syncRequest(true))).status, 403);
    equal(state.synced, []);
  } finally { cleanup(); }
});
for (const kind of ['legacy', 'free', 'apple', 'current', 'expired']) {
  Deno.test(`capacity refresh leaves ${kind} accounts unchanged`, async () => {
    const { state, cleanup } = harness(); try {
      if (kind === 'legacy') state.subscription.is_unlimited = true;
      if (kind === 'free') state.subscription.provider = 'manual';
      if (kind === 'apple') state.subscription.store = 'app_store';
      if (kind === 'current') state.subscription.access_expires_at = '2099-01-01T00:00:00Z';
      if (kind === 'expired') state.subscription.entitlement_ids = [];
      const response = await handleRevenueCatSync(syncRequest(true));
      equal(await response.json(), { refreshed: false }); equal(state.synced, []);
    } finally { cleanup(); }
  });
}
Deno.test('renewal provider outage returns retryable error instead of treating paid team as free', async () => {
  const { state, cleanup } = harness(); try {
    state.failRevenueCat = true;
    equal((await handleRevenueCatSync(syncRequest(true))).status, 502); equal(state.synced, []);
  } finally { cleanup(); }
});

Deno.test('authorized Apple sandbox webhook projects the customer exception, not global production', async () => {
  const { state, cleanup } = harness(); try {
    state.sandboxCustomers.add(customer); state.sandboxProvider.add(customer);
    equal((await handleRevenueCatWebhook(webhook({ environment: 'SANDBOX', store: 'APP_STORE' }))).status, 200);
    equal(state.synced, [customer]); equal(state.snapshots[0].environment, 'SANDBOX');
    equal(state.snapshots[0].is_active, true); equal(state.snapshots[0].store, 'app_store');
  } finally { cleanup(); }
});
Deno.test('Stripe sandbox events cannot use the Apple exception', async () => {
  const { state, cleanup } = harness(); try {
    state.sandboxCustomers.add(customer); state.sandboxProvider.add(customer); state.providerStores.set(customer, 'stripe');
    equal((await handleRevenueCatWebhook(webhook({ environment: 'SANDBOX', store: 'STRIPE' }))).status, 200);
    equal(state.synced, []); equal(state.receipts.size, 0);
    equal((await handleRevenueCatSync(syncRequest())).status, 200);
    equal(state.snapshots[0].is_active, false); equal(state.snapshots[0].store, 'app_store');
  } finally { cleanup(); }
});
Deno.test('transfer reconciles each side in its own environment without moving authorization', async () => {
  const { state, cleanup } = harness(); try {
    state.sandboxCustomers.add(customer); state.sandboxProvider.add(customer);
    equal((await handleRevenueCatWebhook(webhook({ type: 'TRANSFER', environment: 'SANDBOX', app_user_id: undefined, transferred_from: [customer], transferred_to: [destination] }))).status, 200);
    equal(state.synced, [customer, destination]);
    equal(state.snapshots.map(snapshot => snapshot.environment), ['SANDBOX', 'PRODUCTION']);
    equal(state.sandboxCustomers.has(destination), false);
  } finally { cleanup(); }
});
Deno.test('real provider purchase is not replaced by an authorized test', async () => {
  const { state, cleanup } = harness(); try {
    state.sandboxCustomers.add(customer); // provider still reports a real purchase
    equal((await handleRevenueCatSync(syncRequest())).status, 500);
    equal(state.synced, []);
  } finally { cleanup(); }
});
