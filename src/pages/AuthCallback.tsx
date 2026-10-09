import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authPageUrl, consumeAuthRedirect } from "@/lib/authRedirect";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthAppIcon, AuthScreen } from "./Login";

/**
 * Destino do redirect do OAuth (Google). No web, o supabase-js processa o token
 * que volta no fragmento da URL automaticamente (detectSessionInUrl); aqui só
 * esperamos a sessão aparecer e seguimos pro app — evitando a corrida com o AuthGuard.
 * Visual de tela de abertura: ícone do app + indicador de atividade.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let done = false;
    const go = (authenticated: boolean) => {
      if (done) return;
      done = true;
      const destination = consumeAuthRedirect(new URLSearchParams(search).get("redirect"));
      navigate(authenticated ? destination : authPageUrl("/login", destination), { replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go(true);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go(true);
    });

    // Fallback: se em alguns segundos não houver sessão, volta pro login.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) go(true);
      else { setErro(true); go(false); }
    }, 4000);

    return () => { done = true; sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [navigate, search]);

  return (
    <AuthScreen className="items-center">
      <AuthAppIcon />
      <div className="mt-6 flex items-center gap-2 text-subhead text-muted-foreground" role="status">
        <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
        {erro ? "Não foi possível entrar. Redirecionando..." : "Entrando..."}
      </div>
    </AuthScreen>
  );
}
