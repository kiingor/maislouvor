import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, HttpError, json, readJsonBody, requiredEnv, requirePost } from '../_shared/security.ts';
import { billingEnvironment, matchesWebhookAuthorization, syncRevenueCat } from '../_shared/revenuecat.ts';
import { eventCustomerIds, type RevenueCatEvent } from '../_shared/revenuecat-model.ts';

export async function handleRevenueCatWebhook(req: Request): Promise<Response> {
  try {
    requirePost(req);
    if (!await matchesWebhookAuthorization(req.headers.get('Authorization'), requiredEnv('REVENUECAT_WEBHOOK_AUTHORIZATION'))) {
      throw new HttpError(401, 'Webhook não autorizado.');
    }
    const body = await readJsonBody(req, 262144);
    const event = body.event as RevenueCatEvent | undefined;
    if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 255 ||
      typeof event.type !== 'string' || !event.type || event.type.length > 100) throw new HttpError(400, 'Evento inválido.');
    if (event.type === 'TEST') return json({ received: true, test: true });
    const environment = billingEnvironment();
    if (event.environment != null && !['PRODUCTION', 'SANDBOX'].includes(event.environment)) throw new HttpError(400, 'Ambiente inválido.');
    if (event.environment != null && event.environment !== environment) return json({ received: true, ignored: 'environment' });
    // TRANSFER and temporary grants can omit the environment. The REST projection
    // always filters each subscription by the server's configured environment.

    const admin = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: receipt, error: receiptError } = await admin.from('revenuecat_webhook_events').select('event_id').eq('event_id', event.id).maybeSingle();
    if (receiptError) throw new HttpError(503, 'Registro de eventos indisponível.');
    if (receipt) return json({ received: true, duplicate: true });

    const ids = eventCustomerIds(event);
    if (ids.length) {
      const { data: customers, error } = await admin.from('revenuecat_customers').select('app_user_id').in('app_user_id', ids);
      if (error) throw new HttpError(503, 'Clientes indisponíveis.');
      // TRANSFER must reconcile both sides; a retry can safely redo partial work.
      // Fetch current state for every event instead of trusting delivery order.
      for (const customer of customers ?? []) await syncRevenueCat(admin, customer.app_user_id);
    }
    const { error } = await admin.from('revenuecat_webhook_events').upsert({
      event_id: event.id, event_type: event.type, environment,
    }, { onConflict: 'event_id', ignoreDuplicates: true });
    if (error) throw new HttpError(503, 'Não foi possível registrar o evento.');
    return json({ received: true });
  } catch (error) { return errorResponse(error); }
}
