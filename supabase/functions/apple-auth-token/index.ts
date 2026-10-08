import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encryptAppleToken, exchangeAppleCode } from "../_shared/appleTokens.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return json({ error: "unauthorized" }, 401);
    const subjects = (user.identities ?? []).filter((i) => i.provider === "apple")
      .map((i) => i.identity_data?.sub).filter((v): v is string => typeof v === "string");
    const body = await req.json();
    if (typeof body.authorizationCode !== "string" || !subjects.length) return json({ error: "invalid_apple_credential" }, 400);
    const token = await exchangeAppleCode(body.authorizationCode, subjects);
    const encrypted = await encryptAppleToken(token, user.id);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { error: saveError } = await admin.from("apple_auth_tokens").upsert({ user_id: user.id, encrypted, revoked_at: null, updated_at: new Date().toISOString() });
    if (saveError) throw new Error("apple_token_storage_failed");
    return json({ ok: true });
  } catch {
    // Não expõe respostas do OAuth, identidades ou segredos.
    return json({ error: "apple_token_setup_failed", message: "Não foi possível preparar sua conta Apple. Tente novamente." }, 503);
  }
});
