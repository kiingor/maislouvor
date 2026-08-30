import {
  corsHeaders,
  errorResponse,
  json,
  requireAuthenticated,
  requirePost,
} from "../_shared/security.ts";

// A config entry existed without versioned source. Keep an explicit fail-closed
// handler so a deployment cannot retain an unknown/stale public implementation.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);
    await requireAuthenticated(req);
    return json({ error: "Função desativada" }, 410);
  } catch (error) {
    console.error("transcribe-sync error", error);
    return errorResponse(error);
  }
});
