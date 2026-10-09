import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TeamDataConsentGate } from "@/components/legal/TeamDataConsentGate";
import { supabase } from "@/integrations/supabase/client";
import { authPageUrl, RECOVER_ACCESS_PATH } from "@/lib/authRedirect";

/** Só consulta a equipe depois da escolha individual; nunca cria conta ou vínculo. */
async function confirmTeamAccess(userId: string) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.id !== userId) throw new Error("Não foi possível confirmar sua conta. Entre novamente com a mesma conta do app.");
  const { data: profile, error: profileError } = await supabase.from("profiles")
    .select("id").eq("user_id", userId).maybeSingle();
  if (profileError) throw new Error("Não foi possível consultar seu cadastro. Tente novamente.");
  if (!profile) return false;
  const { data: memberships, error: teamError } = await supabase.from("team_members")
    .select("team_id, teams(id)").eq("profile_id", profile.id);
  if (teamError || !Array.isArray(memberships)) throw new Error("Não foi possível consultar sua equipe. Tente novamente.");
  return memberships.some(membership => !!membership.teams?.id);
}

function TeamAccessResult({ userId }: { userId: string }) {
  const access = useQuery({ queryKey: ["access-recovery", userId], queryFn: () => confirmTeamAccess(userId),
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false });
  return <section className="mx-auto max-w-md space-y-4 px-5 py-7" aria-live="polite">
    {access.isPending || access.isFetching ? <p role="status">Conferindo seu acesso à equipe…</p> : access.isError ? <>
      <h2 className="text-xl font-semibold">Ainda não conseguimos confirmar o acesso</h2>
      <p role="alert">{access.error.message}</p>
      <Button onClick={() => void access.refetch()}>Tentar novamente</Button>
    </> : access.data ? <>
      <h2 className="text-xl font-semibold">Acesso à equipe confirmado</h2>
      <p>Conseguimos consultar sua equipe com esta conta.</p>
      <p>Sua escolha está salva na sua conta e vale também para o app Android antigo.</p>
      <p>Agora feche o +Louvor por completo e abra de novo. No app antigo, continue usando a mesma conta.</p>
      <p className="text-sm text-muted-foreground">Se o acesso continuar indisponível, fale com o suporte. Não exclua nem recrie sua conta.</p>
      <Button asChild><Link to="/app/home">Abrir +Louvor no navegador</Link></Button>
    </> : <>
      <h2 className="text-xl font-semibold">Equipe ainda não encontrada</h2>
      <p>Não encontramos uma equipe acessível para esta conta. Confira o e-mail acima e entre com a mesma conta que você já usava no app.</p>
      <p>Se a conta estiver certa, fale com o suporte. Não é necessário criar outra conta ou equipe.</p>
      <Button onClick={() => void access.refetch()}>Conferir novamente</Button>
    </>}
    <div className="flex flex-wrap gap-4 text-sm text-primary">
      <Link to="/minha-privacidade">Minhas escolhas de privacidade</Link>
      <Link to="/suporte">Falar com o suporte</Link>
    </div>
  </section>;
}

export default function RecoverAccess() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    setLoading(true); setError("");
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authEventReceived = true;
      setUser(session?.user ?? null); setLoading(false); setError("");
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return;
      if (sessionError) throw sessionError;
      setUser(data.session?.user ?? null); setLoading(false);
    }).catch(() => {
      if (!active || authEventReceived) return;
      setUser(null); setLoading(false); setError("Não foi possível conferir sua conta. Tente novamente.");
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [attempt]);
  const switchAccount = async () => {
    setSigningOut(true); setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
      if (signOutError) throw signOutError;
      setUser(null);
    } catch { setError("Não foi possível sair desta conta. Tente novamente."); }
    finally { setSigningOut(false); }
  };
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="mx-auto max-w-md space-y-4 px-5 pt-8">
      <h1 className="text-2xl font-semibold">Recuperar acesso à equipe</h1>
      <p>Se o app deixou de mostrar sua equipe, confira sua escolha de privacidade aqui. Não exclua nem recrie sua conta ou equipe.</p>
      {loading ? <p role="status">Conferindo sua conta…</p> : user ? <>
        <p className="break-words text-sm">Conta conectada: <strong>{user.email || "conta sem e-mail disponível"}</strong></p>
        <p className="text-sm text-muted-foreground">Confirme que é a mesma conta que você já usava no +Louvor.</p>
        <Button variant="outline" onClick={() => void switchAccount()} disabled={signingOut}>{signingOut ? "Saindo…" : "Entrar com outra conta"}</Button>
      </> : !error && <>
        <p>Entre com o mesmo e-mail e a mesma forma de login usados no app.</p>
        <Button asChild><Link to={authPageUrl("/login", RECOVER_ACCESS_PATH)}>Entrar na minha conta</Link></Button>
      </>}
      {error && <><p role="alert">{error}</p>{!user && <Button onClick={() => setAttempt(value => value + 1)}>Tentar novamente</Button>}</>}
    </header>
    {!loading && user && <TeamDataConsentGate key={user.id} userId={user.id}>
      <TeamAccessResult userId={user.id} />
    </TeamDataConsentGate>}
    {!user && <footer className="mx-auto max-w-md px-5 py-8 text-sm text-primary"><Link to="/suporte">Falar com o suporte</Link></footer>}
  </div>;
}
