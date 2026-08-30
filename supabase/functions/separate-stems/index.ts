import {
  corsHeaders,
  enforceRateLimit,
  errorResponse,
  HttpError,
  isUuid,
  json,
  readJsonBody,
  requireAuthenticated,
  requiredEnv,
  requirePost,
  requireSongEditor,
  requireString,
  type SecurityContext,
} from "../_shared/security.ts";

const isSongAudioPath = (path: string, teamId: string, songId: string) => {
  const prefix = `${teamId}/${songId}`;
  return path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}/`);
};

const requireStrongSecret = (name: string) => {
  const secret = requiredEnv(name);
  if (secret.length < 32) {
    throw new HttpError(503, `${name} precisa ter pelo menos 32 caracteres`);
  }
  return secret;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let context: SecurityContext | null = null;
  let reservedSongId: string | null = null;

  try {
    requirePost(req);
    context = await requireAuthenticated(req);
    const body = await readJsonBody(req, 8_192);
    const song = await requireSongEditor(context, body.song_id);
    await enforceRateLimit(context, "separate-stems", song.team_id, 3, 1_800);

    const audioPath = requireString(body.audio_path, "audio_path", {
      max: 1_024,
    });
    if (
      audioPath !== song.audio_path ||
      !isSongAudioPath(audioPath, song.team_id, song.id)
    ) {
      throw new HttpError(
        400,
        "audio_path não corresponde ao áudio atual da música",
      );
    }
    if (song.stems_status === "processing") {
      throw new HttpError(409, "A separação desta música já está em andamento");
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const workerToken = requireStrongSecret("WORKER_TOKEN");
    const callbackToken = requireStrongSecret("STEMS_CALLBACK_TOKEN");
    const workerUrl =
      (Deno.env.get("WORKER_URL")?.trim() || "https://demucs.maislouvor.com")
        .replace(/\/$/, "");

    let parsedWorkerUrl: URL;
    try {
      parsedWorkerUrl = new URL(workerUrl);
    } catch {
      throw new HttpError(503, "WORKER_URL inválida");
    }
    if (
      parsedWorkerUrl.protocol !== "https:" &&
      parsedWorkerUrl.hostname !== "localhost"
    ) {
      throw new HttpError(503, "WORKER_URL deve usar HTTPS");
    }

    const { data: reserved, error: reserveError } = await context.admin
      .from("songs")
      .update({
        stems_status: "processing",
        stems_job_id: null,
        stems_error: null,
      })
      .eq("id", song.id)
      .or("stems_status.is.null,stems_status.neq.processing")
      .select("id")
      .maybeSingle();

    if (reserveError) {
      throw new HttpError(503, "Não foi possível reservar o processamento");
    }
    if (!reserved) {
      throw new HttpError(409, "A separação desta música já está em andamento");
    }
    reservedSongId = song.id;

    const { data: signed, error: signError } = await context.admin.storage
      .from("audio")
      .createSignedUrl(song.audio_path, 21_600);
    if (signError || !signed?.signedUrl) {
      throw new HttpError(503, "Não foi possível assinar o áudio");
    }

    const workerResponse = await fetch(`${workerUrl}/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${workerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: signed.signedUrl,
        callback_url: `${supabaseUrl}/functions/v1/stems-callback`,
        callback_token: callbackToken,
        meta: { song_id: song.id, team_id: song.team_id },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!workerResponse.ok) {
      const responseText = (await workerResponse.text()).slice(0, 1_000);
      console.error("worker rejected job", workerResponse.status, responseText);
      throw new HttpError(502, "O worker rejeitou o processamento");
    }

    const workerBody = await workerResponse.json();
    const jobId = workerBody?.job_id;
    if (!isUuid(jobId)) {
      throw new HttpError(502, "O worker retornou um job inválido");
    }

    const { data: linked, error: linkError } = await context.admin
      .from("songs")
      .update({ stems_job_id: jobId })
      .eq("id", song.id)
      .eq("team_id", song.team_id)
      .eq("stems_status", "processing")
      .is("stems_job_id", null)
      .select("id")
      .maybeSingle();

    if (linkError || !linked) {
      throw new HttpError(409, "O job não pôde ser vinculado à música");
    }
    reservedSongId = null;
    return json({ success: true, job_id: jobId });
  } catch (error) {
    console.error("separate-stems error", error);
    if (context && reservedSongId) {
      const message = error instanceof HttpError
        ? error.message
        : "Falha ao iniciar separação";
      await context.admin
        .from("songs")
        .update({
          stems_status: "error",
          stems_job_id: null,
          stems_error: message.slice(0, 500),
        })
        .eq("id", reservedSongId)
        .eq("stems_status", "processing")
        .is("stems_job_id", null);
    }
    return errorResponse(error);
  }
});
