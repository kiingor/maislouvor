// Suspender ou reativar uma conta (só administradores da plataforma, pelo painel).
//
// Corpo: { "profile_id": "<uuid>", "action": "suspend" | "reactivate",
//          "reason"?: "<até 500>", "report_id"?: "<uuid da denúncia>" }.
// Quem chama é sempre o usuário do JWT, conferido como administrador da
// plataforma aqui e de novo no banco. Passos e respostas: ver flow.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  parseSuspensionRequest,
  runSuspension,
  SUSPENSION_BAN_DURATION,
  type SuspensionRecord,
  type SuspensionTarget,
} from "./flow.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed", message: "Método não permitido." }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return json({ ok: false, error: "unauthorized", message: "Entre na sua conta para continuar." }, 401);
    }
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ ok: false, error: "unauthorized", message: "Sua sessão expirou. Entre de novo para continuar." }, 401);
    }
    const { data: isAdmin, error: adminError } = await userClient.rpc("is_platform_admin");
    if (adminError || isAdmin !== true) {
      return json({ ok: false, error: "forbidden", message: "Acesso restrito ao administrador da plataforma." }, 403);
    }

    let body: unknown = null;
    try { body = await req.json(); } catch { /* corpo vazio ou inválido */ }
    const request = parseSuspensionRequest(body);
    if (!request) {
      return json({ ok: false, error: "invalid", message: "Pedido inválido: informe a conta e a ação (suspender ou reativar)." }, 400);
    }

    const outcome = await runSuspension(user.id, request, {
      target: async (actorUserId, profileId) => {
        const { data, error } = await admin.rpc("platform_account_suspension_target", {
          p_actor_user_id: actorUserId,
          p_profile_id: profileId,
        });
        if (error) throw error;
        return data as SuspensionTarget;
      },
      setBan: async (userId, banned) => {
        const { error } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: banned ? SUSPENSION_BAN_DURATION : "none",
        });
        if (error) throw error;
      },
      record: async (actorUserId, r) => {
        const { data, error } = await admin.rpc("platform_record_account_suspension", {
          p_actor_user_id: actorUserId,
          p_profile_id: r.profileId,
          p_suspended: r.action === "suspend",
          p_reason: r.reason,
          p_report_id: r.reportId,
        });
        if (error) throw error;
        return data as SuspensionRecord;
      },
      // Sem dados pessoais no log: só o passo e a mensagem técnica.
      log: (step, error) => console.error(`platform-suspend-account: ${step} failed`, (error as Error)?.message ?? error),
    });
    return json(outcome.body, outcome.status);
  } catch (error) {
    console.error("platform-suspend-account failed", (error as Error)?.message ?? error);
    return json({ ok: false, error: "unexpected", message: "Não foi possível concluir agora. Tente novamente." }, 500);
  }
});
