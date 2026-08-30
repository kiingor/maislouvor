import {
  corsHeaders,
  errorResponse,
  json,
  requireAuthenticated,
  requirePost,
} from "../_shared/security.ts";

// Team administrators must never mutate another member's global Supabase
// identity. Password recovery and profile changes are self-service flows.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    requirePost(req);
    await requireAuthenticated(req);
    return json(
      {
        error:
          "Esta operação foi desativada. Cada usuário deve editar o próprio perfil ou recuperar a própria senha.",
      },
      410,
    );
  } catch (error) {
    console.error("admin-update-user error", error);
    return errorResponse(error);
  }
});
