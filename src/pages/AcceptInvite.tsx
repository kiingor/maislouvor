import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-in-up">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-foreground flex items-center justify-center mb-4">
            <span className="text-background text-xl font-bold">+L</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">+Louvor</h1>
        </div>

        <GlassCard className="p-8 text-center">
          {status === "loading" || status === "accepting" ? (
            <>
              <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Processando convite...</p>
            </>
          ) : status === "success" ? (
            <>
              <h2 className="text-lg font-semibold mb-2">Bem-vindo à equipe!</h2>
              <p className="text-sm text-muted-foreground">Redirecionando...</p>
            </>
          ) : status === "login" ? (
            <>
              <h2 className="text-lg font-semibold mb-2">Faça login para continuar</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Você precisa estar logado para aceitar o convite.
              </p>
              <div className="space-y-2">
                <Button className="w-full rounded-xl" onClick={() => navigate(`/login?redirect=/invite/${token}`)}>
                  Entrar
                </Button>
                <Button variant="outline" className="w-full rounded-xl" onClick={() => navigate(`/signup?redirect=/invite/${token}`)}>
                  Criar conta
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-2">Convite inválido</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Este convite não existe ou já foi utilizado.
              </p>
              <Button className="rounded-xl" onClick={() => navigate("/login")}>Ir para login</Button>
            </>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
