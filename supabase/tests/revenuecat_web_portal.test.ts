// Provider and database HTTP are intercepted; no real billing activity.
import { handleWebPortal } from '../functions/revenuecat-web-portal/handler.ts';
const owner = '10000000-0000-4000-8000-000000000001';
const team = '30000000-0000-4000-8000-000000000001';
const customer = '40000000-0000-4000-8000-000000000001';
const equal = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const oldProduct = { product_id: 'prod_old', plan: 'completo', entitlement_id: 'completo', member_limit: 20, billing_period: 'monthly', enabled: true };
function request(expand = true) {
  const enc = (v: unknown) => btoa(JSON.stringify(v)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
  const jwt = `${enc({ alg: 'HS256' })}.${enc({ sub: owner, exp: Math.floor(Date.now() / 1000) + 3600 })}.${enc('fixture')}`;
  return new Request('https://functions.test/revenuecat-web-portal', { method: 'POST', headers: { Authorization: `Bearer ${jwt}` }, body: JSON.stringify({ team_id: team,
    ...(expand ? { product_id: 'prod_new', expected_price_cents: 8990, currency: 'BRL' } : {}),
    // These forged fields must never influence customer binding or redirection.
    customer: 'cus_attacker', subscription: 'sub_attacker', app_user_id: 'forged', return_url: 'https://attacker.test',
  }) });
}
function harness() {
  const originalFetch = globalThis.fetch; const originalEnv = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries({ SUPABASE_URL: 'https://supabase.test', SUPABASE_ANON_KEY: 'anon-fixture', SUPABASE_SERVICE_ROLE_KEY: 'service-fixture', REVENUECAT_ENVIRONMENT: 'PRODUCTION', REVENUECAT_SECRET_API_KEY: 'rc-v1-fixture', REVENUECAT_V2_SECRET_API_KEY: 'rc-v2-fixture', REVENUECAT_PROJECT_ID: 'projfixture', STRIPE_SECRET_KEY: 'sk_live_fixture', STRIPE_PORTAL_CONFIGURATION_ID: 'bpc_general', BILLING_WEB_RETURN_URL: 'https://app.example.test/app/settings' })) {
    originalEnv.set(name, Deno.env.get(name)); Deno.env.set(name, value);
  }
  const mapping = { product_id: 'prod_old', stripe_product_id: 'prod_old', stripe_price_id: 'price_old', revenuecat_product_id: 'prodrcold', portal_configuration_id: 'bpc_expand', environment: 'PRODUCTION' };
  const state = { calls: [] as string[], sessions: [] as URLSearchParams[], wrongOwner: false, rateAllowed: true, failProvider: false, count: 20,
    current: { provider: 'revenuecat', store: 'stripe', product_id: 'prod_old', revenuecat_environment: 'PRODUCTION', is_unlimited: false },
    target: { ...oldProduct, product_id: 'prod_new', member_limit: 40 },
    price: { id: 'price_new', product: 'prod_new', active: true, livemode: true, currency: 'brl', unit_amount: 8990, recurring: { interval: 'month', interval_count: 1 } },
    item: { id: 'si_source', subscription: 'sub_source', quantity: 1, price: { id: 'price_old', product: 'prod_old', currency: 'brl', unit_amount: 6190 } },
    subscription: { id: 'sub_source', customer: 'cus_team', livemode: true, status: 'active', cancel_at_period_end: false, pending_update: null as unknown, schedule: null as string | null },
    rc: [{ product_id: 'prodrcold', store: 'stripe', environment: 'production', store_subscription_identifier: 'si_source', gives_access: true, current_period_ends_at: Date.now() + 86400000 }],
  };
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input)); state.calls.push(url.pathname);
    if (url.hostname === 'api.revenuecat.com') {
      if (state.failProvider) return json({}, 503);
      if (url.pathname.startsWith('/v2/')) {
        equal(url.pathname, `/v2/projects/projfixture/customers/${customer}/subscriptions`);
        equal(new Headers(init?.headers).get('Authorization'), 'Bearer rc-v2-fixture');
        return json({ items: state.rc, next_page: null });
      }
      equal(url.pathname, `/v1/subscribers/${customer}`);
      return json({ request_date_ms: Date.now(), subscriber: { entitlements: { completo: { product_identifier: 'prod_old', expires_date: '2099-01-01T00:00:00Z' } }, subscriptions: { prod_old: { is_sandbox: false, store: 'stripe', expires_date: '2099-01-01T00:00:00Z' } } } });
    }
    if (url.hostname === 'api.stripe.com') {
      equal(new Headers(init?.headers).get('Authorization'), 'Bearer sk_live_fixture');
      if (url.pathname === '/v1/subscription_items/si_source') return json(state.item);
      if (url.pathname === '/v1/subscriptions/sub_source') return json({ ...state.subscription, items: { data: [state.item] } });
      if (url.pathname === '/v1/prices/price_new') return json(state.price);
      if (url.pathname === '/v1/billing_portal/sessions') { state.sessions.push(new URLSearchParams(String(init?.body))); return json({ url: 'https://billing.stripe.com/p/session/test', livemode: true }); }
      throw new Error(`Unexpected Stripe operation: ${url.pathname}`);
    }
    if (url.hostname !== 'supabase.test') throw new Error(`Unexpected provider: ${url.hostname}`);
    if (url.pathname === '/auth/v1/user') return json({ id: owner, email: 'fixture@example.test' });
    if (url.pathname.endsWith('/profiles')) return json({ id: owner });
    if (url.pathname.endsWith('/teams')) return json({ owner_id: state.wrongOwner ? 'other-owner' : owner });
    if (url.pathname.endsWith('/revenuecat_customers')) return json({ app_user_id: customer });
    if (url.pathname.endsWith('/account_subscriptions')) return json(state.current);
    if (url.pathname.endsWith('/stripe_billing_products')) return json(url.searchParams.get('product_id') === 'eq.prod_old' ? mapping : { ...mapping, product_id: 'prod_new', stripe_product_id: 'prod_new', stripe_price_id: 'price_new', revenuecat_product_id: 'prodrcnew' });
    if (url.pathname.endsWith('/revenuecat_products')) return json(url.searchParams.has('product_id') ? url.searchParams.get('product_id') === 'eq.prod_old' ? oldProduct : state.target : [oldProduct, state.target]);
    if (url.pathname.endsWith('/team_members')) return new Response(null, { headers: { 'Content-Range': `0-${state.count - 1}/${state.count}` } });
    if (url.pathname.endsWith('/rpc/consume_edge_rate_limit')) return json(state.rateAllowed);
    if (url.pathname.endsWith('/rpc/revenuecat_customer_policy')) return json({ known: true, may_sync: true, environment: 'PRODUCTION', store: null, requires_test_reset: false });
    if (url.pathname.endsWith('/rpc/apply_revenuecat_snapshot')) return json(true);
    throw new Error(`Unhandled path: ${url.pathname}`);
  };
  return { state, cleanup() { globalThis.fetch = originalFetch; for (const [key, value] of originalEnv) { if (value === undefined) Deno.env.delete(key); else Deno.env.set(key, value); } } };
}

Deno.test('web expansion binds the owner/team to the existing Stripe item and asks for confirmation, never charges directly', async () => {
  const { state, cleanup } = harness(); try {
    const response = await handleWebPortal(request()); equal(response.status, 200);
    equal(await response.json(), { url: 'https://billing.stripe.com/p/session/test' }); equal(state.sessions.length, 1);
    const params = state.sessions[0];
    equal(params.get('customer'), 'cus_team'); equal(params.get('configuration'), 'bpc_expand');
    equal(params.get('flow_data[type]'), 'subscription_update_confirm');
    equal(params.get('flow_data[subscription_update_confirm][subscription]'), 'sub_source');
    equal(params.get('flow_data[subscription_update_confirm][items][0][id]'), 'si_source');
    equal(params.get('flow_data[subscription_update_confirm][items][0][price]'), 'price_new');
    equal(params.get('flow_data[subscription_update_confirm][items][0][quantity]'), '1');
    equal(new URL(params.get('return_url')!).hostname, 'app.example.test');
    equal(new URL(params.get('return_url')!).searchParams.get('billing_team'), team);
  } finally { cleanup(); }
});
Deno.test('web management uses the general portal without subscription updates', async () => {
  const { state, cleanup } = harness(); try {
    equal((await handleWebPortal(request(false))).status, 200);
    equal(state.sessions[0].get('configuration'), 'bpc_general'); equal(state.sessions[0].has('flow_data[type]'), false);
  } finally { cleanup(); }
});
for (const [label, modify, status] of [
  ['non-owner', (s: ReturnType<typeof harness>['state']) => { s.wrongOwner = true; }, 403],
  ['rate limit', s => { s.rateAllowed = false; }, 429],
  ['provider outage', s => { s.failProvider = true; }, 502],
  ['legacy unlimited', s => { s.current.is_unlimited = true; }, 409],
  ['Apple contract', s => { s.current.store = 'app_store'; }, 409],
  ['wrong environment', s => { s.subscription.livemode = false; }, 409],
  ['changed source product', s => { s.item.price.product = 'prod_other'; }, 409],
  ['team outgrew target', s => { s.count = 41; }, 409],
  ['different plan', s => { s.target.plan = 'asafe'; }, 409],
  ['different period', s => { s.target.billing_period = 'annual'; }, 409],
  ['smaller capacity', s => { s.target.member_limit = 10; }, 409],
  ['changed price', s => { s.price.unit_amount = 9990; }, 409],
  ['different currency', s => { s.price.currency = 'usd'; }, 409],
  ['wrong Stripe product', s => { s.price.product = 'prod_other'; }, 409],
  ['pending payment', s => { s.subscription.pending_update = {}; }, 409],
  ['cancelled renewal', s => { s.subscription.cancel_at_period_end = true; }, 409],
  ['duplicate subscriptions', s => { s.rc.push({ ...s.rc[0] }); }, 409],
] as [string, (s: ReturnType<typeof harness>['state']) => void, number][]) {
  Deno.test(`web expansion refuses ${label} before creating a portal session`, async () => {
    const { state, cleanup } = harness(); try { modify(state); equal((await handleWebPortal(request())).status, status); equal(state.sessions.length, 0); } finally { cleanup(); }
  });
}
Deno.test('unauthenticated web portal request is rejected before any data access', async () => {
  const { state, cleanup } = harness(); try { equal((await handleWebPortal(new Request('https://functions.test', { method: 'POST', body: '{}' }))).status, 401); equal(state.calls, []); } finally { cleanup(); }
});
