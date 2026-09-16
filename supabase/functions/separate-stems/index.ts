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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the calling user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerUserId = claimsData.claims.sub as string;

    const { song_id, audio_path } = await req.json();
    if (!song_id || !audio_path) return json({ error: "song_id and audio_path are required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    // Load the song and confirm the caller belongs to its team
    const { data: song } = await admin
      .from("songs")
      .select("id, team_id, audio_path")
      .eq("id", song_id)
      .single();
    if (!song) return json({ error: "Song not found" }, 404);

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("user_id", callerUserId)
      .single();
    if (!callerProfile) return json({ error: "Forbidden" }, 403);

    const { data: membership } = await admin
      .from("team_members")
      .select("id")
      .eq("team_id", song.team_id)
      .eq("profile_id", callerProfile.id)
      .maybeSingle();
    if (!membership) return json({ error: "Forbidden" }, 403);

    // The audio must belong to THIS song's storage namespace (not just the team)
    if (!String(audio_path).startsWith(`${song.team_id}/${song.id}`)) {
      return json({ error: "audio_path does not belong to this song" }, 400);
    }

    // Enqueue a separation job. A worker (home GPU first, VPS CPU as fallback) will
    // pull it from the queue — so the job survives restarts and waits for a worker.
    // Drop any earlier still-queued job for this song to avoid duplicates.
    await admin.from("stem_jobs").delete().eq("song_id", song.id).eq("status", "queued");

    const { data: jobRow, error: insErr } = await admin
      .from("stem_jobs")
      .insert({ song_id: song.id, team_id: song.team_id, audio_path })
      .select("id")
      .single();
    if (insErr || !jobRow) {
      console.error("enqueue failed", insErr);
      return json({ error: "Could not enqueue the job" }, 500);
    }

    await admin
      .from("songs")
      .update({ stems_status: "processing", stems_job_id: jobRow.id, stems_error: null } as any)
      .eq("id", song.id);

    return json({ success: true, job_id: jobRow.id, queued: true });
  } catch (err) {
    console.error("separate-stems error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
