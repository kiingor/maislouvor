import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type SecurityContext = {
  // Edge Functions intentionally use the dynamic PostgREST schema. Supplying
  // the frontend-generated Database type here would couple deployments to a
  // potentially stale generated file.
  admin: any;
  userId: string;
  email: string | null;
  profileId: string;
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });

export const errorResponse = (error: unknown) => {
  if (error instanceof HttpError) {
    return json({ error: error.message }, error.status);
  }
  return json({ error: "Erro interno do servidor" }, 500);
};

export const requirePost = (req: Request) => {
  if (req.method !== "POST") throw new HttpError(405, "Método não permitido");
};

export const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, `${name} não está configurado`);
  return value;
};

export const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

export const requireString = (
  value: unknown,
  field: string,
  options: { min?: number; max: number },
) => {
  if (typeof value !== "string") throw new HttpError(400, `${field} inválido`);
  const trimmed = value.trim();
  if (trimmed.length < (options.min ?? 1) || trimmed.length > options.max) {
    throw new HttpError(
      400,
      `${field} deve ter entre ${options.min ?? 1} e ${options.max} caracteres`,
    );
  }
  return trimmed;
};

export const readJsonBody = async (
  req: Request,
  maxBytes: number,
): Promise<Record<string, unknown>> => {
  const declaredLength = Number(req.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, "Payload muito grande");
  }

  if (!req.body) throw new HttpError(400, "Corpo JSON obrigatório");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Payload muito grande");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "JSON inválido");
  }
};

export const readResponseText = async (
  response: Response,
  maxBytes: number,
) => {
  const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(502, "Resposta remota muito grande");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(502, "Resposta remota muito grande");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};

export const requireAuthenticated = async (
  req: Request,
): Promise<SecurityContext> => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new HttpError(401, "Não autenticado");
  }

  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) throw new HttpError(401, "Não autenticado");

  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: claimsData, error: claimsError } = await userClient.auth
    .getClaims(token);
  const userId = claimsData?.claims?.sub;
  const email = typeof claimsData?.claims?.email === "string"
    ? claimsData.claims.email
    : null;

  if (claimsError || typeof userId !== "string" || !isUuid(userId)) {
    throw new HttpError(401, "Token inválido ou expirado");
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (profileError) {
    throw new HttpError(503, "Não foi possível validar o perfil");
  }
  if (!profile?.id) throw new HttpError(403, "Perfil não encontrado");

  return { admin, userId, email, profileId: profile.id };
};

export const requireTeamEditor = async (
  context: SecurityContext,
  teamId: unknown,
) => {
  if (!isUuid(teamId)) throw new HttpError(400, "team_id inválido");

  const { data: membership, error } = await context.admin
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("profile_id", context.profileId)
    .in("role", ["admin", "editor"])
    .maybeSingle();

  if (error) throw new HttpError(503, "Não foi possível validar a permissão");
  if (!membership) throw new HttpError(403, "Permissão de edição necessária");
  return teamId;
};

export const requireSongEditor = async (
  context: SecurityContext,
  songId: unknown,
) => {
  if (!isUuid(songId)) throw new HttpError(400, "song_id inválido");

  const { data: song, error } = await context.admin
    .from("songs")
    .select("id, team_id, audio_path, stems_status, stems_job_id")
    .eq("id", songId)
    .maybeSingle();

  if (error) throw new HttpError(503, "Não foi possível validar a música");
  if (!song) throw new HttpError(404, "Música não encontrada");

  await requireTeamEditor(context, song.team_id);
  return song;
};

export const requireCultoEditor = async (
  context: SecurityContext,
  cultoId: unknown,
) => {
  if (!isUuid(cultoId)) throw new HttpError(400, "culto_id inválido");

  const { data: culto, error } = await context.admin
    .from("cultos")
    .select("id, team_id")
    .eq("id", cultoId)
    .maybeSingle();

  if (error) throw new HttpError(503, "Não foi possível validar o culto");
  if (!culto) throw new HttpError(404, "Culto não encontrado");

  await requireTeamEditor(context, culto.team_id);
  return culto;
};

export const enforceRateLimit = async (
  context: SecurityContext,
  scope: string,
  resourceId: string,
  limit: number,
  windowSeconds: number,
) => {
  const rateKey = `${scope}:${context.userId}:${resourceId}`;
  const { data, error } = await context.admin.rpc("consume_edge_rate_limit", {
    _rate_key: rateKey,
    _limit: limit,
    _window_seconds: windowSeconds,
  });

  if (error) {
    console.error("rate limit unavailable", scope, error.message);
    throw new HttpError(503, "Controle de uso temporariamente indisponível");
  }
  if (data !== true) {
    throw new HttpError(
      429,
      "Limite de requisições excedido. Tente novamente mais tarde.",
    );
  }
};
