import { readFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { webCatalog, portalParams, catalogSql } from './setup-web-billing.mjs';
const source = JSON.parse(await readFile(new URL('../docs/billing/revenuecat-catalog.json', import.meta.url)));
test('web retains all 70 approved fixed prices, including annual products unavailable on Apple', () => {
  const rows = webCatalog(source); assert.equal(rows.length, 70); assert.equal(rows.filter(p => !p.ios_enabled).length, 4);
  assert.throws(() => webCatalog({ ...source, products: source.products.map((p, i) => i === 1 ? { ...p, price_cents: 1 } : p) }), /Anual/);
});
test('portal capacity groups fit Stripe limits and update price instead of seat quantity', () => {
  const rows = webCatalog(source);
  for (const group of new Set(rows.map(p => `${p.plan}_${p.billing_period}`))) {
    const products = rows.filter(p => `${p.plan}_${p.billing_period}` === group).map(p => ({ ...p, stripe_product_id: `prod_${p.sku}`, stripe_price_id: `price_${p.sku}` }));
    const params = portalParams('https://app.example.test/app/settings', products);
    assert.equal(params.get('features[subscription_update][default_allowed_updates][0]'), 'price');
    assert.equal(params.get('features[subscription_update][proration_behavior]'), 'always_invoice');
    assert.equal(params.get('features[subscription_update][billing_cycle_anchor]'), 'unchanged');
  }
  assert.equal(portalParams('https://app.example.test').get('features[subscription_update][enabled]'), 'false');
});
test('catalog seed uses the actual RevenueCat identifier for price-based Stripe projects', () => {
  const seed = catalogSql([{ ...source.products[0], rc_store_identifier: 'price_from_rc', stripe_product_id: 'prod_from_stripe', stripe_price_id: 'price_from_rc', rc_product_id: 'prodrc1', portal_configuration_id: 'bpc1' }], 'SANDBOX');
  assert.match(seed, /'price_from_rc', 'essencial'/); assert.match(seed, /stripe_billing_products/);
  assert.doesNotMatch(seed, /UPDATE public.account_subscriptions|DELETE|TRUNCATE/);
});
