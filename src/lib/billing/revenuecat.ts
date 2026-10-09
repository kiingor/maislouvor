import { withWebCheckoutBack } from './web-checkout';
import { formatMoney } from './catalog';
import { Capacitor } from '@capacitor/core';
import { requireBillingOwner, syncBilling } from './api';
import { canStartSubscription, type BillingContext, type BillingOffer, type BillingProduct } from './types';
import { diagnosticStorefront, NativeBillingError } from './errors';

export function billingPlatform(): 'ios' | 'android' | 'web' {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') return platform;
  return 'web';
}

function apiKey(): string {
  const platform = billingPlatform();
  return (platform === 'ios' ? import.meta.env.VITE_REVENUECAT_IOS_API_KEY : platform === 'android'
    ? import.meta.env.VITE_REVENUECAT_ANDROID_API_KEY : import.meta.env.VITE_REVENUECAT_WEB_API_KEY)?.trim() ?? '';
}
export function isBillingConfigured(): boolean { return Boolean(apiKey()); }

// SDKs use a shared instance. Serialize configure/login/purchase so changing teams
// cannot route a pending checkout to another team's RevenueCat customer.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.then(operation, operation);
  queue = next.catch(() => undefined);
  return next;
}

async function sdk(context: BillingContext) {
  const key = apiKey();
  if (!key || !context.app_user_id) throw new Error('As assinaturas ainda não estão disponíveis nesta plataforma.');
  const platform = billingPlatform();
  if (platform !== 'web') {
    const { Purchases } = await import('@revenuecat/purchases-capacitor').catch((error: unknown) => {
      throw new NativeBillingError('sdk', platform, error);
    });
    try {
      if (!(await Purchases.isConfigured()).isConfigured) await Purchases.configure({ apiKey: key, appUserID: context.app_user_id });
      else if ((await Purchases.getAppUserID()).appUserID !== context.app_user_id) await Purchases.logIn({ appUserID: context.app_user_id });
    } catch (error) {
      throw new NativeBillingError('configure', platform, error);
    }
    return { kind: 'native' as const, platform, purchases: Purchases };
  }
  const { Purchases } = await import('@revenuecat/purchases-js');
  const purchases = Purchases.isConfigured() ? Purchases.getSharedInstance() : Purchases.configure({ apiKey: key, appUserId: context.app_user_id });
  if (purchases.getAppUserId() !== context.app_user_id) await purchases.changeUser(context.app_user_id);
  return { kind: 'web' as const, purchases };
}

function productFor(context: BillingContext, id: string, period: string | null): BillingProduct | undefined {
  return context.products.find((product) => product.product_id === id && product.enabled && product.member_limit >= context.member_count &&
    (product.billing_period === 'monthly' ? period === 'P1M' : period === 'P1Y' || period === 'P12M'));
}

async function load(context: BillingContext): Promise<{ active: boolean; activeProductIds: string[]; offers: (BillingOffer & { buy: () => Promise<unknown> })[] }> {
  const client = await sdk(context);
  const offeringId = (client.kind === 'web' ? import.meta.env.VITE_REVENUECAT_WEB_OFFERING_ID?.trim() : '') || import.meta.env.VITE_REVENUECAT_OFFERING_ID?.trim();
  if (client.kind === 'native') {
    const [offerings, { customerInfo }] = await Promise.all([
      Promise.resolve().then(() => client.purchases.getOfferings()).catch(async (error: unknown) => {
        const country = await diagnosticStorefront(() => client.purchases.getStorefront());
        throw new NativeBillingError('offerings', client.platform, error, country);
      }),
      Promise.resolve().then(() => client.purchases.getCustomerInfo()).catch((error: unknown) => {
        throw new NativeBillingError('customer-info', client.platform, error);
      }),
    ]);
    const offering = offeringId ? offerings.all[offeringId] : offerings.current;
    const activeProductIds = [...new Set([
      ...(customerInfo.activeSubscriptions ?? []),
      ...Object.values(customerInfo.entitlements.active).map((entitlement) => entitlement.productIdentifier),
    ])];
    return {
      active: Object.keys(customerInfo.entitlements.active).length > 0 || activeProductIds.length > 0,
      activeProductIds,
      offers: (offering?.availablePackages ?? []).flatMap((pkg) => {
        const product = productFor(context, pkg.product.identifier, pkg.product.subscriptionPeriod);
        return product ? [{ key: pkg.identifier, product, title: pkg.product.title, price: pkg.product.priceString,
          priceAmount: pkg.product.price, currency: pkg.product.currencyCode,
          buy: () => client.purchases.purchasePackage({ aPackage: pkg }) }] : [];
      }),
    };
  }
  const [offerings, customerInfo] = await Promise.all([client.purchases.getOfferings(), client.purchases.getCustomerInfo()]);
  const offering = offeringId ? offerings.all[offeringId] : offerings.current;
  return {
    active: Object.keys(customerInfo.entitlements.active).length > 0 || customerInfo.activeSubscriptions?.size > 0,
    activeProductIds: [...(customerInfo.activeSubscriptions ?? [])],
    offers: (offering?.availablePackages ?? []).flatMap((pkg) => {
      const product = productFor(context, pkg.product.identifier, pkg.product.normalPeriodDuration);
      return product ? [{ key: pkg.identifier, product, title: pkg.product.title, price: Number.isFinite(pkg.product.price.amountMicros) && /^[A-Z]{3}$/.test(pkg.product.price.currency) ? formatMoney(pkg.product.price.amountMicros / 1_000_000, pkg.product.price.currency) : pkg.product.price.formattedPrice,
        priceAmount: pkg.product.price.amountMicros / 1_000_000, currency: pkg.product.price.currency,
        buy: () => withWebCheckoutBack(() => client.purchases.purchase({ rcPackage: pkg, selectedLocale: 'pt', defaultLocale: 'pt', skipSuccessPage: true })) }] : [];
    }),
  };
}

export const getBillingOffers = (teamId: string): Promise<{ active: boolean; offers: BillingOffer[] }> => serialized(async () => {
  const result = await load(await requireBillingOwner(teamId));
  return { active: result.active, offers: result.offers.map(({ buy: _buy, ...offer }) => offer) };
});

export const purchaseSubscription = (teamId: string, offer: BillingOffer) => serialized(async () => {
  const context = await requireBillingOwner(teamId);
  if (!canStartSubscription(context)) throw new Error('A equipe já possui uma assinatura. Gerencie a cobrança existente.');
  const current = await load(context);
  if (current.active) throw new Error('Já existe uma compra ativa. Atualize a assinatura antes de continuar.');
  // Do not charge when the verification backend is not deployed/configured.
  // Also reconcile a purchase made on another device before starting this one.
  await syncBilling(teamId);
  const latest = await requireBillingOwner(teamId);
  if (latest.app_user_id !== context.app_user_id || !canStartSubscription(latest)) {
    throw new Error('A assinatura foi atualizada. Confira o estado da equipe antes de continuar.');
  }
  const selected = current.offers.find((item) => item.key === offer.key && item.product.product_id === offer.product.product_id);
  if (!selected || !latest.products.some((item) => item.product_id === selected.product.product_id && item.enabled &&
    item.member_limit >= latest.member_count && item.billing_period === selected.product.billing_period)) {
    throw new Error('Este plano mudou ou não comporta a equipe. Atualize as opções.');
  }
  // Ask the user to review a changed price instead of silently accepting it.
  if (selected.price !== offer.price) throw new Error('O preço foi atualizado. Confira o novo valor antes de assinar.');
  await selected.buy();
});

// Apple replaces products within our one subscription group. Restrict this
// checkout to extra capacity on the same plan and period; other changes use
// the original store's management flow instead of creating another contract.
export const expandSubscription = (teamId: string, offer: BillingOffer) => serialized(async () => {
  const context = await requireBillingOwner(teamId);
  const sub = context.subscription;
  const oldProduct = context.products.find((product) => product.product_id === sub.product_id);
  if (sub.is_unlimited || billingPlatform() !== 'ios' || !sub.is_active || sub.provider !== 'revenuecat' || sub.store !== 'app_store' ||
    !oldProduct || oldProduct.plan !== offer.product.plan || oldProduct.billing_period !== offer.product.billing_period ||
    offer.product.member_limit <= oldProduct.member_limit) {
    throw new Error('Gerencie esta alteração na origem da assinatura.');
  }
  await syncBilling(teamId);
  const latest = await requireBillingOwner(teamId);
  if (latest.subscription.is_unlimited || latest.app_user_id !== context.app_user_id || !latest.subscription.is_active ||
    latest.subscription.provider !== 'revenuecat' || latest.subscription.store !== 'app_store' ||
    latest.subscription.product_id !== sub.product_id) {
    throw new Error('A assinatura foi atualizada. Confira o estado da equipe antes de continuar.');
  }
  const current = await load(latest);
  if (!current.active || current.activeProductIds.some((id) => id !== sub.product_id)) {
    throw new Error('A loja ainda não confirmou sua assinatura atual. Use Atualizar.');
  }
  const selected = current.offers.find((item) => item.key === offer.key && item.product.product_id === offer.product.product_id);
  if (!selected || selected.product.plan !== oldProduct.plan || selected.product.billing_period !== oldProduct.billing_period ||
    selected.product.member_limit <= oldProduct.member_limit) {
    throw new Error('Este plano mudou ou não comporta a equipe. Atualize as opções.');
  }
  if (selected.price !== offer.price) throw new Error('O preço foi atualizado. Confira o novo valor antes de alterar.');
  await selected.buy();
});

export const restoreSubscriptions = (teamId: string) => serialized(async () => {
  const client = await sdk(await requireBillingOwner(teamId));
  if (client.kind === 'native') await client.purchases.restorePurchases();
  else await client.purchases.getCustomerInfo();
});

export function isPurchaseCancelled(error: unknown): boolean {
  const value = error as { userCancelled?: boolean; code?: string | number; errorCode?: number } | null;
  return value?.userCancelled === true || value?.code === '1' || value?.code === 1 || value?.errorCode === 1;
}

export async function openBillingManagement(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Endereço de gerenciamento inválido.');
  if (billingPlatform() !== 'web') {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url: parsed.href });
  } else window.location.assign(parsed.href);
}
