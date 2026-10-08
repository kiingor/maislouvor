export const NATIVE_AUTH_CALLBACK = "com.maislouvor.app://auth/callback";

type AuthResult = { data: { session: unknown }; error: unknown };
type NativeAuthClient = {
  exchangeCodeForSession(code: string): Promise<AuthResult>;
};

export function isNativeAuthCallback(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "com.maislouvor.app:" && url.host === "auth" &&
      url.pathname === "/callback" && !url.username && !url.password;
  } catch { return false; }
}

/** Only a verified, persisted session can complete the native callback. */
export async function completeNativeAuth(url: string, auth: NativeAuthClient) {
  if (!isNativeAuthCallback(url)) return false;
  const parsed = new URL(url);
  const fragment = new URLSearchParams(parsed.hash.slice(1));
  if (parsed.searchParams.has("error") || fragment.has("error")) {
    throw new Error("O login não foi concluído. Tente novamente.");
  }
  const code = parsed.searchParams.get("code");
  // Never accept arbitrary bearer tokens from another app via a custom scheme.
  // PKCE requires the private verifier saved by the app that began Google login.
  const result = code ? await auth.exchangeCodeForSession(code) : null;
  if (!result || result.error || !result.data.session) {
    throw new Error("Não foi possível confirmar seu login. Tente novamente.");
  }
  return true;
}
