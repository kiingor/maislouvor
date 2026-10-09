// The deployed worker uses the durable pull queue. Legacy push callbacks carry a
// different worker ID, with no trusted queue/revision mapping. They cannot safely
// finalize a song and are intentionally retired. The v2 worker calls the guarded
// finish_stem_job RPC after staging every output file.
const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json" },
});
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
Deno.serve((req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = Deno.env.get("STEMS_CALLBACK_TOKEN");
  if (!token) return json({ error: "Service unavailable" }, 503);
  if (!safeEqual(req.headers.get("Authorization") ?? "", `Bearer ${token}`)) {
    return json({ error: "Unauthorized" }, 401);
  }
  return json({ error: "Legacy callback retired; use the versioned pull worker." }, 410);
});
