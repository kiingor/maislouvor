// Exclusão da própria conta (App Store 5.1.1(v) / Google Play).
//
// A conta é sempre a do JWT — nada no corpo diz quem excluir. O corpo só traz a
// confirmação digitada: { "confirmation": "EXCLUIR" }.
// Passos e respostas: ver flow.ts. Repetir a chamada é inofensivo: depois que a
// conta some, a sessão antiga recebe { ok: true, already_deleted: true }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  DELETE_CONFIRMATION,
  isDeletionConfirmed,
  runAccountDeletion,
  type DeleteDataResult,
  type DeletionPreview,
  type StorageObjectRef,
} from "./flow.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

/** O GoTrue responde assim quando o JWT é válido mas o usuário já foi apagado. */
const isMissingUser = (error: { status?: number; code?: string; message?: string }) =>
  error.code === "user_not_found" || /does not exist|not found/i.test(error.message ?? "");

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
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      if (authError && isMissingUser(authError)) return json({ ok: true, already_deleted: true, deleted_team_ids: [] });
      return json({ ok: false, error: "unauthorized", message: "Sua sessão expirou. Entre de novo para continuar." }, 401);
    }

    let body: unknown = null;
    try { body = await req.json(); } catch { /* corpo vazio ou inválido */ }
    if (!isDeletionConfirmed(body)) {
      return json({ ok: false, error: "confirmation_required", message: `Digite ${DELETE_CONFIRMATION} para confirmar.` }, 400);
    }

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const rpc = async <T>(fn: string): Promise<T> => {
      const { data, error } = await admin.rpc(fn, { p_user_id: user.id });
      if (error) throw error;
      return data as T;
    };

    const outcome = await runAccountDeletion(user.id, {
      preview: () => rpc<DeletionPreview>("account_deletion_preview_for"),
      listStorage: () => rpc<StorageObjectRef[]>("account_deletion_storage_objects"),
      removeStorage: async (bucket, paths) => {
        const { error } = await admin.storage.from(bucket).remove(paths);
        if (error) throw error;
      },
      deleteData: () => rpc<DeleteDataResult>("delete_account_data"),
      deleteAuthUser: async (id) => {
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error && !(error.status === 404 || isMissingUser(error))) throw error;
      },
      // Sem dados pessoais no log: só o passo e a mensagem técnica.
      log: (step, error) => console.error(`delete-account: ${step} failed`, (error as Error)?.message ?? error),
    });
    return json(outcome.body, outcome.status);
  } catch (error) {
    console.error("delete-account failed", (error as Error)?.message ?? error);
    return json({ ok: false, error: "unexpected", message: "Não foi possível excluir sua conta agora. Tente novamente." }, 500);
  }
});
