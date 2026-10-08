const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

/** Responde a clientes antigos sem ler, registrar ou enviar o conteúdo recebido. */
export function retiredMusicAi(req: Request): Response {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  return new Response(JSON.stringify({
    error: "Este recurso foi removido do +Louvor. Você pode continuar cadastrando músicas e cifras manualmente.",
    code: "FEATURE_REMOVED",
  }), {
    status: 410,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
  });
}
