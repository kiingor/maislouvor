import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchTermsAcceptance, termsAcceptanceQueryKey } from "@/integrations/supabase/legal-client";
import { clearPendingAcceptance, hasCurrentAcceptance } from "@/lib/legal";

/**
 * Sessão atual, sem depender do resto do app (o TermsGate fica fora das rotas).
 * Ao sair da conta, descarta o aceite anotado no cadastro: ele não vale para a
 * próxima pessoa que entrar no aparelho.
 */
function useLegalSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "SIGNED_OUT") clearPendingAcceptance();
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return session;
}

/** Aceite gravado no perfil de quem está logado. Mesma consulta em todo o app (uma ida ao servidor). */
export function useTermsAcceptance(enabled = true) {
  const session = useLegalSession();
  const userId = session?.user?.id ?? null;
  const query = useQuery({
    queryKey: termsAcceptanceQueryKey(userId),
    queryFn: () => fetchTermsAcceptance(userId as string),
    enabled: enabled && !!userId,
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return { session, userId, query };
}

/**
 * O pedido de aceite dos Termos já saiu (ou não vai aparecer) para esta sessão?
 * true com o aceite vigente gravado, sem perfil ou quando a leitura falha (o
 * TermsGate libera o app nesses casos); false sem sessão e enquanto o aceite
 * estiver pendente ou carregando.
 *
 * Outros avisos que abrem sozinhos no app logado (ex.: o aviso de IA do Asafe,
 * AssistantConsentGate) devem esperar por isto, para nunca abrirem junto com o
 * pedido de aceite:
 *   const termsAccepted = useTermsAccepted();
 *   useQuery({ ..., enabled: Boolean(profileId) && termsAccepted });
 *   if (!termsAccepted) return null;
 */
export function useTermsAccepted(): boolean {
  const { userId, query } = useTermsAcceptance();
  if (!userId) return false;
  if (query.isError) return true;
  return query.isSuccess && (!query.data || hasCurrentAcceptance(query.data));
}
