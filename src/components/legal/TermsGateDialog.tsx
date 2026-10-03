import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { acceptCurrentTerms, isOutdatedTermsError, termsAcceptanceQueryKey } from "@/integrations/supabase/legal-client";
import { APP_NAME, clearPendingAcceptance, formatLegalDate, LEGAL_EFFECTIVE_DATE, LEGAL_PATHS } from "@/lib/legal";

const LINK = "font-semibold text-primary underline underline-offset-[3px]";

/**
 * Pedido de aceite que não se fecha (sem Esc, sem tocar fora): a pessoa aceita
 * ou sai da conta. Os links abrem os documentos — páginas públicas, fora do
 * bloqueio — e Voltar traz de volta para cá.
 */
export default function TermsGateDialog({ userId, updated }: { userId: string; updated: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"accept" | "signout" | null>(null);

  const accept = async () => {
    setBusy("accept");
    try {
      const record = await acceptCurrentTerms();
      clearPendingAcceptance();
      queryClient.setQueryData(termsAcceptanceQueryKey(userId), record);
    } catch (error) {
      toast({
        title: "Não foi possível registrar o aceite",
        description: isOutdatedTermsError(error)
          ? "Os documentos foram atualizados. Atualize o app (ou recarregue a página) para ler a versão mais recente."
          : "Confira sua conexão e tente de novo.",
        variant: "destructive",
      });
      setBusy(null);
    }
  };

  const signOut = async () => {
    setBusy("signout");
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  return (
    <AlertDialog open>
      <AlertDialogContent className="w-[340px]" onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{updated ? "Atualizamos nossos termos" : "Termos de Uso e Privacidade"}</AlertDialogTitle>
          <AlertDialogDescription>
            Para continuar usando o {APP_NAME}, leia e aceite os{" "}
            <Link to={LEGAL_PATHS.terms} className={LINK}>
              Termos de Uso
            </Link>{" "}
            e a{" "}
            <Link to={LEGAL_PATHS.privacy} className={LINK}>
              Política de Privacidade
            </Link>
            .
          </AlertDialogDescription>
          <p className="mt-1 text-caption1 text-muted-foreground">Versão de {formatLegalDate(LEGAL_EFFECTIVE_DATE)}</p>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col">
          <AlertDialogAction
            disabled={busy !== null}
            aria-busy={busy === "accept" || undefined}
            onClick={(e) => {
              e.preventDefault();
              void accept();
            }}
          >
            {busy === "accept" && <Loader2 className="animate-spin" aria-hidden="true" />}
            Aceitar e continuar
          </AlertDialogAction>
          <AlertDialogCancel
            disabled={busy !== null}
            onClick={(e) => {
              e.preventDefault();
              void signOut();
            }}
          >
            Sair
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
