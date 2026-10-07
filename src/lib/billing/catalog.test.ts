import { describe, expect, it } from 'vitest';
import { annualSaving } from './catalog';
import type { BillingOffer } from './types';
const monthly: BillingOffer = { key: 'monthly', title: 'Completo', price: 'R$ 61,90', priceAmount: 61.9, currency: 'BRL', product: {
  product_id: 'monthly', entitlement_id: 'completo', plan: 'completo', member_limit: 20, billing_period: 'monthly', enabled: true,
} };
const annual: BillingOffer = { ...monthly, key: 'annual', price: 'R$ 619,00', priceAmount: 619, product: { ...monthly.product, product_id: 'annual', billing_period: 'annual' } };
describe('Savings displayed on the paywall', () => {
  it('calculates savings from the two store prices, without substituting checkout prices', () => {
    expect(annualSaving(monthly, annual)).toEqual({ formatted: expect.stringMatching(/123,80/), twoMonths: true });
    expect(annualSaving(monthly, { ...annual, priceAmount: 650 })).toEqual({ formatted: expect.stringMatching(/92,80/), twoMonths: false });
  });
  it('does not advertise a discount across currencies, capacities, or missing prices', () => {
    expect(annualSaving(monthly, { ...annual, currency: 'USD' })).toBeNull();
    expect(annualSaving(monthly, { ...annual, product: { ...annual.product, member_limit: 40 } })).toBeNull();
    expect(annualSaving(monthly, undefined)).toBeNull();
    expect(annualSaving({ ...monthly, priceAmount: undefined }, annual)).toBeNull();
    expect(annualSaving(monthly, { ...annual, priceAmount: 800 })).toBeNull();
  });
});
