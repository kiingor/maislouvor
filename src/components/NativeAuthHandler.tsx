import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { exchangeNativeGoogleCode } from "@/lib/nativeGoogleOAuth";
import { useToast } from "@/hooks/use-toast";
import { completeNativeAuth, isNativeAuthCallback } from "@/lib/nativeAuth";
import { consumeAuthRedirect } from "@/lib/authRedirect";

// Face ID unmounts private routes while locked. Keep delivery history for the
// app process so getLaunchUrl cannot replay an already-consumed OAuth code.
const handledCallbacks = new Set<string>();

export function NativeAuthHandler() {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let disposed = false;
    let remove: (() => Promise<void>) | undefined;
    void (async () => {
      const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
      if (disposed) return;
      const handle = async ({ url }: { url: string }) => {
        if (disposed || !isNativeAuthCallback(url) || handledCallbacks.has(url)) return;
        handledCallbacks.add(url);
        try {
          await completeNativeAuth(url, { exchangeCodeForSession: exchangeNativeGoogleCode });
          if (!disposed) navigate(consumeAuthRedirect(new URLSearchParams(window.location.search).get("redirect"), true), { replace: true });
        } catch {
          if (!disposed) toast({ title: "Não foi possível entrar", description: "O login não foi concluído. Tente novamente.", variant: "destructive" });
        } finally {
          try { await Browser.close(); } catch { /* The browser may already have been dismissed. */ }
        }
      };
      const listener = await App.addListener("appUrlOpen", handle);
      if (disposed) { await listener.remove(); return; }
      remove = () => listener.remove();
      const launch = await App.getLaunchUrl();
      if (launch) await handle(launch);
    })().catch(() => {
      if (!disposed) toast({ title: "Login indisponível", description: "Feche e abra o app para tentar novamente.", variant: "destructive" });
    });
    return () => { disposed = true; void remove?.(); };
  }, [navigate, toast]);
  return null;
}
