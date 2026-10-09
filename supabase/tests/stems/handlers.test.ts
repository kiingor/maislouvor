// Execute real Edge entry points with fake Auth/RPC. No network permission needed.
let handler: (r: Request) => Response | Promise<Response>;
Object.defineProperty(Deno, "serve", { value: (h: typeof handler) => { handler = h; return {}; } });
const env: Record<string, string> = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "anon-fixture", STEMS_CALLBACK_TOKEN: "callback-fixture" };
Object.defineProperty(Deno.env, "get", { value: (k: string) => env[k] });
const song = "10000000-0000-4000-8000-000000000001", job = "20000000-0000-4000-8000-000000000001";
let authOk = true, rpcError: { code: string; message?: string } | null = null, calls: unknown[] = [];
(globalThis as any).mockCreateClient = (_url: string, key: string, options: any) => {
  if (key !== "anon-fixture" || options.global.headers.Authorization !== "Bearer fixture-user") throw Error("Wrong identity");
  return { auth: { getUser: async () => ({ data: { user: authOk ? { id: "actor" } : null }, error: null }) },
    rpc: async (name: string, args: unknown) => { calls.push({ name, args }); return { data: job, error: rpcError }; } };
};
await import("../../functions/separate-stems/index.ts"); const separate = handler!;
await import("../../functions/stems-callback/index.ts"); const callback = handler!;
const eq = (a: unknown, b: unknown) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const req = (body: unknown, token = "fixture-user", method = "POST") => new Request("https://fixture.invalid", { method, headers: { Authorization: `Bearer ${token}` }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) });
function reset() { authOk = true; rpcError = null; calls = []; }
Deno.test("authenticated separation uses only caller RPC with authoritative source check", async () => {
  reset(); const r = await separate(req({ song_id: song, audio_path: "team/song.mp3" })); eq(r.status, 200);
  eq(await r.json(), { success: true, job_id: job, queued: true });
  eq(calls, [{ name: "enqueue_stem_job", args: { p_song_id: song, p_audio_path: "team/song.mp3" } }]);
});
Deno.test("revoked/missing account cannot enqueue", async () => { reset(); authOk = false; eq((await separate(req({ song_id: song, audio_path: "a" }))).status, 401); eq(calls.length, 0); });
Deno.test("permission and stale source errors are fail closed", async () => {
  reset(); for (const [code, status] of [["42501", 403], ["22023", 409], ["OTHER", 503]] as const) {
    rpcError = { code, message: "SECRET MUST NOT APPEAR" }; const r = await separate(req({ song_id: song, audio_path: "a" }));
    eq(r.status, status); eq((await r.text()).includes("SECRET"), false);
  }
});
Deno.test("malformed requests and methods never invoke RPC", async () => {
  reset(); for (const body of [null, {}, { song_id: "../song", audio_path: "a" }, { song_id: song, audio_path: [] }]) eq((await separate(req(body))).status, 400);
  eq((await separate(req(null, "fixture-user", "GET"))).status, 405); eq(calls.length, 0);
});
Deno.test("legacy success/failure callback cannot download/delete/upload/update anything", async () => {
  reset(); for (const status of ["done", "error"]) eq((await callback(req({ job_id: "old", status, stems: ["vocals"], meta: { song_id: song } }, "callback-fixture"))).status, 410);
  eq(calls.length, 0);
});
Deno.test("callback missing secret does not authenticate literal undefined", async () => {
  delete env.STEMS_CALLBACK_TOKEN; eq((await callback(req({}, "undefined"))).status, 503);
  env.STEMS_CALLBACK_TOKEN = "callback-fixture"; eq((await callback(req({}, "wrong"))).status, 401);
});
