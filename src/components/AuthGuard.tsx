import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { TeamDataConsentGate } from "@/components/legal/TeamDataConsentGate";
import { supabase } from "@/integrations/supabase/client";

export function AuthGuard({ children, requireTeamConsent = true }: { children: React.ReactNode; requireTeamConsent?: boolean }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session) {
          setUserId(null);
          navigate("/login", { replace: true });
        } else {
          setUserId(session.user.id);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
          setUserId(null);
        navigate("/login", { replace: true });
      } else {
        setUserId(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  if (loading) {
    return (
      // Indicador de atividade do iOS (raios), discreto sobre o fundo do sistema.
      <div role="status" className="flex min-h-dvh items-center justify-center bg-background">
        <Loader className="size-7 animate-spin text-muted-foreground motion-reduce:animate-none" strokeWidth={2.25} aria-hidden="true" />
        <span className="sr-only">Carregando…</span>
      </div>
    );
  }

  if (!userId) return null;

  return requireTeamConsent ? <TeamDataConsentGate key={userId} userId={userId}>{children}</TeamDataConsentGate> : <>{children}</>;
}
