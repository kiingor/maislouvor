import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseAdditionalAudioRequest } from "./request.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Não autorizado" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Não autorizado" }, 401);
    let input;
    try { input = parseAdditionalAudioRequest(await req.json()); }
    catch { return json({ error: "Informe a música, o nome e um link válido do YouTube." }, 400); }

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: song, error: songError } = await userClient.from("songs")
      .select("id, team_id").eq("id", input.songId).single();
    if (songError || !song) return json({ error: "Música não encontrada" }, 404);
    const { data: allowed, error: permissionError } = await userClient.rpc("can_edit_song_audio", {
      p_song_id: song.id,
    });
    if (permissionError || !allowed) return json({ error: "Sem permissão para editar esta música" }, 403);

    // Retry only failed entries; a repeat request cannot enqueue a running job.
    if (input.attachmentId) {
      const { data: retried, error } = await admin.from("song_audio_attachments")
        .update({ status: "queued", error: null, claimed_at: null })
        .eq("id", input.attachmentId).eq("song_id", song.id).eq("status", "error")
        .eq("youtube_url", input.url).select("id").maybeSingle();
      if (error) throw error;
      if (!retried) return json({ error: "Esta importação não pode ser reiniciada agora." }, 409);
      return json({ success: true, id: retried.id });
    }

    const { data: attachment, error } = await admin.from("song_audio_attachments")
      .insert({ song_id: song.id, title: input.title, youtube_url: input.url, status: "queued" })
      .select("id").single();
    if (error || !attachment) throw error || new Error("Insert failed");
    return json({ success: true, id: attachment.id });
  } catch (error) {
    console.error("import-song-audio failed", error);
    return json({ error: "Não foi possível iniciar a importação. Tente novamente." }, 500);
  }
});
