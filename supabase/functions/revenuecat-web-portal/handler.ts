import { corsHeaders, enforceRateLimit, errorResponse, HttpError, isUuid, json, readJsonBody, readResponseText, requireAuthenticated, requiredEnv, requirePost } from '../_shared/security.ts';
import { billingEnvironment, syncRevenueCat } from '../_shared/revenuecat.ts';

interface RcSubscription { product_id: string; store: string; environment: string; store_subscription_identifier: string; gives_access: boolean; current_period_ends_at: number }
interface StripePrice { id: string; product: string; active: boolean; livemode: boolean; currency: string; unit_amount: number; recurring: { interval: string; interval_count: number } | null }
interface StripeItem { id: string; subscription: string; quantity: number; price: StripePrice }
interface StripeSubscription { id: string; customer: string; livemode: boolean; status: string; cancel_at_period_end: boolean; pending_update: unknown; schedule: string | null; items: { data: StripeItem[] } }

async function providerJson<T>(url: string, key: string, body?: URLSearchParams): Promise<T> {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(502, 'Não foi possível abrir o gerenciamento. Tente novamente.');
  return JSON.parse(await readResponseText(response, 1_048_576)) as T;
}

export async function handleWebPortal(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    requirePost(req);
    const auth = await requireAuthenticated(req);
    const { admin, profileId } = auth;
    const body = await readJsonBody(req, 4096);
    if (!isUuid(body.team_id)) throw new HttpError(400, 'Equipe inválida.');
    const expanding = body.product_id !== undefined;
    if (expanding && (typeof body.product_id !== 'string' || body.product_id.length > 255 ||
      !Number.isSafeInteger(body.expected_price_cents) || Number(body.expected_price_cents) <= 0 || body.currency !== 'BRL')) {
      throw new HttpError(400, 'Plano inválido.');
    }
    const { data: team, error: teamError } = await admin.from('teams').select('owner_id').eq('id', body.team_id).maybeSingle();
    if (teamError) throw new HttpError(503, 'Equipe indisponível.');
    if (!team || team.owner_id !== profileId) throw new HttpError(403, 'Somente o responsável pode gerenciar a assinatura.');
    await enforceRateLimit(auth, 'revenuecat-web-portal', body.team_id, 20, 3600);
    const environment = billingEnvironment();
    const stripeKey = requiredEnv('STRIPE_SECRET_KEY');
    const rcKey = requiredEnv('REVENUECAT_V2_SECRET_API_KEY');
    const project = encodeURIComponent(requiredEnv('REVENUECAT_PROJECT_ID'));
    // Never accept a return URL, Stripe customer, or subscription ID from a client.
    const returnUrl = new URL(requiredEnv('BILLING_WEB_RETURN_URL'));
    if (returnUrl.protocol !== 'https:' || returnUrl.username || returnUrl.password) throw new HttpError(503, 'Retorno da cobrança não configurado.');
    returnUrl.searchParams.set('billing', 'return');
    returnUrl.searchParams.set('billing_team', body.team_id);
    const { data: customer, error: customerError } = await admin.from('revenuecat_customers').select('app_user_id').eq('team_id', body.team_id).maybeSingle();
    if (customerError || !customer) throw new HttpError(409, 'Atualize a assinatura antes de continuar.');
    await syncRevenueCat(admin, customer.app_user_id);
    const { data: current, error: currentError } = await admin.from('account_subscriptions').select('*').eq('team_id', body.team_id).maybeSingle();
    if (currentError) throw new HttpError(503, 'Assinatura indisponível.');
    if (!current || current.provider !== 'revenuecat' || current.store !== 'stripe' || current.revenuecat_environment !== environment) {
      throw new HttpError(409, 'Gerencie esta assinatura na origem da compra.');
    }
    const { data: mapping, error: mappingError } = await admin.from('stripe_billing_products').select('*').eq('product_id', current.product_id).eq('environment', environment).maybeSingle();
    if (mappingError || !mapping) throw new HttpError(503, 'Gerenciamento web ainda não configurado.');

    const base = `https://api.revenuecat.com/v2/projects/${project}/customers/${encodeURIComponent(customer.app_user_id)}/subscriptions`;
    let cursor = ''; const subscriptions: RcSubscription[] = [];
    for (let page = 0; page < 10; page++) {
      const result = await providerJson<{ items: RcSubscription[]; next_page: string | null }>(`${base}?limit=100${cursor}`, rcKey);
      if (!Array.isArray(result.items)) throw new HttpError(502, 'Resposta de assinatura inválida.');
      subscriptions.push(...result.items);
      if (!result.next_page) break;
      const next = new URL(result.next_page, 'https://api.revenuecat.com');
      if (next.origin !== 'https://api.revenuecat.com' || next.pathname !== new URL(base).pathname || page === 9) throw new HttpError(502, 'Não foi possível consultar a assinatura.');
      cursor = `&starting_after=${encodeURIComponent(next.searchParams.get('starting_after') ?? '')}`;
    }
    const candidates = subscriptions.filter(s => s.store === 'stripe' && s.environment === environment.toLowerCase() && s.product_id === mapping.revenuecat_product_id);
    const active = candidates.filter(s => s.gives_access);
    if (active.length > 1) throw new HttpError(409, 'Há mais de uma assinatura. Entre em contato com o suporte.');
    const source = active[0] ?? candidates.sort((a, b) => b.current_period_ends_at - a.current_period_ends_at)[0];
    // RevenueCat Stripe subscriptions identify a subscription ITEM (si_), not sub_.
    if (!source || !/^si_[A-Za-z0-9]+$/.test(source.store_subscription_identifier)) throw new HttpError(409, 'Atualize a assinatura antes de continuar.');
    const stripe = <T>(path: string, params?: URLSearchParams) => providerJson<T>(`https://api.stripe.com/v1/${path}`, stripeKey, params);
    const item = await stripe<StripeItem>(`subscription_items/${source.store_subscription_identifier}`);
    if (!/^sub_[A-Za-z0-9]+$/.test(item.subscription)) throw new HttpError(502, 'Assinatura inválida.');
    const subscription = await stripe<StripeSubscription>(`subscriptions/${item.subscription}`);
    if (subscription.livemode !== (environment === 'PRODUCTION') || item.price.product !== mapping.stripe_product_id ||
      item.price.id !== mapping.stripe_price_id || !subscription.items.data.some(i => i.id === item.id) || !/^cus_[A-Za-z0-9]+$/.test(subscription.customer)) {
      throw new HttpError(409, 'A assinatura mudou. Use Atualizar antes de continuar.');
    }
    const params = new URLSearchParams({ customer: subscription.customer, return_url: returnUrl.href, locale: 'pt-BR', configuration: requiredEnv('STRIPE_PORTAL_CONFIGURATION_ID') });
    if (expanding) {
      if (current.is_unlimited || !source.gives_access || !['active', 'trialing'].includes(subscription.status) ||
        subscription.items.data.length !== 1 || item.quantity !== 1 || subscription.pending_update || subscription.schedule || subscription.cancel_at_period_end) {
        throw new HttpError(409, 'Confira sua assinatura no gerenciamento antes de adicionar vagas.');
      }
      const [{ data: target, error: targetError }, { data: targetMapping, error: targetMappingError }, { count, error: countError }, { data: oldProduct, error: oldError }] = await Promise.all([
        admin.from('revenuecat_products').select('*').eq('product_id', body.product_id).eq('enabled', true).maybeSingle(),
        admin.from('stripe_billing_products').select('*').eq('product_id', body.product_id).eq('environment', environment).maybeSingle(),
        admin.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', body.team_id),
        admin.from('revenuecat_products').select('*').eq('product_id', current.product_id).maybeSingle(),
      ]);
      if (targetError || targetMappingError || countError || oldError) throw new HttpError(503, 'Catálogo indisponível.');
      if (!target || !targetMapping || !oldProduct || count === null || target.plan !== oldProduct.plan || target.billing_period !== oldProduct.billing_period ||
        target.member_limit <= oldProduct.member_limit || target.member_limit < count) throw new HttpError(409, 'Este plano mudou ou não comporta a equipe.');
      const price = await stripe<StripePrice>(`prices/${targetMapping.stripe_price_id}`);
      if (!price.active || price.livemode !== subscription.livemode || price.product !== targetMapping.stripe_product_id ||
        price.currency !== 'brl' || price.currency !== item.price.currency || price.unit_amount !== body.expected_price_cents ||
        price.unit_amount <= item.price.unit_amount || price.recurring?.interval !== (target.billing_period === 'annual' ? 'year' : 'month') || price.recurring?.interval_count !== 1) {
        throw new HttpError(409, 'O preço foi atualizado. Confira o valor antes de alterar.');
      }
      params.set('configuration', targetMapping.portal_configuration_id);
      params.set('flow_data[type]', 'subscription_update_confirm');
      params.set('flow_data[subscription_update_confirm][subscription]', subscription.id);
      params.set('flow_data[subscription_update_confirm][items][0][id]', item.id);
      params.set('flow_data[subscription_update_confirm][items][0][price]', price.id);
      params.set('flow_data[subscription_update_confirm][items][0][quantity]', '1');
      params.set('flow_data[after_completion][type]', 'redirect');
      params.set('flow_data[after_completion][redirect][return_url]', returnUrl.href);
    }
    const session = await stripe<{ url: string; livemode: boolean }>('billing_portal/sessions', params);
    const url = new URL(session.url);
    if (url.protocol !== 'https:' || url.hostname !== 'billing.stripe.com' || url.username || url.password || session.livemode !== subscription.livemode) throw new HttpError(502, 'Endereço de gerenciamento inválido.');
    return json({ url: url.href });
  } catch (error) { return errorResponse(error); }
}
