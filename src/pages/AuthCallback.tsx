import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BrandMark } from "@/components/BrandMark";

/**
 * Destino do redirect do OAuth (Google). No web, o supabase-js processa o token
 * que volta no fragmento da URL automaticamente (detectSessionInUrl); aqui só
 * esperamos a sessão aparecer e seguimos pro app — evitando a corrida com o AuthGuard.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let done = false;
    const go = (path: string) => {
      if (done) return;
      done = true;
      navigate(path, { replace: true });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) go("/app/home");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go("/app/home");
    });

    // Fallback: se em alguns segundos não houver sessão, volta pro login.
    const t = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) go("/app/home");
      else { setErro(true); go("/login"); }
    }, 4000);

    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <div className="h-14 w-14 rounded-2xl bg-foreground flex items-center justify-center">
        <BrandMark className="h-8 w-8 text-background" />
      </div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 rounded-full border-2 border-foreground/30 border-t-transparent animate-spin" />
        {erro ? "Não foi possível entrar. Redirecionando..." : "Entrando..."}
      </div>
    </div>
  );
}
