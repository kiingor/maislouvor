import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

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

interface Recipient {
  profile_id: string;
  title: string;
  body?: string | null;
  link?: string | null;
}

// ===== FCM (HTTP v1) helpers =====
function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const der = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) der[i] = raw.charCodeAt(i);
  return der;
}
let cachedToken: { token: string; exp: number } | null = null;
async function fcmAccessToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.token;
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claim = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: sa.token_uri || "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  const jwt = `${signingInput}.${b64url(sig)}`;
  const resp = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const j = await resp.json();
  if (!j.access_token) throw new Error("FCM token error: " + JSON.stringify(j));
  cachedToken = { token: j.access_token, exp: now + 3500 };
  return j.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Web Push (VAPID)
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:contato@maislouvor.com";
    const webEnabled = !!(vapidPublic && vapidPrivate);
    if (webEnabled) webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!);

    // FCM (service account)
    let fcmSa: any = null;
    const saB64 = Deno.env.get("FCM_SERVICE_ACCOUNT_B64");
    if (saB64) {
      try {
        fcmSa = JSON.parse(atob(saB64));
      } catch (e) {
        console.error("FCM service account parse error", e);
      }
    }

    const { team_id, recipients } = (await req.json()) as { team_id: string; recipients: Recipient[] };
    if (!team_id || !Array.isArray(recipients) || recipients.length === 0) {
      return json({ error: "team_id and recipients are required" }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Membros da equipe — recipients só podem ser membros.
    const { data: teamMembers } = await admin
      .from("team_members").select("profile_id").eq("team_id", team_id);
    const memberIds = new Set((teamMembers ?? []).map((m: any) => m.profile_id));

    // Chamada interna confiável (service role) — ex.: join-team notificando os líderes
    // sobre um pedido de entrada (o solicitante ainda não é membro). Caso contrário,
    // exige que o CHAMADOR seja membro da equipe.
    const token = authHeader.replace("Bearer ", "");
    if (token !== serviceKey) {
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
      const callerUserId = claimsData.claims.sub as string;
      const { data: callerProfile } = await admin
        .from("profiles").select("id").eq("user_id", callerUserId).single();
      if (!callerProfile || !memberIds.has(callerProfile.id)) return json({ error: "Forbidden" }, 403);
    }

    const targets = recipients.filter((r) => r.profile_id && memberIds.has(r.profile_id));
    if (targets.length === 0) return json({ success: true, sent: 0 });

    const profileIds = [...new Set(targets.map((r) => r.profile_id))];

    // Carrega assinaturas web + tokens FCM
    const [{ data: subs }, { data: tokens }] = await Promise.all([
      admin.from("push_subscriptions").select("id, profile_id, endpoint, p256dh, auth").in("profile_id", profileIds),
      admin.from("device_tokens").select("id, profile_id, token").in("profile_id", profileIds),
    ]);

    const subsByProfile = new Map<string, any[]>();
    for (const s of subs ?? []) {
      const arr = subsByProfile.get(s.profile_id) ?? [];
      arr.push(s); subsByProfile.set(s.profile_id, arr);
    }
    const tokensByProfile = new Map<string, any[]>();
    for (const t of tokens ?? []) {
      const arr = tokensByProfile.get(t.profile_id) ?? [];
      arr.push(t); tokensByProfile.set(t.profile_id, arr);
    }

    let fcmAccess: string | null = null;
    if (fcmSa) {
      try { fcmAccess = await fcmAccessToken(fcmSa); } catch (e) { console.error("FCM auth failed", e); }
    }

    let sent = 0;
    const deadSubs: string[] = [];
    const deadTokens: string[] = [];

    await Promise.all(
      targets.flatMap((r) => {
        const payload = { title: r.title, body: r.body ?? "", link: r.link ?? "/app/home" };
        const jobs: Promise<void>[] = [];

        // Web Push
        if (webEnabled) {
          for (const s of subsByProfile.get(r.profile_id) ?? []) {
            jobs.push(
              webpush
                .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload))
                .then(() => { sent++; })
                .catch((err: any) => {
                  const code = err?.statusCode;
                  if (code === 404 || code === 410) deadSubs.push(s.id);
                }),
            );
          }
        }

        // FCM nativo
        if (fcmAccess && fcmSa) {
          for (const t of tokensByProfile.get(r.profile_id) ?? []) {
            jobs.push(
              (async () => {
                const resp = await fetch(
                  `https://fcm.googleapis.com/v1/projects/${fcmSa.project_id}/messages:send`,
                  {
                    method: "POST",
                    headers: { Authorization: `Bearer ${fcmAccess}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                      message: {
                        token: t.token,
                        notification: { title: payload.title, body: payload.body },
                        data: { link: payload.link },
                        android: { priority: "high", notification: { default_sound: true } },
                      },
                    }),
                  },
                );
                if (resp.ok) sent++;
                else if (resp.status === 404) deadTokens.push(t.id);
              })().catch((e) => console.error("fcm send error", e)),
            );
          }
        }
        return jobs;
      }),
    );

    if (deadSubs.length) await admin.from("push_subscriptions").delete().in("id", deadSubs);
    if (deadTokens.length) await admin.from("device_tokens").delete().in("id", deadTokens);

    return json({ success: true, sent, prunedWeb: deadSubs.length, prunedFcm: deadTokens.length });
  } catch (err) {
    console.error("send-push error", err);
    return json({ error: (err as Error).message }, 500);
  }
});
