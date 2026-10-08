import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enforceRateLimit, HttpError, isUuid, json, requiredEnv, type SecurityContext } from "../_shared/security.ts";
import { refreshExpiredStripeSubscription } from "../_shared/revenuecat.ts";

class CapacityError extends HttpError {
  constructor() { super(409, "A última vaga foi ocupada. Atualize a equipe e contrate mais vagas."); }
}

// Keep the deployed app's direct-add contract while enforcing the same capacity
// as link invitations. A bulk insert makes multi-team membership all-or-nothing.
export async function legacyInvite(context: SecurityContext, body: Record<string, unknown>, authorization: string) {
  const teamIds = [...new Set(Array.isArray(body.team_ids) && body.team_ids.length ? body.team_ids : [body.team_id])];
  if (!teamIds.length || teamIds.length > 50 || !teamIds.every(isUuid)) throw new HttpError(400, "Equipes inválidas");
  const email = String(body.email).trim().toLowerCase();
  const name = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (name.length > 200 || password.length > 256) throw new HttpError(400, "Dados inválidos");
  const { admin } = context;
  const { data: memberships, error: permissionError } = await admin.from("team_members")
    .select("team_id,role").eq("profile_id", context.profileId).in("team_id", teamIds);
  if (permissionError) throw new HttpError(503, "Não foi possível conferir as permissões");
  if (teamIds.some(id => !memberships?.some((m: { team_id: string; role: string }) => m.team_id === id && m.role === "admin"))) {
    throw new HttpError(403, "Somente líderes das equipes selecionadas podem adicionar membros");
  }
  await enforceRateLimit(context, "create-invite", "legacy", 30, 3600);
  let existingUser: { id: string } | undefined;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(503, "Não foi possível consultar o cadastro");
    existingUser = data.users.find((u: { id: string; email?: string }) => u.email?.toLowerCase() === email);
    if (existingUser || data.users.length < 1000) break;
    if (page === 100) throw new HttpError(503, "Não foi possível concluir a consulta");
  }
  if (!existingUser) throw new HttpError(409, "Peça à pessoa para criar sua própria conta e autorizar a participação antes de adicioná-la. O líder não pode autorizar em nome dela.");
  let profileId: string | undefined;
  let targets = teamIds as string[];
  if (existingUser) {
    const { data: profile, error } = await admin.from("profiles").select("id").eq("user_id", existingUser.id).maybeSingle();
    if (error || !profile) throw new HttpError(503, "Perfil indisponível");
    profileId = profile.id;
    const { data: allowed, error: consentError } = await admin.rpc("team_data_allowed_profiles", { p_profile_ids: [profileId] });
    if (consentError) throw new HttpError(503, "Não foi possível conferir a privacidade");
    if (!Array.isArray(allowed) || !allowed.includes(profileId)) throw new HttpError(409, "Peça à pessoa para entrar na própria conta e autorizar a participação antes de adicioná-la.");
    const { data: joined, error: joinedError } = await admin.from("team_members").select("team_id").eq("profile_id", profileId).in("team_id", teamIds);
    if (joinedError) throw new HttpError(503, "Não foi possível consultar os vínculos");
    targets = targets.filter(id => !joined?.some((m: { team_id: string }) => m.team_id === id));
  }
  if (!targets.length) return json({ success: true, already_member: true, teams_added: 0, total_teams: teamIds.length, is_new_user: false });
  const caller = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const teamId of [...targets].sort()) {
    await refreshExpiredStripeSubscription(admin, teamId);
    const { data, error } = await caller.rpc("get_team_member_capacity", { p_team_id: teamId });
    if (error || !data) throw new HttpError(503, "Não foi possível conferir as vagas");
    if (!data.can_add_member) return json({ code: "TEAM_MEMBER_LIMIT_REACHED", team_id: teamId,
      error: "A equipe atingiu o limite de integrantes. O responsável precisa contratar mais vagas em Usuário → Assinatura." }, 409);
  }
  let createdUserId: string | undefined;
  if (!existingUser) {
    if (password.length < 6) throw new HttpError(400, "A senha deve ter pelo menos 6 caracteres");
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { full_name: name || email.split("@")[0] } });
    if (error || !data.user) throw new HttpError(409, "Não foi possível criar o cadastro. Confira o e-mail e tente novamente.");
    createdUserId = data.user.id;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: profile } = await admin.from("profiles").select("id").eq("user_id", createdUserId).maybeSingle();
      if (profile) { profileId = profile.id; break; }
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  try {
    if (!profileId) throw new HttpError(503, "Perfil ainda não disponível");
    const { error } = await admin.from("team_members").insert([...targets].sort().map(team_id => ({ team_id, profile_id: profileId, role: body.role })));
    if (error) {
      if (error.hint === "TEAM_MEMBER_LIMIT_REACHED") throw new CapacityError();
      throw new HttpError(409, "Não foi possível adicionar o membro. Atualize a equipe e tente novamente.");
    }
  } catch (error) {
    // Only clean up a user created by this request if no membership was saved.
    if (createdUserId && profileId) {
      const { count, error: countError } = await admin.from("team_members").select("id", { count: "exact", head: true }).eq("profile_id", profileId);
      if (!countError && count === 0) await admin.auth.admin.deleteUser(createdUserId);
    }
    if (error instanceof CapacityError) return json({ code: "TEAM_MEMBER_LIMIT_REACHED", error: error.message }, 409);
    throw error;
  }
  await admin.from("team_invites").insert(targets.map(team_id => ({ team_id, email, role: body.role, accepted: true })));
  return json({ success: true, already_member: false, teams_added: targets.length, total_teams: teamIds.length, is_new_user: Boolean(createdUserId) });
}
