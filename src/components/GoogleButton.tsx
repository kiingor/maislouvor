import { NATIVE_AUTH_CALLBACK } from "@/lib/nativeAuth";
import { getNativeGoogleOAuth } from "@/lib/nativeGoogleOAuth";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { rememberAuthRedirect, safeAppRedirect } from "@/lib/authRedirect";
import { Capacitor } from "@capacitor/core";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/** Logo "G" oficial do Google (4 cores — exigência da marca, não recolorir). */
function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.82-.07-1.6-.21-2.36H12v4.46h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.75z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.92l-3.88-3.02c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.12A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.25a7.2 7.2 0 0 1 0-4.5V6.63H1.27a12 12 0 0 0 0 10.74l4-3.12z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.27 6.63l4 3.12C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

/**
 * Botão "Entrar/Cadastrar com Google". Redireciona pro fluxo OAuth do Supabase
 * (provider precisa estar habilitado no GoTrue do self-host).
 * Visual: cápsula secundária de 50pt com contorno fino (HIG > Buttons), largura total.
 */
export function GoogleButton({ label = "Continuar com Google", onStart }: {
  label?: string;
  /** Chamado antes de sair para o Google (ex.: o cadastro guarda o aceite dos termos). */
  onStart?: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const { search } = useLocation();

  const handle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      onStart?.();
      const native = Capacitor.isNativePlatform();
      rememberAuthRedirect(safeAppRedirect(new URLSearchParams(search).get("redirect")), native);
      const auth = native ? getNativeGoogleOAuth() : supabase.auth;
      const { data, error } = await auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: native ? NATIVE_AUTH_CALLBACK : `${window.location.origin}/auth/callback`,
          skipBrowserRedirect: native,
        },
      });
      if (error || !data?.url) throw error ?? new Error("Login indisponível");
      if (native) {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
      }
    } catch {
      toast({ title: "Erro ao entrar com Google", description: "Não foi possível abrir o login. Tente novamente.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={loading}
      aria-busy={loading || undefined}
      className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-full border border-separator bg-card px-5 text-headline text-foreground transition-[background-color,transform] duration-200 hover:bg-fill-quaternary active:scale-[0.98] disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-[18px] w-[18px] animate-spin text-muted-foreground" aria-hidden="true" />
      ) : (
        <GoogleLogo className="shrink-0" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}
