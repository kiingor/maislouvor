import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
export async function aiDisclosure() {
  const provider = Deno.env.get("AI_PROVIDER_NAME")?.trim();
  const privacyUrl = Deno.env.get("AI_PROVIDER_PRIVACY_URL")?.trim();
  const location = Deno.env.get("AI_PROVIDER_COUNTRY")?.trim();
  const retention = Deno.env.get("AI_PROVIDER_RETENTION")?.trim();
  if (!provider || !privacyUrl?.startsWith("https://") || !location || !retention) throw new Error("ai_disclosure_unconfigured");
  const disclosure = { provider, privacyUrl, location, retention,
    dataSent: "O texto que você informar, títulos, artistas, letras, cifras e tema do culto necessários para esta solicitação. Não inclua dados pessoais de outras pessoas.",
    purpose: "Sugerir repertórios ou organizar letras e cifras. O resultado pode conter erros; revise antes de usar." };
  // Mudar provedor, modelo, rota ou texto invalida consentimentos de telas antigas.
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify({ ...disclosure,
    baseUrl: Deno.env.get("AI_BASE_URL") || "https://iarouter.softcomia.com/v1", model: Deno.env.get("AI_MODEL") || "cerebras/gpt-oss-120b" })));
  return { ...disclosure, version: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("") };
}
export async function authenticatedAiUser(req: Request) {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  return !error && !!data.user;
}
export async function requireAiConsent(req: Request, body: Record<string, unknown>, cors: Record<string, string>) {
  const fail = (status: number, error: string) => new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method !== "POST") return fail(405, "Método não permitido.");
  if (!await authenticatedAiUser(req)) return fail(401, "Entre na sua conta para continuar.");
  try {
    const disclosure = await aiDisclosure();
    const consent = body.aiConsent as { accepted?: unknown; version?: unknown } | undefined;
    if (consent?.accepted !== true || consent.version !== disclosure.version) return fail(428, "Leia e autorize o envio de dados à IA antes de continuar.");
    return null;
  } catch {
    return fail(503, "Este recurso de IA aguarda a configuração das informações de privacidade.");
  }
}
