import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { acceptCurrentTerms, termsAcceptanceQueryKey } from "@/integrations/supabase/legal-client";
import {
  clearPendingAcceptance,
  hasCurrentAcceptance,
  hasPendingAcceptance,
  metadataHasCurrentAcceptance,
  requiresTermsAcceptance,
} from "@/lib/legal";
import { useTermsAcceptance } from "./useTermsAcceptance";

// O diálogo só é baixado quando falta aceite (quase nunca depois do primeiro acesso).
const TermsGateDialog = lazy(() => import("./TermsGateDialog"));

/**
 * Bloqueia o app logado (/app e /admin) até a pessoa aceitar as versões vigentes
 * dos Termos de Uso e da Política de Privacidade. Montado uma vez em App.tsx,
 * fora das rotas: páginas públicas (login, cadastro, convite, links públicos e
 * os próprios documentos) nunca são bloqueadas.
 *
 * Quem não concorda pode sair ou excluir a conta: o link do diálogo leva à
 * seção de exclusão em Usuário › Perfil, que não é bloqueada.
 *
 * Quem já aceitou no cadastro (caixa marcada ou "Ao continuar com o Google"),
 * mas ainda não tinha sessão para gravar, tem o aceite registrado aqui sem
 * ver o pedido de novo. Se o servidor não responder, o app segue liberado: o
 * bloqueio volta na próxima abertura.
 *
 * Outros avisos que abrem sozinhos no app logado esperam por este com
 * useTermsAccepted() (./useTermsAcceptance), para não abrirem juntos.
 */
export function TermsGate() {
  const { pathname, hash } = useLocation();
  // A seção de exclusão da conta (Usuário › Perfil) fica fora do bloqueio.
  const gated = requiresTermsAcceptance(pathname, hash);
  const queryClient = useQueryClient();
  const { session, userId, query: acceptance } = useTermsAcceptance(gated);

  const current = acceptance.isSuccess && !!acceptance.data && hasCurrentAcceptance(acceptance.data);
  const outdated = gated && !!userId && acceptance.isSuccess && !!acceptance.data && !current;

  // Aceite já em dia: a anotação do cadastro, se houver, não serve para mais nada.
  useEffect(() => {
    if (current) clearPendingAcceptance();
  }, [current]);

  // Para quem o aceite prévio (do cadastro) já foi verificado.
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const autoAccepting = useRef(false);
  const metadata = session?.user?.user_metadata;
  const createdAt = session?.user?.created_at;

  useEffect(() => {
    if (!outdated || !userId || checkedFor === userId || autoAccepting.current) return;
    // A anotação do aparelho só vale para a conta recém-criada; a do cadastro por
    // e-mail viaja na própria conta (user_metadata).
    if (!hasPendingAcceptance(createdAt) && !metadataHasCurrentAcceptance(metadata)) {
      clearPendingAcceptance();
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
  }, [outdated, userId, checkedFor, metadata, createdAt, queryClient]);

  if (!outdated || checkedFor !== userId) return null;

  return (
    <Suspense fallback={null}>
      <TermsGateDialog userId={userId} updated={!!acceptance.data?.terms_version} />
    </Suspense>
  );
}
