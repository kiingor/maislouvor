import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { requireBillingOwner, syncBilling } from './api';
import { getBillingOffers, expandSubscription, isPurchaseCancelled, purchaseSubscription, restoreSubscriptions } from './revenuecat';
import type { BillingContext } from './types';
import { NativeBillingError } from './errors';

const { web, native, webConfigure } = vi.hoisted(() => ({
  web: { getAppUserId: vi.fn(), changeUser: vi.fn(), getOfferings: vi.fn(), getCustomerInfo: vi.fn(), purchase: vi.fn() },
  native: { isConfigured: vi.fn(), configure: vi.fn(), getAppUserID: vi.fn(), logIn: vi.fn(), getOfferings: vi.fn(), getCustomerInfo: vi.fn(), getStorefront: vi.fn(), purchasePackage: vi.fn(), restorePurchases: vi.fn() },
  webConfigure: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: vi.fn() } }));
vi.mock('./api', () => ({ requireBillingOwner: vi.fn(), syncBilling: vi.fn() }));
vi.mock('@revenuecat/purchases-js', () => ({ Purchases: { isConfigured: () => true, getSharedInstance: () => web, configure: webConfigure } }));
vi.mock('@revenuecat/purchases-capacitor', () => ({ Purchases: native }));

let context: BillingContext;
let pkg: { identifier: string; product: { identifier: string; title: string; price: { formattedPrice: string }; priceString: string; normalPeriodDuration: string; subscriptionPeriod: string } };
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_REVENUECAT_WEB_API_KEY', 'rcb_public_test');
  vi.stubEnv('VITE_REVENUECAT_IOS_API_KEY', 'appl_public_test');
  vi.stubEnv('VITE_REVENUECAT_ANDROID_API_KEY', 'goog_public_test');
  vi.stubEnv('VITE_REVENUECAT_OFFERING_ID', '');
  vi.stubEnv('VITE_REVENUECAT_WEB_OFFERING_ID', '');
  vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
  context = { team_id: 'team', can_manage: true, app_user_id: 'opaque-team-customer', member_count: 12,
    products: [{ product_id: 'completo_20', entitlement_id: 'completo', plan: 'completo', member_limit: 20, billing_period: 'monthly', enabled: true }],
    subscription: { plan: 'free', status: 'free', provider: 'manual', is_active: false, will_renew: false, entitlement_ids: [] } };
  vi.mocked(requireBillingOwner).mockImplementation(async () => structuredClone(context));
  vi.mocked(syncBilling).mockResolvedValue({ is_active: false, management_url: null });
  pkg = { identifier: 'monthly', product: { identifier: 'completo_20', title: 'Completo', price: { formattedPrice: 'R$ 61,90' }, priceString: 'R$ 61,90', normalPeriodDuration: 'P1M', subscriptionPeriod: 'P1M' } };
  web.getAppUserId.mockReturnValue('other-customer');
  web.getOfferings.mockImplementation(async () => ({ current: { availablePackages: [pkg] }, all: {} }));
  web.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} } });
  web.purchase.mockResolvedValue({});
  native.isConfigured.mockResolvedValue({ isConfigured: false });
  native.configure.mockResolvedValue(undefined);
  native.getStorefront.mockResolvedValue({ countryCode: 'BRA', identifier: 'not-for-support' });
  native.getOfferings.mockImplementation(async () => ({ current: { availablePackages: [pkg] }, all: {} }));
  native.getCustomerInfo.mockResolvedValue({ customerInfo: { entitlements: { active: {} } } });
});

describe('RevenueCat SDK integration', () => {
  it('opens the web checkout in Portuguese and waits for server confirmation', async () => {
    const { offers } = await getBillingOffers('team');
    await purchaseSubscription('team', offers[0]);
    expect(web.purchase).toHaveBeenCalledWith({ rcPackage: pkg, selectedLocale: 'pt', defaultLocale: 'pt', skipSuccessPage: true });
    expect(native.purchasePackage).not.toHaveBeenCalled();
  });
  it('selects the web offering without changing native catalog selection', async () => {
    vi.stubEnv('VITE_REVENUECAT_WEB_OFFERING_ID', 'web');
    web.getOfferings.mockResolvedValue({ current: { availablePackages: [] }, all: { web: { availablePackages: [pkg] } } });
    expect((await getBillingOffers('team')).offers).toHaveLength(1);
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    expect((await getBillingOffers('team')).offers).toHaveLength(1);
  });
  it('blocks duplicate web purchases even when an active subscription has no entitlement yet', async () => {
    const { offers } = await getBillingOffers('team');
    web.getCustomerInfo.mockResolvedValue({ entitlements: { active: {} }, activeSubscriptions: new Set(['stripe_pending_mapping']) });
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('compra ativa');
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('blocks duplicate native purchases even when an active subscription has no entitlement yet', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    const { offers } = await getBillingOffers('team');
    native.getCustomerInfo.mockResolvedValue({ customerInfo: { entitlements: { active: {} }, activeSubscriptions: ['completo_20'] } });
    expect((await getBillingOffers('team')).active).toBe(true);
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('compra ativa');
    expect(native.purchasePackage).not.toHaveBeenCalled();
    expect(syncBilling).not.toHaveBeenCalled();
  });
  it('reports native offerings error 23 with only the stage, code and storefront country', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    native.getOfferings.mockRejectedValueOnce({ code: '23', message: 'secret-api-key customer-123', userInfo: { appUserID: 'customer-123' } });
    const error = await getBillingOffers('team').catch((value) => value);
    expect(error).toBeInstanceOf(NativeBillingError);
    expect(error.supportCode).toBe('ML-IOS-OFFERINGS-23-BRA');
    expect(error.message).toBe('Não foi possível consultar os planos na loja. Tente novamente em instantes.');
    expect(JSON.stringify(error)).not.toMatch(/secret-api-key|customer-123|not-for-support/);
    expect(native.getStorefront).toHaveBeenCalledOnce();
  });
  it('keeps customer-info failures distinct and does not query the storefront', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    native.getCustomerInfo.mockRejectedValueOnce({ code: 29, message: 'private receipt' });
    await expect(getBillingOffers('team')).rejects.toMatchObject({
      supportCode: 'ML-IOS-CUSTOMER-INFO-29', message: 'Não foi possível conferir suas compras na loja. Tente novamente.',
    });
    expect(native.getStorefront).not.toHaveBeenCalled();
    expect(native.purchasePackage).not.toHaveBeenCalled();
  });
  it('reports configuration failures without exposing native errors or fetching offers', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    native.configure.mockRejectedValueOnce({ code: 11, message: 'private key and customer id' });
    await expect(getBillingOffers('team')).rejects.toMatchObject({ supportCode: 'ML-ANDROID-CONFIGURE-11', message: 'Não foi possível conectar à loja. Tente novamente.' });
    expect(native.getOfferings).not.toHaveBeenCalled();
    expect(native.getStorefront).not.toHaveBeenCalled();
  });
  it('preserves the original offerings error when storefront lookup fails', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    native.getOfferings.mockRejectedValueOnce({ code: 23 });
    native.getStorefront.mockRejectedValueOnce(new Error('storefront unavailable and private'));
    await expect(getBillingOffers('team')).rejects.toMatchObject({ supportCode: 'ML-IOS-OFFERINGS-23' });
  });
  it('does not query storefront or restrict successful native offers by country', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    native.getStorefront.mockResolvedValue({ countryCode: 'USA' });
    expect((await getBillingOffers('team')).offers).toHaveLength(1);
    expect(native.getStorefront).not.toHaveBeenCalled();
  });
  it('identifies the team, uses provider prices and does not expose purchase callbacks', async () => {
    const result = await getBillingOffers('team');
    expect(web.changeUser).toHaveBeenCalledWith(context.app_user_id);
    expect(result.offers[0]).toMatchObject({ price: 'R$ 61,90', product: { member_limit: 20 } });
    expect(result.offers[0]).not.toHaveProperty('buy');
    expect(native.configure).not.toHaveBeenCalled();
  });
  it.each(['ios', 'android'])('uses native store checkout on %s', async (platform) => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
    const result = await getBillingOffers('team');
    await purchaseSubscription('team', result.offers[0]);
    expect(native.configure).toHaveBeenCalledWith({ apiKey: platform === 'ios' ? 'appl_public_test' : 'goog_public_test', appUserID: context.app_user_id });
    expect(native.purchasePackage).toHaveBeenCalledWith({ aPackage: pkg });
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('refreshes identity and permissions for every purchase', async () => {
    const { offers } = await getBillingOffers('team');
    vi.mocked(requireBillingOwner).mockRejectedValueOnce(new Error('No longer the owner'));
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('owner');
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('does not sell a plan smaller than the current team', async () => {
    const { offers } = await getBillingOffers('team');
    context.member_count = 21;
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('não comporta');
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('does not charge if the verification backend is unavailable', async () => {
    const { offers } = await getBillingOffers('team');
    vi.mocked(syncBilling).mockRejectedValue(new Error('Backend unavailable'));
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('Backend unavailable');
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('blocks checkout if a concurrent purchase is discovered by the server', async () => {
    const { offers } = await getBillingOffers('team');
    vi.mocked(syncBilling).mockImplementation(async () => {
      context.subscription = { ...context.subscription, provider: 'revenuecat', is_active: true };
      return { is_active: true, management_url: null };
    });
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('atualizada');
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('does not mislabel the billing period or sell unknown products', async () => {
    pkg.product.normalPeriodDuration = 'P1Y';
    expect((await getBillingOffers('team')).offers).toEqual([]);
    pkg.product.normalPeriodDuration = 'P1M'; pkg.product.identifier = 'unmapped';
    expect((await getBillingOffers('team')).offers).toEqual([]);
  });
  it('requires reviewing a changed price before checkout', async () => {
    const { offers } = await getBillingOffers('team');
    pkg.product.price.formattedPrice = 'R$ 89,90';
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('preço');
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('blocks a second purchase when the webhook has not arrived yet', async () => {
    const { offers } = await getBillingOffers('team');
    web.getCustomerInfo.mockResolvedValue({ entitlements: { active: { completo: {} } } });
    await expect(purchaseSubscription('team', offers[0])).rejects.toThrow('compra ativa');
    expect(web.purchase).not.toHaveBeenCalled();
  });
  it('restores purchases through the native SDK only on an explicit action', async () => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
    await getBillingOffers('team');
    expect(native.restorePurchases).not.toHaveBeenCalled();
    await restoreSubscriptions('team');
    expect(native.restorePurchases).toHaveBeenCalledOnce();
  });
  describe('extra capacity on an Apple subscription', () => {
    async function prepareExpansion() {
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios');
      context.subscription = { ...context.subscription, plan: 'completo', provider: 'revenuecat', is_active: true,
        product_id: 'completo_20', store: 'app_store', member_limit: 20 };
      context.products.push({ ...context.products[0], product_id: 'completo_40', member_limit: 40 });
      pkg.product.identifier = 'completo_40';
      native.getCustomerInfo.mockResolvedValue({ customerInfo: { entitlements: { active: { completo: { productIdentifier: 'completo_20' } } } } });
      return (await getBillingOffers('team')).offers[0];
    }
    it('replaces the current product without starting an independent subscription', async () => {
      const offer = await prepareExpansion();
      await expandSubscription('team', offer);
      expect(syncBilling).toHaveBeenCalledWith('team');
      expect(native.purchasePackage).toHaveBeenCalledOnce();
      expect(web.purchase).not.toHaveBeenCalled();
    });
    it.each(['play_store', 'rc_billing'])('refuses to change a subscription purchased on %s', async (store) => {
      const offer = await prepareExpansion(); context.subscription.store = store;
      await expect(expandSubscription('team', offer)).rejects.toThrow('origem');
      expect(native.purchasePackage).not.toHaveBeenCalled();
    });
    it('refuses changing plan or period through a capacity checkout', async () => {
      const offer = await prepareExpansion();
      await expect(expandSubscription('team', { ...offer, product: { ...offer.product, billing_period: 'annual' } })).rejects.toThrow('origem');
      await expect(expandSubscription('team', { ...offer, product: { ...offer.product, plan: 'asafe' } })).rejects.toThrow('origem');
      expect(native.purchasePackage).not.toHaveBeenCalled();
    });
    it('does not repeat an expansion discovered during synchronization', async () => {
      const offer = await prepareExpansion();
      vi.mocked(syncBilling).mockImplementation(async () => {
        context.subscription.product_id = 'completo_40'; return { is_active: true, management_url: null };
      });
      await expect(expandSubscription('team', offer)).rejects.toThrow('atualizada');
      expect(native.purchasePackage).not.toHaveBeenCalled();
    });
    it('blocks another checkout while the store has a newer product than the server', async () => {
      const offer = await prepareExpansion();
      native.getCustomerInfo.mockResolvedValue({ customerInfo: { entitlements: { active: { completo: { productIdentifier: 'completo_40' } } } } });
      await expect(expandSubscription('team', offer)).rejects.toThrow('Atualizar');
      expect(native.purchasePackage).not.toHaveBeenCalled();
    });
    it('requires a new review when the expansion price changes', async () => {
      const offer = await prepareExpansion(); pkg.product.priceString = 'R$ 99,90';
      await expect(expandSubscription('team', offer)).rejects.toThrow('preço');
      expect(native.purchasePackage).not.toHaveBeenCalled();
    });
  });
  it('recognizes cancellation without swallowing arbitrary errors', () => {
    expect(isPurchaseCancelled({ userCancelled: true })).toBe(true);
    expect(isPurchaseCancelled({ errorCode: 1 })).toBe(true);
    expect(isPurchaseCancelled({ code: '1' })).toBe(true);
    expect(isPurchaseCancelled(new Error('network'))).toBe(false);
  });
});
