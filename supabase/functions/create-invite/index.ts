import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify calling user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, team_id, role, password, full_name } = await req.json();
    if (!email || !team_id || !role) {
      return new Response(JSON.stringify({ error: "email, team_id and role are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);
    const normalizedEmail = email.trim().toLowerCase();

    // Check if calling user is admin of this team
    const callerUserId = claimsData.claims.sub as string;
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", callerUserId)
      .single();

    if (!callerProfile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerMember } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", team_id)
      .eq("profile_id", callerProfile.id)
      .single();

    if (!callerMember || callerMember.role !== "admin") {
      return new Response(JSON.stringify({ error: "Only admins can invite" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to find existing user by email
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create user with the password provided by the admin
      const userPassword = password && password.length >= 6 ? password : crypto.randomUUID() + "Aa1!";
      const userName = full_name || normalizedEmail.split("@")[0];
      const { data: newUser, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        password: userPassword,
        email_confirm: true,
        user_metadata: { full_name: userName },
      });

      if (createError || !newUser?.user) {
        return new Response(
          JSON.stringify({ error: createError?.message || "Failed to create user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = newUser.user.id;
    }

    // Get or wait for profile (trigger creates it)
    let profile: { id: string } | null = null;
    for (let i = 0; i < 5; i++) {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("user_id", userId)
        .single();
      if (data) {
        profile = data;
        break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!profile) {
      return new Response(JSON.stringify({ error: "Profile not created" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update full_name on profile if provided
    if (full_name) {
      await admin.from("profiles").update({ full_name }).eq("id", profile.id);
    }

    // Check if already a member
    const { data: existingMember } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", team_id)
      .eq("profile_id", profile.id)
      .single();

    if (existingMember) {
      return new Response(
        JSON.stringify({ success: true, already_member: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add as team member directly
    const { error: memberError } = await admin
      .from("team_members")
      .insert({ team_id, profile_id: profile.id, role });

    if (memberError) {
      return new Response(JSON.stringify({ error: memberError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create invite record as accepted
    await admin.from("team_invites").insert({
      team_id,
      email: normalizedEmail,
      role,
      accepted: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        already_member: false,
        is_new_user: !existingUser,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
