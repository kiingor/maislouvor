import type { BillingOffer } from '@/lib/billing/types';
export const offers: BillingOffer[] = ['essencial', 'estudio', 'asafe', 'completo'].map((plan, i) => ({
  key: `fixture-${plan}`, title: plan, price: ['R$ 9,90', 'R$ 19,90', 'R$ 19,90', 'R$ 29,90'][i],
  priceAmount: [9.9, 19.9, 19.9, 29.9][i], currency: 'BRL',
  product: { product_id: `fixture_${plan}_5`, plan, member_limit: 5, billing_period: 'monthly', entitlement_id: plan, enabled: true },
})) as BillingOffer[];
export const billingPlatform = () => 'ios' as const;
export const isBillingConfigured = () => true;
export const getBillingOffers = async () => ({ active: false, offers });
const blocked = async () => { throw new Error('Prévia local: compras e alterações desabilitadas.'); };
export const purchaseSubscription = blocked;
export const expandSubscription = blocked;
export const restoreSubscriptions = blocked;
export const openBillingManagement = blocked;
export const isPurchaseCancelled = () => false;
