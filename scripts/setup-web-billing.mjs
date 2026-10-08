// Defaults to a local preview. --apply provisions catalog only, never customers or charges.
// Credentials come from the process environment, never command-line arguments.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const catalogUrl = new URL('../docs/billing/revenuecat-catalog.json', import.meta.url);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const env = name => { const value = process.env[name]?.trim(); assert(value, `${name} não configurado`); return value; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sql = value => `'${String(value).replaceAll("'", "''")}'`;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

export function webCatalog(source) {
  assert(source.currency === 'BRL' && source.products.length === 70, 'Catálogo aprovado inválido');
  const products = source.products.map(p => ({ ...p, sku: `maislouvor_v1_${p.package_id}` }));
  for (const p of products) {
    assert(/^(essencial|estudio|asafe|completo)$/.test(p.plan) && ['monthly', 'annual'].includes(p.billing_period), 'Plano/período inválido');
    assert(Number.isSafeInteger(p.price_cents) && p.price_cents > 0 && p.currency === 'BRL', 'Preço inválido');
    assert(Number.isSafeInteger(p.member_limit) && p.member_limit >= 5 && !(p.plan === 'essencial' && p.member_limit === 5), 'Faixa inválida');
    if (p.billing_period === 'annual') assert(p.price_cents === products.find(m => m.plan === p.plan && m.member_limit === p.member_limit && m.billing_period === 'monthly')?.price_cents * 10, 'Anual deve valer dez mensalidades');
  }
  assert(new Set(products.map(p => p.sku)).size === products.length, 'SKU duplicado');
  return products;
}

export function portalParams(returnUrl, products = []) {
  const params = new URLSearchParams({
    default_return_url: returnUrl,
    'business_profile[headline]': 'Gerencie a assinatura da sua equipe +Louvor',
    'features[payment_method_update][enabled]': 'true',
    'features[invoice_history][enabled]': 'true',
    'features[subscription_cancel][enabled]': 'true',
    'features[subscription_cancel][mode]': 'at_period_end',
    'features[subscription_update][enabled]': String(products.length > 0),
  });
  if (products.length) {
    assert(products.length <= 10, 'Portal aceita até dez produtos por configuração');
    params.set('features[subscription_update][default_allowed_updates][0]', 'price');
    params.set('features[subscription_update][proration_behavior]', 'always_invoice');
    params.set('features[subscription_update][billing_cycle_anchor]', 'unchanged');
    products.forEach((p, i) => {
      params.set(`features[subscription_update][products][${i}][product]`, p.stripe_product_id);
      params.set(`features[subscription_update][products][${i}][prices][0]`, p.stripe_price_id);
    });
  }
  return params;
}

export function catalogSql(products, environment) {
  assert(['SANDBOX', 'PRODUCTION'].includes(environment), 'Ambiente inválido');
  const values = products.map(p => `(${[p.rc_store_identifier, p.entitlement_id, p.plan, p.member_limit, p.billing_period].map(sql).join(', ')}, true)`).join(',\n');
  const mapping = products.map(p => `(${[p.rc_store_identifier, p.stripe_product_id, p.stripe_price_id, p.rc_product_id, p.portal_configuration_id, environment].map(sql).join(', ')})`).join(',\n');
  return `-- Generated from API read-back. Apply only to the ${environment} backend.\nBEGIN;\nINSERT INTO public.revenuecat_products (product_id, entitlement_id, plan, member_limit, billing_period, enabled) VALUES\n${values}\nON CONFLICT (product_id) DO UPDATE SET entitlement_id=EXCLUDED.entitlement_id, plan=EXCLUDED.plan, member_limit=EXCLUDED.member_limit, billing_period=EXCLUDED.billing_period, enabled=EXCLUDED.enabled;\nINSERT INTO public.stripe_billing_products (product_id, stripe_product_id, stripe_price_id, revenuecat_product_id, portal_configuration_id, environment) VALUES\n${mapping}\nON CONFLICT (product_id) DO UPDATE SET stripe_product_id=EXCLUDED.stripe_product_id, stripe_price_id=EXCLUDED.stripe_price_id, revenuecat_product_id=EXCLUDED.revenuecat_product_id, portal_configuration_id=EXCLUDED.portal_configuration_id, environment=EXCLUDED.environment;\nCOMMIT;\n`;
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.every(a => ['--apply', '--production'].includes(a)), 'Use --apply [--production] ou nenhum argumento para prévia');
  const products = webCatalog(JSON.parse(await readFile(catalogUrl, 'utf8')));
  const environment = args.includes('--production') ? 'PRODUCTION' : 'SANDBOX';
  if (!args.includes('--apply')) {
    console.log(JSON.stringify({ mode: 'preview', environment, products: products.length, plans: [...new Set(products.map(p => p.plan))], min_brl: Math.min(...products.map(p => p.price_cents)) / 100, max_brl: Math.max(...products.map(p => p.price_cents)) / 100, annual_products: products.filter(p => p.billing_period === 'annual').length, note: 'Nenhuma requisição externa, cobrança ou alteração de banco.' }, null, 2));
    return;
  }
  const stripeKey = env('STRIPE_SECRET_KEY');
  assert(new RegExp(`^(sk|rk)_${environment === 'PRODUCTION' ? 'live' : 'test'}_`).test(stripeKey), 'Chave Stripe de outro ambiente');
  const rcKey = env('REVENUECAT_CATALOG_API_KEY');
  const project = env('REVENUECAT_PROJECT_ID'); const app = env('REVENUECAT_WEB_APP_ID');
  const accountId = env('STRIPE_ACCOUNT_ID');
  const returnUrl = new URL(env('BILLING_WEB_RETURN_URL'));
  assert(returnUrl.protocol === 'https:' && !returnUrl.username && !returnUrl.password, 'Retorno deve usar HTTPS');
  const output = resolve('tmp/billing-web-setup.local', environment.toLowerCase());
  await mkdir(output, { recursive: true });
  let lastRc = 0;
  async function request(provider, path, body, key) {
    const isRc = provider === 'rc';
    if (isRc) { await sleep(Math.max(0, 1100 - (Date.now() - lastRc))); lastRc = Date.now(); }
    const origin = isRc ? 'https://api.revenuecat.com' : 'https://api.stripe.com';
    const base = isRc ? `/v2/projects/${encodeURIComponent(project)}` : '/v1';
    const url = new URL(path.startsWith('/v2/') ? path : `${base}${path}`, origin);
    assert(url.origin === origin && (!isRc || url.pathname.startsWith(`${base}/`)), 'URL de catálogo inválida');
    const headers = { Authorization: `Bearer ${isRc ? rcKey : stripeKey}`, ...(body ? { 'Content-Type': isRc ? 'application/json' : 'application/x-www-form-urlencoded' } : {}) };
    if (!isRc && body) headers['Idempotency-Key'] = `ml-web-v1-${key}-${hash(String(body))}`;
    const res = await fetch(url, { method: body ? 'POST' : 'GET', headers, body: body ? isRc ? JSON.stringify(body) : body : undefined, signal: AbortSignal.timeout(20000) });
    assert(res.ok, `${provider} ${path.split('?')[0]}: HTTP ${res.status}. Reexecute para retomar; nenhuma assinatura foi criada.`);
    return res.json();
  }
  const stripe = (path, body, key = path) => request('stripe', path, body, key);
  const rc = (path, body) => request('rc', path, body);
  async function list(provider, path) {
    const all = []; let url = `${path}${path.includes('?') ? '&' : '?'}limit=100`;
    while (url) {
      const result = await request(provider, url);
      const rows = provider === 'rc' ? result.items : result.data;
      assert(Array.isArray(rows), 'Resposta de catálogo inválida'); all.push(...rows);
      url = provider === 'rc' ? result.next_page : result.has_more ? `${path}?limit=100&starting_after=${encodeURIComponent(rows.at(-1).id)}` : null;
    }
    return all;
  }
  const [account, rcApp] = await Promise.all([stripe('/account'), rc(`/apps/${encodeURIComponent(app)}`)]);
  assert(account.id === accountId, 'A chave pertence a outra conta Stripe');
  assert(rcApp.type === 'stripe', 'O app RevenueCat deve ser uma configuração Stripe Billing');
  assert(rcApp.stripe?.stripe_account_id === accountId, 'O app RevenueCat está conectado a outra conta Stripe; use uma configuração dedicada para o sandbox');
  const existingProducts = await list('stripe', '/products');
  for (const p of products) {
    let product = existingProducts.find(x => x.metadata?.maislouvor_sku === p.sku);
    if (!product) product = await stripe('/products', new URLSearchParams({ name: `+Louvor ${p.display_name}`, description: `Plano ${p.display_name} para até ${p.member_limit} integrantes, incluindo o líder.`, 'metadata[maislouvor_sku]': p.sku }), p.sku);
    assert(product.active && product.livemode === (environment === 'PRODUCTION'), `Produto inativo ou em outro ambiente: ${p.sku}`);
    const prices = await stripe(`/prices?lookup_keys[]=${encodeURIComponent(p.sku)}&limit=10`);
    let price = prices.data[0];
    if (!price) price = await stripe('/prices', new URLSearchParams({ product: product.id, currency: 'brl', unit_amount: String(p.price_cents), 'recurring[interval]': p.billing_period === 'annual' ? 'year' : 'month', lookup_key: p.sku, tax_behavior: 'inclusive' }), p.sku);
    assert(price.product === product.id && price.active && price.livemode === (environment === 'PRODUCTION') && price.currency === 'brl' && price.unit_amount === p.price_cents && price.recurring?.interval === (p.billing_period === 'annual' ? 'year' : 'month') && price.recurring?.interval_count === 1, `Preço divergente: ${p.sku}. Não será alterado automaticamente.`);
    p.stripe_product_id = product.id; p.stripe_price_id = price.id;
  }
  const configs = await list('stripe', '/billing_portal/configurations');
  async function configure(role, rows) {
    const params = portalParams(returnUrl.href, rows); params.set('metadata[maislouvor_role]', role);
    const existing = configs.find(c => c.metadata?.maislouvor_role === role && c.active);
    return stripe(`/billing_portal/configurations${existing ? `/${existing.id}` : ''}`, params, role);
  }
  const general = await configure('general_v1', []);
  for (const group of [...new Set(products.map(p => `${p.plan}_${p.billing_period}`))]) {
    const rows = products.filter(p => `${p.plan}_${p.billing_period}` === group);
    const config = await configure(`capacity_v1_${group}`, rows);
    rows.forEach(p => { p.portal_configuration_id = config.id; });
  }
  let rcProducts = await list('rc', `/products?app_id=${encodeURIComponent(app)}`);
  const entitlements = await list('rc', '/entitlements');
  for (const p of products) {
    let rcProduct = rcProducts.find(x => [p.stripe_product_id, p.stripe_price_id].includes(x.store_identifier));
    if (!rcProduct) {
      rcProduct = await rc('/products', { app_id: app, store_identifier: p.stripe_product_id, price_identifier: p.stripe_price_id, type: 'subscription', display_name: p.display_name });
      rcProducts.push(rcProduct);
    }
    assert(rcProduct.app_id === app && [p.stripe_product_id, p.stripe_price_id].includes(rcProduct.store_identifier), `Importação divergente: ${p.sku}`);
    p.rc_product_id = rcProduct.id; p.rc_store_identifier = rcProduct.store_identifier;
    const entitlement = entitlements.find(e => e.lookup_key === p.entitlement_id);
    assert(entitlement, `Entitlement ausente: ${p.entitlement_id}`);
  }
  for (const entitlement of entitlements.filter(e => products.some(p => p.entitlement_id === e.lookup_key))) {
    const attached = await list('rc', `/entitlements/${entitlement.id}/products`);
    const missing = products.filter(p => p.entitlement_id === entitlement.lookup_key && !attached.some(a => a.id === p.rc_product_id));
    if (missing.length) await rc(`/entitlements/${entitlement.id}/actions/attach_products`, { product_ids: missing.map(p => p.rc_product_id) });
  }
  const offerings = await list('rc', '/offerings');
  const offering = offerings.find(o => o.lookup_key === 'web') ?? await rc('/offerings', { lookup_key: 'web', display_name: '+Louvor Web' });
  const packages = await list('rc', `/offerings/${offering.id}/packages`);
  for (const [index, p] of products.entries()) {
    const pkg = packages.find(x => x.lookup_key === p.package_id) ?? await rc(`/offerings/${offering.id}/packages`, { lookup_key: p.package_id, display_name: p.display_name, position: index + 1 });
    const attached = await list('rc', `/packages/${pkg.id}/products`);
    assert(attached.every(a => a.product?.app_id !== app || a.product?.id === p.rc_product_id), `Package já aponta para outro produto: ${p.package_id}`);
    if (!attached.some(a => (a.product?.id ?? a.id) === p.rc_product_id)) await rc(`/packages/${pkg.id}/actions/attach_products`, { products: [{ product_id: p.rc_product_id, eligibility_criteria: 'all' }] });
  }
  // Final read-back and SQL use provider IDs, including price-based RC projects.
  rcProducts = await list('rc', `/products?app_id=${encodeURIComponent(app)}`);
  assert(products.every(p => rcProducts.some(r => r.id === p.rc_product_id && r.store_identifier === p.rc_store_identifier)), 'Catálogo final divergente');
  await writeFile(resolve(output, 'catalog.json'), JSON.stringify({ environment, stripe_account_id: accountId, revenuecat_project_id: project, revenuecat_app_id: app, offering: 'web', portal_configuration_id: general.id, products }, null, 2));
  await writeFile(resolve(output, 'catalog.sql'), catalogSql(products, environment));
  console.log(`Catálogo configurado: ${products.length} produtos. Artefatos em ${output}.\nSTRIPE_PORTAL_CONFIGURATION_ID=${general.id}\nBanco e publicação permanecem separados; nenhuma cobrança foi efetuada.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
