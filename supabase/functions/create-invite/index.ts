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
  requireString,
} from "../_shared/security.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = new Set(["admin", "editor", "viewer"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);
    const context = await requireAuthenticated(req);
    const body = await readJsonBody(req, 8_192);

    const email = requireString(body.email, "email", { max: 254 })
      .toLowerCase();
    const teamId = body.team_id;
    const role = body.role;

    if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, "E-mail inválido");
    if (!isUuid(teamId)) throw new HttpError(400, "team_id inválido");
    if (typeof role !== "string" || !ROLES.has(role)) {
      throw new HttpError(400, "Função inválida");
    }

    const { data: callerMember, error: memberError } = await context.admin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("profile_id", context.profileId)
      .maybeSingle();

    if (memberError) {
      throw new HttpError(503, "Não foi possível validar a permissão");
    }
    if (callerMember?.role !== "admin") {
      throw new HttpError(403, "Somente líderes podem convidar");
    }

    await enforceRateLimit(context, "create-invite", teamId, 30, 3_600);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000)
      .toISOString();

    const { data: pendingInvite, error: pendingError } = await context.admin
      .from("team_invites")
      .select("id")
      .eq("team_id", teamId)
      .eq("email", email)
      .eq("accepted", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (pendingError) {
      throw new HttpError(503, "Não foi possível consultar os convites");
    }

    const inviteMutation = pendingInvite
      ? context.admin
        .from("team_invites")
        .update({ role, token, expires_at: expiresAt })
        .eq("id", pendingInvite.id)
        .eq("accepted", false)
      : context.admin.from("team_invites").insert({
        team_id: teamId,
        email,
        role,
        token,
        accepted: false,
        expires_at: expiresAt,
      });

    const { error: inviteError } = await inviteMutation;
    if (inviteError) {
      console.error("create-invite mutation failed", inviteError.message);
      throw new HttpError(503, "Não foi possível criar o convite");
    }

    return json({ success: true, token, expires_at: expiresAt });
  } catch (error) {
    console.error("create-invite error", error);
    return errorResponse(error);
  }
});
