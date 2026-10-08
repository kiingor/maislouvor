import {
  corsHeaders,
  enforceRateLimit,
  errorResponse,
  HttpError,
  isUuid,
  json,
  readJsonBody,
  requireAuthenticated,
  requirePost,
} from "../_shared/security.ts";
import { refreshExpiredStripeSubscription } from "../_shared/revenuecat.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);
    const context = await requireAuthenticated(req);

    const { data: authUserData, error: authUserError } = await context.admin
      .auth.admin.getUserById(context.userId);
    const authUser = authUserData?.user;
    if (authUserError || !authUser?.email || !authUser.email_confirmed_at) {
      throw new HttpError(
        403,
        "A conta autenticada não possui e-mail verificado",
      );
    }

    const body = await readJsonBody(req, 4_096);
    const inviteToken = body.token;
    if (!isUuid(inviteToken)) throw new HttpError(400, "Token inválido");

    await enforceRateLimit(context, "accept-invite", context.userId, 20, 3_600);

    const { data: invite, error: inviteError } = await context.admin
      .from("team_invites")
      .select("id, team_id, email, role, expires_at")
      .eq("token", inviteToken)
      .eq("accepted", false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle();

    if (inviteError) {
      throw new HttpError(503, "Não foi possível consultar o convite");
    }
    if (!invite) {
      throw new HttpError(404, "Convite inválido, expirado ou já utilizado");
    }
    if (
      invite.email.trim().toLowerCase() !== authUser.email.trim().toLowerCase()
    ) {
      throw new HttpError(403, "O convite pertence a outro e-mail");
    }

    await refreshExpiredStripeSubscription(context.admin, invite.team_id);
    const { data: acceptedTeamId, error: acceptError } = await context.admin
      .rpc("accept_team_invite", {
        _invite_id: invite.id,
        _profile_id: context.profileId,
        _email: authUser.email,
      });

    if (acceptError || acceptedTeamId !== invite.team_id) {
      if (acceptError?.hint === "TEAM_DATA_CONSENT_REQUIRED") {
        return json({ code: "TEAM_DATA_CONSENT_REQUIRED", error: "Entre no app e autorize sua participação antes de aceitar este convite." }, 409);
      }
      if (acceptError?.hint === "TEAM_MEMBER_LIMIT_REACHED") {
        return json({ code: "TEAM_MEMBER_LIMIT_REACHED", error: "A equipe está sem vagas. Peça ao líder responsável para ampliar o plano e tente aceitar este mesmo convite novamente." }, 409);
      }
      console.error("accept-invite transaction failed", acceptError?.message);
      throw new HttpError(409, "O convite expirou ou já foi utilizado");
    }

    return json({ success: true, team_id: acceptedTeamId });
  } catch (error) {
    console.error("accept-invite error", error);
    return errorResponse(error);
  }
});
