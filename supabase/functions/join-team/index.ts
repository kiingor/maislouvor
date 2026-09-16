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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { code } = await req.json();
    if (!code) return json({ ok: false, error: "code required" }, 400);

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1) Cria a solicitação como o próprio usuário (a RPC usa auth.uid()).
    const { data: result, error: rpcErr } = await userClient.rpc("request_team_join", { p_code: code });
    if (rpcErr) return json({ ok: false, error: rpcErr.message }, 500);
    // Só notifica quando virou um pedido PENDENTE (não em "já é membro" ou código inválido).
    if (!result?.ok || result.status !== "pending") return json(result);

    // 2) Notifica os líderes da equipe (in-app + push).
    const admin = createClient(supabaseUrl, serviceKey);
    const teamId = result.team_id as string;
    const teamName = (result.team_name as string) || "a equipe";

    // Nome de quem está pedindo
    const { data: claims } = await userClient.auth.getClaims(token);
    const requesterUserId = claims?.claims?.sub as string | undefined;
    let requesterName = "Alguém";
    let requesterProfileId: string | null = null;
    if (requesterUserId) {
      const { data: rp } = await admin.from("profiles").select("id, full_name").eq("user_id", requesterUserId).single();
      if (rp) { requesterName = (rp as any).full_name || "Alguém"; requesterProfileId = (rp as any).id; }
    }

    // Líderes (admins) da equipe
    const { data: admins } = await admin
      .from("team_members").select("profile_id").eq("team_id", teamId).eq("role", "admin");
    const adminIds = (admins ?? []).map((a: any) => a.profile_id);
    if (adminIds.length === 0) return json(result);

    const title = "🙋 Novo pedido pra entrar na equipe";
    const body = `${requesterName} quer entrar em ${teamName}. Toque pra aprovar.`;
    const link = "/app/settings";

    // Notificação in-app (sino)
    try {
      await admin.from("notifications").insert(
        adminIds.map((pid: string) => ({
          profile_id: pid, type: "join_request", title, body, link,
          team_id: teamId, sender_profile_id: requesterProfileId,
        })),
      );
    } catch (e) { console.error("join in-app notif failed", e); }

    // Push (chamada interna confiável ao send-push com a service role)
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, apikey: serviceKey },
        body: JSON.stringify({
          team_id: teamId,
          recipients: adminIds.map((pid: string) => ({ profile_id: pid, title, body, link })),
        }),
      });
    } catch (e) { console.error("join push failed", e); }

    return json(result);
  } catch (err) {
    console.error("join-team error", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
