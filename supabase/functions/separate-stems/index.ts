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
    const workerUrl = (Deno.env.get("WORKER_URL") ?? "https://demucs.maislouvor.com").replace(/\/$/, "");
    const workerToken = Deno.env.get("WORKER_TOKEN")!;
    const callbackToken = Deno.env.get("STEMS_CALLBACK_TOKEN")!;
    if (!workerToken || !callbackToken) return json({ error: "Worker not configured" }, 500);

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

    // Signed URL so the worker can fetch the audio (6h covers a busy queue)
    const { data: signed, error: signErr } = await admin.storage
      .from("audio")
      .createSignedUrl(audio_path, 21600);
    if (signErr || !signed?.signedUrl) return json({ error: "Could not sign audio URL" }, 500);

    // Kick off the separation job on the worker
    const workerRes = await fetch(`${workerUrl}/jobs`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        callback_url: `${supabaseUrl}/functions/v1/stems-callback`,
        callback_token: callbackToken,
        meta: { song_id: song.id, team_id: song.team_id },
      }),
    });
    if (!workerRes.ok) {
      const text = await workerRes.text();
      console.error("worker error", workerRes.status, text);
      return json({ error: "Worker rejected the job" }, 502);
    }
    const { job_id } = await workerRes.json();
    if (!job_id) {
      console.error("worker returned no job_id");
      return json({ error: "Worker did not return a job id" }, 502);
    }

    await admin
      .from("songs")
      .update({ stems_status: "processing", stems_job_id: job_id, stems_error: null } as any)
      .eq("id", song.id);

    return json({ success: true, job_id });
  } catch (err) {
    console.error("separate-stems error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
