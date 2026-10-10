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

/** Extrai o ID de 11 chars de um link do YouTube (watch?v=, youtu.be/, embed/, shorts/, live/). */
function youtubeId(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const valid = (s: string | null | undefined) => (s && /^[A-Za-z0-9_-]{11}$/.test(s) ? s : null);
    if (host === "youtu.be" || host.endsWith(".youtu.be")) {
      return valid(u.pathname.split("/").filter(Boolean)[0]);
    }
    if (host.includes("youtube.com")) {
      const v = valid(u.searchParams.get("v"));
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const i = parts.findIndex((p) => ["embed", "shorts", "live", "v"].includes(p));
      if (i >= 0) return valid(parts[i + 1]);
    }
  } catch {
    /* ignore */
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const callerUserId = claimsData.claims.sub as string;

    const { song_id, url } = await req.json();
    if (!song_id || !url) return json({ error: "song_id and url are required" }, 400);

    let host = "";
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      return json({ error: "URL inválida" }, 400);
    }
    const isYoutube = host === "youtu.be" || host.endsWith(".youtu.be") || host.includes("youtube.com");
    if (!isYoutube) return json({ error: "Apenas links do YouTube são aceitos" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: song } = await admin
      .from("songs")
      .select("id, team_id")
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

    // ===== Acervo compartilhado: se este vídeo já foi baixado por qualquer conta,
    // copia o arquivo arquivado em vez de baixar de novo. =====
    const ytId = youtubeId(url);
    if (ytId) {
      const { data: cached } = await admin
        .from("yt_audio_cache")
        .select("storage_path, cover_path")
        .eq("youtube_id", ytId)
        .maybeSingle();
      if (cached?.storage_path) {
        const destKey = `${song.team_id}/${song.id}/recordings/${crypto.randomUUID()}.mp3`;
        // Each import has a new destination, so existing playback stays intact.
        const { error: copyErr } = await admin.storage.from("audio").copy(cached.storage_path, destKey);
        if (!copyErr) {
          const { error: updateError } = await admin.from("songs").update({ audio_path: destKey }).eq("id", song.id);
          if (updateError) throw new Error("Não foi possível salvar a gravação importada.");
          // Capa do acervo → define como capa da música, se ela ainda não tiver.
          if ((cached as any).cover_path) {
            const { data: songRow } = await admin.from("songs").select("cover_path").eq("id", song.id).single();
            if (!(songRow as any)?.cover_path) {
              const ext = (cached as any).cover_path.split(".").pop() || "jpg";
              const coverDest = `${song.team_id}/${song.id}.${ext}`;
              await admin.storage.from("covers").remove([coverDest]);
              const { error: cErr } = await admin.storage.from("covers").copy((cached as any).cover_path, coverDest);
              if (!cErr) await admin.from("songs").update({ cover_path: coverDest }).eq("id", song.id);
            }
          }
          // limpa qualquer job antigo deste song pra não confundir o polling
          await admin.from("yt_import_jobs").delete().eq("song_id", song.id).eq("status", "queued");
          return json({ success: true, cached: true });
        }
        // Cache obsoleto (arquivo sumiu): descarta a linha e segue pro download normal.
        console.warn("yt cache copy failed, dropping stale entry", ytId, copyErr.message);
        await admin.from("yt_audio_cache").delete().eq("youtube_id", ytId);
      }
    }

    // ===== Cache miss: enfileira o download como antes (o worker arquiva no acervo). =====
    await admin.from("yt_import_jobs").delete().eq("song_id", song.id).eq("status", "queued");

    const { data: jobRow, error: insErr } = await admin
      .from("yt_import_jobs")
      .insert({ song_id: song.id, team_id: song.team_id, url })
      .select("id")
      .single();
    if (insErr || !jobRow) {
      console.error("enqueue yt import failed", insErr);
      return json({ error: "Could not enqueue the import" }, 500);
    }

    return json({ success: true, job_id: jobRow.id, cached: false });
  } catch (err) {
    console.error("import-youtube error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
