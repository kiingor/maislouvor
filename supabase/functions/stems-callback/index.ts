import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  errorResponse,
  HttpError,
  isUuid,
  json,
  readJsonBody,
  requiredEnv,
  requirePost,
} from "../_shared/security.ts";

const STEMS = [
  { key: "vocals", label: "Vocais" },
  { key: "drums", label: "Bateria" },
  { key: "bass", label: "Baixo" },
  { key: "guitar", label: "Guitarra" },
  { key: "piano", label: "Teclado" },
  { key: "other", label: "Outros" },
] as const;

const safeEqual = (left: string, right: string) => {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
};

const requireStrongSecret = (name: string) => {
  const value = requiredEnv(name);
  if (value.length < 32) {
    throw new HttpError(503, `${name} precisa ter pelo menos 32 caracteres`);
  }
  return value;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);

    // Validate every secret before constructing an expected Authorization value
    // or creating a service-role client. Missing configuration fails closed.
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const callbackToken = requireStrongSecret("STEMS_CALLBACK_TOKEN");
    const workerToken = requireStrongSecret("WORKER_TOKEN");
    const workerUrl =
      (Deno.env.get("WORKER_URL")?.trim() || "https://demucs.maislouvor.com")
        .replace(/\/$/, "");

    const authorization = req.headers.get("Authorization") ?? "";
    if (!safeEqual(authorization, `Bearer ${callbackToken}`)) {
      throw new HttpError(401, "Não autorizado");
    }

    const body = await readJsonBody(req, 16_384);
    const jobId = body.job_id;
    const status = body.status;
    const meta = body.meta;
    if (!isUuid(jobId)) throw new HttpError(400, "job_id inválido");
    if (status !== "done" && status !== "error" && status !== "failed") {
      throw new HttpError(400, "status inválido");
    }
    if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
      throw new HttpError(400, "meta inválido");
    }

    const songId = (meta as Record<string, unknown>).song_id;
    const teamId = (meta as Record<string, unknown>).team_id;
    if (!isUuid(songId) || !isUuid(teamId)) {
      throw new HttpError(400, "meta inválido");
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: song, error: songError } = await admin
      .from("songs")
      .select("id, team_id, stems_job_id, stems_status")
      .eq("id", songId)
      .maybeSingle();

    if (songError) throw new HttpError(503, "Não foi possível validar o job");
    if (
      !song ||
      song.team_id !== teamId ||
      song.stems_job_id !== jobId ||
      song.stems_status !== "processing"
    ) {
      throw new HttpError(
        409,
        "Callback não corresponde ao job ativo da música",
      );
    }

    const updateActiveSong = (values: Record<string, unknown>) =>
      admin
        .from("songs")
        .update(values)
        .eq("id", song.id)
        .eq("team_id", song.team_id)
        .eq("stems_job_id", jobId)
        .eq("stems_status", "processing");

    if (status !== "done") {
      const workerError = typeof body.error === "string"
        ? body.error.slice(0, 300)
        : "worker reported failure";
      await updateActiveSong({
        stems_status: "error",
        stems_error: workerError,
      });
      return json({ ok: true });
    }

    const stems = body.stems;
    const allowedStemKeys = new Set(STEMS.map((stem) => stem.key));
    if (
      !Array.isArray(stems) ||
      stems.length < 1 ||
      stems.length > STEMS.length ||
      stems.some((stem) =>
        typeof stem !== "string" ||
        !allowedStemKeys.has(stem as typeof STEMS[number]["key"])
      )
    ) {
      await updateActiveSong({
        stems_status: "error",
        stems_error: "Lista de faixas inválida",
      });
      throw new HttpError(400, "stems inválido");
    }

    const available = new Set(stems as string[]);
    const prefix = `${song.team_id}/${song.id}/stems`;

    const { error: deleteError } = await admin
      .from("song_tracks")
      .delete()
      .eq("song_id", song.id)
      .like("audio_path", `${prefix}/%`);
    if (deleteError) {
      throw new HttpError(503, "Não foi possível preparar as faixas");
    }

    let stored = 0;
    let workerAuthFailed = false;
    const failed: string[] = [];

    for (const { key, label } of STEMS) {
      if (!available.has(key)) continue;

      const response = await fetch(`${workerUrl}/jobs/${jobId}/stems/${key}`, {
        headers: { Authorization: `Bearer ${workerToken}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 401 || response.status === 403) {
        workerAuthFailed = true;
        break;
      }
      if (!response.ok) {
        failed.push(key);
        continue;
      }

      const declaredSize = Number(
        response.headers.get("Content-Length") ?? "0",
      );
      if (Number.isFinite(declaredSize) && declaredSize > 250_000_000) {
        failed.push(key);
        continue;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > 250_000_000) {
        failed.push(key);
        continue;
      }

      const path = `${prefix}/${key}.mp3`;
      const { error: uploadError } = await admin.storage
        .from("audio")
        .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
      if (uploadError) {
        failed.push(key);
        continue;
      }

      const { error: insertError } = await admin.from("song_tracks").insert({
        song_id: song.id,
        track_name: label,
        audio_path: path,
        sort_order: stored,
      });
      if (insertError) {
        failed.push(key);
        continue;
      }
      stored++;
    }

    if (workerAuthFailed || stored === 0) {
      const message = workerAuthFailed
        ? "Falha de autenticação com o worker"
        : "Não foi possível salvar as faixas";
      await updateActiveSong({ stems_status: "error", stems_error: message });
      throw new HttpError(502, message);
    }

    const { data: completed, error: completeError } = await updateActiveSong({
      stems_status: "done",
      stems_error: failed.length
        ? `Algumas faixas falharam: ${failed.join(", ")}`
        : null,
    }).select("id").maybeSingle();

    if (completeError || !completed) {
      throw new HttpError(409, "O job deixou de ser o processamento ativo");
    }
    return json({ ok: true, tracks: stored, failed });
  } catch (error) {
    console.error("stems-callback error", error);
    return errorResponse(error);
  }
});
