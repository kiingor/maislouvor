import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Loader2, TicketX } from "lucide-react";
import { AuthAppIcon, AuthScreen, ProminentButton } from "./Login";
import { LegalConsentNotice } from "@/components/legal/LegalConsent";

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [status, setStatus] = useState<"loading" | "accepting" | "success" | "error" | "login">("loading");

  useEffect(() => {
    const checkAndAccept = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setStatus("login");
        return;
      }

      setStatus("accepting");

      const { data, error } = await supabase.functions.invoke("accept-invite", {
        body: { token },
      });

      if (error || data?.error) {
        setStatus("error");
        toast({ title: "Erro ao aceitar convite", description: data?.error ?? error?.message, variant: "destructive" });
      } else {
        setStatus("success");
        toast({ title: "Convite aceito!" });
        setTimeout(() => navigate("/app/repertorios"), 1500);
      }
    };

    checkAndAccept();
  }, [token]);

  return (
    <AuthScreen className="items-center text-center">
      <div className="w-full max-w-sm animate-in-up">
        <AuthAppIcon className="mx-auto" />
        <h1 className="mt-5 text-large-title">+Louvor</h1>

        <div className="mt-10" aria-live="polite">
          {status === "loading" || status === "accepting" ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
              <p className="text-subhead text-muted-foreground">Processando convite...</p>
            </div>
          ) : status === "success" ? (
            <div className="flex flex-col items-center">
              <CheckCircle2 className="h-12 w-12 text-ios-green" strokeWidth={2} aria-hidden="true" />
              <h2 className="mt-4 text-title3">Bem-vindo à equipe!</h2>
              <p className="mt-1 text-subhead text-muted-foreground">Redirecionando...</p>
            </div>
          ) : status === "login" ? (
            <div>
              <h2 className="text-title3">Faça login para continuar</h2>
              <p className="mt-1 text-subhead text-muted-foreground">
                Você precisa estar logado para aceitar o convite.
              </p>
              <div className="mt-8 space-y-3">
                <ProminentButton type="button" onClick={() => navigate(`/login?redirect=/invite/${token}`)}>
                  Entrar
                </ProminentButton>
                <ProminentButton type="button" variant="gray" onClick={() => navigate(`/signup?redirect=/invite/${token}`)}>
                  Criar conta
                </ProminentButton>
              </div>
              <LegalConsentNotice className="mt-4" />
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <TicketX className="h-12 w-12 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
              <h2 className="mt-4 text-title3">Convite inválido</h2>
              <p className="mt-1 text-subhead text-muted-foreground">
                Este convite não existe ou já foi utilizado.
              </p>
              <ProminentButton type="button" onClick={() => navigate("/login")} className="mt-8">
                Ir para login
              </ProminentButton>
            </div>
          )}
        </div>
      </div>
    </AuthScreen>
  );
}
