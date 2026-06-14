import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Demucs stem key -> label + display order, mirrors the worker
const STEMS: { key: string; label: string }[] = [
  { key: "vocals", label: "Vocais" },
  { key: "drums", label: "Bateria" },
  { key: "bass", label: "Baixo" },
  { key: "guitar", label: "Guitarra" },
  { key: "piano", label: "Teclado" },
  { key: "other", label: "Outros" },
];

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const workerUrl = (Deno.env.get("WORKER_URL") ?? "https://demucs.maislouvor.com").replace(/\/$/, "");
    const workerToken = Deno.env.get("WORKER_TOKEN")!;
    const callbackToken = Deno.env.get("STEMS_CALLBACK_TOKEN")!;

    // Authenticate the worker's callback
    const auth = req.headers.get("Authorization") ?? "";
    if (!safeEqual(auth, `Bearer ${callbackToken}`)) return json({ error: "Unauthorized" }, 401);

    const { job_id, status, stems, meta } = await req.json();
    const songId = meta?.song_id;
    const teamId = meta?.team_id;
    if (!songId || !teamId) return json({ error: "missing meta" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    if (status !== "done") {
      await admin
        .from("songs")
        .update({ stems_status: "error", stems_error: "worker reported failure" } as any)
        .eq("id", songId);
      return json({ ok: true });
    }

    if (!Array.isArray(stems) || stems.length === 0) {
      await admin
        .from("songs")
        .update({ stems_status: "error", stems_error: "Nenhuma faixa retornada" } as any)
        .eq("id", songId);
      return json({ ok: false, error: "no stems" }, 400);
    }

    const available = new Set<string>(stems);
    const prefix = `${teamId}/${songId}/stems`;

    // Replace any previous auto-generated stems for this song (keep manual tracks)
    await admin.from("song_tracks").delete().eq("song_id", songId).like("audio_path", `${prefix}/%`);

    let stored = 0;
    let authFailed = false;
    const failed: string[] = [];
    for (const { key, label } of STEMS) {
      if (!available.has(key)) continue;
      const res = await fetch(`${workerUrl}/jobs/${job_id}/stems/${key}`, {
        headers: { Authorization: `Bearer ${workerToken}` },
      });
      if (res.status === 401 || res.status === 403) {
        authFailed = true;
        break;
      }
      if (!res.ok) {
        console.error("fetch stem failed", key, res.status);
        failed.push(key);
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const path = `${prefix}/${key}.mp3`;
      const { error: upErr } = await admin.storage
        .from("audio")
        .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      if (upErr) {
        console.error("upload failed", key, upErr.message);
        failed.push(key);
        continue;
      }
      const { error: insErr } = await admin.from("song_tracks").insert({
        song_id: songId,
        track_name: label,
        audio_path: path,
        sort_order: stored,
      } as any);
      if (insErr) {
        console.error("insert track failed", key, insErr.message);
        failed.push(key);
        continue;
      }
      stored++;
    }

    // Never report success if nothing actually got stored
    if (authFailed || stored === 0) {
      await admin
        .from("songs")
        .update({
          stems_status: "error",
          stems_error: authFailed ? "Falha de autenticação com o worker" : "Não foi possível salvar as faixas",
        } as any)
        .eq("id", songId);
      return json({ ok: false, error: authFailed ? "worker auth failed" : "no stems stored" }, 502);
    }

    await admin
      .from("songs")
      .update({
        stems_status: "done",
        stems_error: failed.length ? `Algumas faixas falharam: ${failed.join(", ")}` : null,
      } as any)
      .eq("id", songId);

    return json({ ok: true, tracks: stored, failed });
  } catch (err) {
    console.error("stems-callback error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
