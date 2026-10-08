import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const storageKey = "maislouvor-native-google-oauth";
const verifierKey = `${storageKey}-code-verifier`;

/** Only the PKCE verifier survives a cold launch. Sessions use the main client's
 * storage (including Face ID), never this OAuth-only client. Keeping this client
 * separate also preserves cross-device email confirmation and password reset. */
export const nativeOAuthStorage = {
  getItem: (key: string) => key === verifierKey ? localStorage.getItem(key) : null,
  setItem: (key: string, value: string) => { if (key === verifierKey) localStorage.setItem(key, value); },
  removeItem: (key: string) => { if (key === verifierKey) localStorage.removeItem(key); },
};
let client: ReturnType<typeof createClient> | undefined;
export function getNativeGoogleOAuth() {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { storageKey, storage: nativeOAuthStorage, flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client.auth;
}

export async function exchangeNativeGoogleCode(code: string) {
  const result = await getNativeGoogleOAuth().exchangeCodeForSession(code);
  if (result.error || !result.data.session) return result;
  const { access_token, refresh_token } = result.data.session;
  return supabase.auth.setSession({ access_token, refresh_token });
}
