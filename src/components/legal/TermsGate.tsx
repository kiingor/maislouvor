import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { acceptCurrentTerms, fetchTermsAcceptance, termsAcceptanceQueryKey } from "@/integrations/supabase/legal-client";
import {
  clearPendingAcceptance,
  hasCurrentAcceptance,
  hasPendingAcceptance,
  metadataHasCurrentAcceptance,
  requiresTermsAcceptance,
} from "@/lib/legal";

// O diálogo só é baixado quando falta aceite (quase nunca depois do primeiro acesso).
const TermsGateDialog = lazy(() => import("./TermsGateDialog"));

/**
 * Bloqueia o app logado (/app e /admin) até a pessoa aceitar as versões vigentes
 * dos Termos de Uso e da Política de Privacidade. Montado uma vez em App.tsx,
 * fora das rotas: páginas públicas (login, cadastro, convite, links públicos e
 * os próprios documentos) nunca são bloqueadas.
 *
 * Quem já aceitou no cadastro (caixa marcada ou "Ao continuar com o Google"),
 * mas ainda não tinha sessão para gravar, tem o aceite registrado aqui sem
 * ver o pedido de novo. Se o servidor não responder, o app segue liberado: o
 * bloqueio volta na próxima abertura.
 */
export function TermsGate() {
  const { pathname } = useLocation();
  const gated = requiresTermsAcceptance(pathname);
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;
  const acceptance = useQuery({
    queryKey: termsAcceptanceQueryKey(userId),
    queryFn: () => fetchTermsAcceptance(userId as string),
    enabled: gated && !!userId,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const outdated = gated && !!userId && acceptance.isSuccess && !!acceptance.data && !hasCurrentAcceptance(acceptance.data);

  // Para quem o aceite prévio (do cadastro) já foi verificado.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const autoAccepting = useRef(false);
  const metadata = session?.user?.user_metadata;

  useEffect(() => {
    if (!outdated || !userId || checkedFor === userId || autoAccepting.current) return;
    if (!hasPendingAcceptance() && !metadataHasCurrentAcceptance(metadata)) {
      setCheckedFor(userId);
      return;
    }
    autoAccepting.current = true;
    acceptCurrentTerms()
      .then((record) => {
        clearPendingAcceptance();
        queryClient.setQueryData(termsAcceptanceQueryKey(userId), record);
      })
      .catch(() => {
        /* não gravou: o pedido de aceite aparece normalmente */
      })
      .finally(() => {
        autoAccepting.current = false;
        setCheckedFor(userId);
      });
  }, [outdated, userId, checkedFor, metadata, queryClient]);

  if (!outdated || checkedFor !== userId) return null;

  return (
    <Suspense fallback={null}>
      <TermsGateDialog userId={userId} updated={!!acceptance.data?.terms_version} />
    </Suspense>
  );
}
