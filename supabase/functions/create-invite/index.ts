import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);

    const { email, team_id, team_ids, role, password, full_name } = await req.json();
    // Accept a single team_id (legacy) or a list of team_ids ("all teams").
    const teamIds: string[] = Array.isArray(team_ids) && team_ids.length
      ? [...new Set(team_ids)]
      : (team_id ? [team_id] : []);
    if (!email || teamIds.length === 0 || !role) {
      return json({ error: "email, team(s) and role are required" }, 400);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const normalizedEmail = email.trim().toLowerCase();

    // The caller must be an admin of EVERY target team.
    const callerUserId = claimsData.claims.sub as string;
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", callerUserId)
      .single();
    if (!callerProfile) return json({ error: "Profile not found" }, 403);

    const { data: callerMemberships } = await admin
      .from("team_members")
      .select("team_id, role")
      .eq("profile_id", callerProfile.id)
      .in("team_id", teamIds);
    const adminTeamIds = new Set(
      (callerMemberships ?? []).filter((m: any) => m.role === "admin").map((m: any) => m.team_id),
    );
    if (teamIds.some((tid) => !adminTeamIds.has(tid))) {
      return json({ error: "Only admins can invite to these teams" }, 403);
    }

    // Find or create the invited user (once).
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail,
    );

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const userPassword = password && password.length >= 6 ? password : crypto.randomUUID() + "Aa1!";
      const userName = full_name || normalizedEmail.split("@")[0];
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: userPassword,
        email_confirm: true,
        user_metadata: { full_name: userName },
      });
      if (createError || !newUser?.user) {
        return json({ error: createError?.message || "Failed to create user" }, 500);
      }
      userId = newUser.user.id;
    }

    // Wait for the profile (created by a trigger).
    let profile: { id: string } | null = null;
    for (let i = 0; i < 5; i++) {
      const { data } = await admin.from("profiles").select("id").eq("user_id", userId).single();
      if (data) { profile = data; break; }
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!profile) return json({ error: "Profile not created" }, 500);

    if (full_name) {
      await admin.from("profiles").update({ full_name }).eq("id", profile.id);
    }

    // Add membership to each target team (skip teams the user is already in).
    let added = 0;
    for (const tid of teamIds) {
      const { data: existingMember } = await admin
        .from("team_members")
        .select("id")
        .eq("team_id", tid)
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (existingMember) continue;

      const { error: memberError } = await admin
        .from("team_members")
        .insert({ team_id: tid, profile_id: profile.id, role });
      if (memberError) {
        return json({ error: memberError.message }, 500);
      }
      added++;
      await admin.from("team_invites").insert({ team_id: tid, email: normalizedEmail, role, accepted: true });
    }

    return json({
      success: true,
      already_member: added === 0,
      teams_added: added,
      total_teams: teamIds.length,
      is_new_user: !existingUser,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
