import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readTeamDataConsent, saveTeamDataConsent, teamDataConsentKey } from "@/lib/teamDataConsent";

export function useTeamDataConsent(userId: string | null) {
  return useQuery({ queryKey: teamDataConsentKey(userId), queryFn: readTeamDataConsent,
    enabled: !!userId, staleTime: 0, retry: false, refetchInterval: 60_000 });
}
export function TeamDataConsentGate({ children, userId }: { children: ReactNode; userId: string }) {
  const consent = useTeamDataConsent(userId);
  const qc = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Falha fechada: nenhum componente de equipe é montado antes desta leitura.
  if (consent.data?.allowed && !consent.isError) return <>{children}</>;
  const save = async () => {
    if (!checked || saving) return;
    setSaving(true); setError("");
    try { qc.setQueryData(teamDataConsentKey(userId), await saveTeamDataConsent(true)); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  return <main className="min-h-dvh bg-background px-5 pb-8 pt-[max(2rem,env(safe-area-inset-top))]">
    <div className="mx-auto max-w-md space-y-5">
      <ShieldCheck className="h-9 w-9 text-primary" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Sua participação, sua escolha</h1>
      {consent.isPending ? <p role="status">Conferindo sua escolha…</p> : consent.isError ? <>
        <p role="alert">Não foi possível conferir sua escolha de privacidade.</p>
        <Button onClick={() => void consent.refetch()}>Tentar novamente</Button>
      </> : <>
        <p className="text-sm text-muted-foreground">Participar de uma equipe de louvor pode revelar sua religião. Por isso, precisamos de uma autorização específica sua.</p>
        <label className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
          <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-primary" />
          <span>Autorizo o +Louvor a tratar meus vínculos com equipes, funções, disponibilidade e participação em cultos e ensaios, que podem revelar convicção religiosa, para organizar as equipes e escalas e compartilhar essas informações com os integrantes das minhas equipes.</span>
        </label>
        <p className="text-sm text-muted-foreground">O Asafe tem uma autorização separada. Você pode retirar esta autorização em Usuário → Minhas escolhas de privacidade. Sem ela, as funções de equipe ficam indisponíveis; sua conta, suporte e exclusão continuam acessíveis.</p>
        <Button className="min-h-11 w-full" disabled={!checked || saving} onClick={save}>{saving ? "Salvando…" : "Autorizar e continuar"}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </>}
      <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-primary">
        <Link to="/minha-privacidade">Continuar sem autorizar</Link>
        <Link to="/privacidade">Política de Privacidade</Link>
        <Link to="/suporte">Suporte</Link>
      </div>
    </div>
  </main>;
}
