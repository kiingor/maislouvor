import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) return json({ error: "Service unavailable" }, 503);
  try {
    const client = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data, error: authError } = await client.auth.getUser();
    if (authError || !data.user) return json({ error: "Unauthorized" }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body || typeof body.song_id !== "string" || !uuid.test(body.song_id) ||
      typeof body.audio_path !== "string" || !body.audio_path || body.audio_path.length > 2048) {
      return json({ error: "song_id and audio_path are required" }, 400);
    }
    // The authenticated RPC checks current membership, consent, moderation and
    // exact source, then snapshots the revision and publishes the queue atomically.
    const { data: jobId, error } = await client.rpc("enqueue_stem_job", {
      p_song_id: body.song_id, p_audio_path: body.audio_path,
    });
    if (error) {
      if (error.code === "42501") return json({ error: "Sem permissão para separar esta música." }, 403);
      if (error.code === "22023") return json({ error: "A gravação mudou. Atualize a música antes de separar." }, 409);
      console.error("separate-stems enqueue failed", error.code);
      return json({ error: "Não foi possível iniciar a separação." }, 503);
    }
    if (typeof jobId !== "string" || !uuid.test(jobId)) return json({ error: "Invalid queue response" }, 503);
    return json({ success: true, job_id: jobId, queued: true });
  } catch {
    return json({ error: "Não foi possível iniciar a separação." }, 503);
  }
});
