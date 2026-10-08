import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

interface AppleCredential { identityToken: string; nonce: string; authorizationCode: string; fullName?: string }
export const AppleSignIn = registerPlugin<{ authorize(): Promise<AppleCredential>; addListener(event: "credentialsRevoked", handler: () => void): Promise<PluginListenerHandle> }>("AppleSignIn");

export const isAppleSignInAvailable = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
export const isAppleSignInCancelled = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error && error.code === "CANCELED";

export async function signInWithApple() {
  if (!isAppleSignInAvailable()) throw new Error("Disponível no app para iPhone e iPad.");
  const credential = await AppleSignIn.authorize();
  if (!credential.identityToken || !credential.nonce) throw new Error("A Apple não confirmou o login.");
  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple", token: credential.identityToken, nonce: credential.nonce,
  });
  if (error || !data.session || !data.user) throw new Error("Não foi possível confirmar o login com a Apple. Tente novamente.");

  const saved = await supabase.functions.invoke("apple-auth-token", { body: { authorizationCode: credential.authorizationCode } });
  if (saved.error || !saved.data?.ok) {
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("Não foi possível preparar sua conta Apple. Tente novamente em instantes.");
  }

  // Apple supplies the name only on the first authorization, outside the ID token.
  // Do not overwrite a name already chosen by an existing account.
  const fullName = credential.fullName?.trim();
  let nameSaved = true;
  if (fullName && !data.user.user_metadata?.full_name && !data.user.user_metadata?.name) {
    try {
      const metadata = await supabase.auth.updateUser({ data: { full_name: fullName } });
      const profile = await supabase.from("profiles").select("full_name").eq("user_id", data.user.id).maybeSingle();
      nameSaved = !metadata.error && !profile.error;
      const previousName = profile.data?.full_name;
      if (profile.data && (!previousName || previousName === data.user.email?.split("@")[0])) {
        const update = supabase.from("profiles").update({ full_name: fullName }).eq("user_id", data.user.id);
        const saved = previousName === null ? await update.is("full_name", null) : await update.eq("full_name", previousName);
        nameSaved = nameSaved && !saved.error;
      }
    } catch { nameSaved = false; }
  }
  return { nameSaved };
}
