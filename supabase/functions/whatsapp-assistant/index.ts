// Webhook da Evolution API para o assistente do +Louvor nos grupos do WhatsApp.
//
// URL: /functions/v1/whatsapp-assistant/<WHATSAPP_WEBHOOK_SECRET>
// A Evolution não assina os webhooks; o segredo no caminho é a autenticação
// (VERIFY_JWT está desligado no edge-runtime da VPS). A Evolution chama pela
// rede interna; chamadas manuais pela URL pública devem mandar o segredo no
// cabeçalho x-webhook-secret, para ele não ficar no log de acesso do Caddy.
//
// Variáveis de ambiente (além das do Supabase):
//   ASSISTANT_OPENAI_API_KEY        chave da API da OpenAI só do assistente (custo separado)
//   ASSISTANT_AI_BASE_URL           opcional; padrão https://api.openai.com/v1
//   WHATSAPP_WEBHOOK_SECRET         segredo do caminho do webhook
//   WHATSAPP_EVOLUTION_URL          ex.: http://talitha-cume-evolution-1:8080
//   WHATSAPP_EVOLUTION_INSTANCE     ex.: maislouvor
//   WHATSAPP_EVOLUTION_APIKEY       token da instância (não a chave global)
//   WHATSAPP_EVOLUTION_ORIGIN       origem do CORS_ORIGIN da Evolution (a da VPS exige)
//   WHATSAPP_BOT_NUMBER             opcional; número do assistente (só dígitos)
//
// Responde 202 na hora e processa em segundo plano (EdgeRuntime.waitUntil),
// para a Evolution não esperar a IA.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createEvolutionClient } from "./evolution.ts";
import { createHandler } from "./handler.ts";
import { createOpenAi } from "./openai.ts";
import { createNotificationDispatcher } from "./notifications.ts";

const env = (name: string) => Deno.env.get(name)?.trim() ?? "";

const WEBHOOK_SECRET = env("WHATSAPP_WEBHOOK_SECRET");
const INSTANCE = env("WHATSAPP_EVOLUTION_INSTANCE");

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const whatsapp = createEvolutionClient({
  baseUrl: env("WHATSAPP_EVOLUTION_URL"),
  instance: INSTANCE,
  apiKey: env("WHATSAPP_EVOLUTION_APIKEY"),
  origin: env("WHATSAPP_EVOLUTION_ORIGIN") || undefined,
});
const dispatchNotifications = createNotificationDispatcher({ rpc, whatsapp });
const handle = createHandler({
  rpc,
  whatsapp,
  // Modelo e esforço de raciocínio vêm de assistant_config a cada pergunta.
  ask: createOpenAi({
    apiKey: env("ASSISTANT_OPENAI_API_KEY"),
    baseUrl: env("ASSISTANT_AI_BASE_URL") || "https://api.openai.com/v1",
  }),
  botNumber: env("WHATSAPP_BOT_NUMBER") || null,
});

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const secret = req.headers.get("x-webhook-secret") ?? new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (!WEBHOOK_SECRET || !sameSecret(secret, WEBHOOK_SECRET)) return json({ error: "not_found" }, 404);

  // Checagem de saúde no deploy: confirma segredo e configuração, sem expor nada.
  if (req.method === "GET") {
    return json({
      ok: true,
      evolution: Boolean(env("WHATSAPP_EVOLUTION_URL") && INSTANCE && env("WHATSAPP_EVOLUTION_APIKEY")),
      openai: Boolean(env("ASSISTANT_OPENAI_API_KEY")),
    });
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Chamado pelo timer, com o MESMO segredo do webhook no cabeçalho. Não
  // depende de alguém falar no grupo, de o app estar aberto ou da OpenAI.
  if (new URL(req.url).pathname.endsWith("/notifications")) {
    try {
      return json({ ok: true, ...await dispatchNotifications() });
    } catch {
      console.error("[whatsapp-assistant] falha ao consumir fila de avisos");
      return json({ error: "notification_dispatch_failed" }, 503);
    }
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const instance = (payload as { instance?: unknown } | null)?.instance;
  if (INSTANCE && typeof instance === "string" && instance !== INSTANCE) return json({ ok: true, ignored: "instance" });

  const work = handle(payload).catch((error) => console.error("[whatsapp-assistant] falha:", error));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (typeof runtime?.waitUntil === "function") {
    runtime.waitUntil(work);
    return json({ ok: true }, 202);
  }
  await work;
  return json({ ok: true });
});
