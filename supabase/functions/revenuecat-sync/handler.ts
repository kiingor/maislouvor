import { corsHeaders, enforceRateLimit, errorResponse, HttpError, isUuid, json, readJsonBody, requireAuthenticated, requirePost } from '../_shared/security.ts';
import { refreshExpiredStripeSubscription, syncRevenueCat } from '../_shared/revenuecat.ts';

export async function handleRevenueCatSync(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  try {
    requirePost(req);
    const auth = await requireAuthenticated(req);
    const { admin, profileId } = auth;
    const body = await readJsonBody(req, 4096);
    if (typeof body.team_id !== 'string' || !isUuid(body.team_id)) throw new HttpError(400, 'Equipe inválida.');
    const { data: team, error: teamError } = await admin.from('teams').select('owner_id').eq('id', body.team_id).maybeSingle();
    if (teamError) throw new HttpError(503, 'Equipe indisponível.');
    if (body.capacity_only === true && team) {
      // Team leaders may refresh expired seat capacity, but receive no billing
      // identity, receipt, management URL or permission to buy/manage payments.
      if (team.owner_id !== profileId) {
        const { data: member, error: memberError } = await admin.from('team_members').select('role').eq('team_id', body.team_id).eq('profile_id', profileId).maybeSingle();
        if (memberError) throw new HttpError(503, 'Permissão indisponível.');
        if (member?.role !== 'admin') throw new HttpError(403, 'Somente líderes podem conferir vagas.');
      }
      await enforceRateLimit(auth, 'revenuecat-capacity', body.team_id, 30, 3600);
      return json({ refreshed: await refreshExpiredStripeSubscription(admin, body.team_id) });
    }
    if (!team || team.owner_id !== profileId) throw new HttpError(403, 'Somente o responsável pode gerenciar a assinatura.');
    const { data: customer, error } = await admin.from('revenuecat_customers').select('app_user_id').eq('team_id', body.team_id).maybeSingle();
    if (error || !customer) throw new HttpError(409, 'Abra a área de assinatura antes de sincronizar.');
    // Ignore all client purchase details, amounts, entitlement IDs and customer IDs.
    return json(await syncRevenueCat(admin, customer.app_user_id));
  } catch (error) { return errorResponse(error); }
}
