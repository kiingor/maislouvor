import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { usePlatformAccess } from "@/contexts/PlatformAccessContext";
import { useTeamDataConsent } from "@/components/legal/TeamDataConsentGate";
import { DeleteAccountSection } from "@/components/account/DeleteAccountSection";
import { Button } from "@/components/ui/button";
import { clearTeamCache, saveTeamDataConsent, teamDataConsentKey } from "@/lib/teamDataConsent";
import { supabase } from "@/integrations/supabase/client";

export default function PrivacyChoices() {
  const { userId } = usePlatformAccess();
  const consent = useTeamDataConsent(userId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const revoke = async () => {
    if (!userId || saving) return;
    setSaving(true); setError("");
    try {
      const data = await saveTeamDataConsent(false);
      await qc.cancelQueries(); qc.clear(); clearTeamCache(userId);
      qc.setQueryData(teamDataConsentKey(userId), data);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return <main className="min-h-dvh bg-background px-5 pb-10 pt-[max(2rem,env(safe-area-inset-top))]">
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">Minhas escolhas de privacidade</h1>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Participação em equipes</h2>
        <p className="text-sm">{consent.isPending ? "Conferindo sua escolha…" : consent.isError ? "Não foi possível consultar sua escolha." : consent.data?.allowed ? "Você autorizou o tratamento dos dados da sua participação." : "Sua participação não está autorizada."}</p>
        <p className="text-sm text-muted-foreground">Ao retirar a autorização, você deixa de acessar as funções de equipe e de receber novas escalas e avisos. O Asafe também deixa de usar seus dados. Isso não exclui a conta nem apaga automaticamente registros anteriores. Para apagá-los, use a exclusão abaixo ou solicite a análise pelo suporte.</p>
        {consent.data?.allowed && <Button variant="outline" disabled={saving} onClick={revoke}>{saving ? "Salvando…" : "Retirar minha autorização"}</Button>}
        {consent.isError && <Button onClick={() => void consent.refetch()}>Tentar novamente</Button>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Link className="block text-sm text-primary" to="/app">{consent.data?.allowed ? "Voltar ao app" : "Rever a autorização"}</Link>
      </section>
      <p className="text-sm text-muted-foreground">Retirar a autorização ou excluir a conta não cancela uma assinatura da loja. Gerencie-a nas assinaturas da Apple ou do Google; para assinaturas feitas na web, fale com o suporte.</p>
      <DeleteAccountSection />
      <div className="flex flex-wrap gap-4 text-sm text-primary"><Link to="/privacidade">Política de Privacidade</Link><Link to="/suporte">Suporte e pedidos sobre dados</Link></div>
      <Button variant="ghost" onClick={async () => { await supabase.auth.signOut(); qc.clear(); navigate("/login", { replace: true }); }}>Sair da conta</Button>
    </div>
  </main>;
}
