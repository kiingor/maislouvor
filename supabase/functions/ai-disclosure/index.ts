import { aiDisclosure, authenticatedAiUser } from "../_shared/aiConsent.ts";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    if (!await authenticatedAiUser(req)) return json({ error: "unauthorized" }, 401);
    return json(await aiDisclosure());
  } catch { return json({ error: "ai_disclosure_unconfigured" }, 503); }
});
