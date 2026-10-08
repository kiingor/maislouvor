import { useQueryClient } from "@tanstack/react-query";
import { BiometricSession, sessionStorageKey } from "@/lib/biometricStorage";
import { clearLocalAccountData } from "@/lib/accountDeletion";
import { useEffect } from "react";
import { AppleSignIn, isAppleSignInAvailable } from "@/lib/appleSignIn";
import { supabase } from "@/integrations/supabase/client";
/** Apple revogou o acesso nos Ajustes: a sessão local precisa terminar também. */
export function AppleRevocationHandler() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!isAppleSignInAvailable()) return;
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    void AppleSignIn.addListener("credentialsRevoked", () => {
      void (async () => {
        const { data } = await supabase.auth.getSession();
        if (!data.session || data.session.user.identities?.some((identity) => identity.provider === "apple")) {
          // A sessão pode estar oculta pelo Face ID: revogação também a apaga bloqueada.
          await BiometricSession.clear({ key: sessionStorageKey });
          clearLocalAccountData(data.session?.user.id);
          await supabase.auth.signOut({ scope: "local" });
          queryClient.clear();
          window.dispatchEvent(new Event("faceid-status-changed"));
        }
      })().catch(() => {});
    }).then((listener) => {
      if (disposed) void listener.remove(); else remove = () => listener.remove();
    }).catch(() => {});
    return () => { disposed = true; void remove?.(); };
  }, [queryClient]);
  return null;
}
