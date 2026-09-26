import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { Users, Plus, Clock, RefreshCw, Loader2, ChevronRight } from "lucide-react";

interface PendingRequest {
  id: string;
  teamName: string;
}

/** Tela mostrada quando o usuário ainda não faz parte de nenhuma equipe:
 *  entrar com código de convite (aguarda aprovação do líder) OU criar a própria. */
export function NoTeamOnboarding() {
  const { profileId, refetch } = useTeam();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [loadingPending, setLoadingPending] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPending = async () => {
    if (!profileId) return;
    const { data } = await supabase
      .from("team_join_requests")
      .select("id, teams(name)")
      .eq("profile_id", profileId)
      .eq("status", "pending")
      .order("created_at", { ascending: false } as any);
    const first = (data as any[])?.[0];
    setPending(first ? { id: first.id, teamName: first.teams?.name ?? "a equipe" } : null);
    setLoadingPending(false);
  };

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const handleJoin = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setJoining(true);
    const { data, error } = await supabase.functions.invoke("join-team", { body: { code: trimmed } });
    setJoining(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    if (!data?.ok) {
      if (data?.error === "invalid_code") {
        toast({ title: "Código inválido", description: "Confira o código com o líder da equipe.", variant: "destructive" });
      } else {
        toast({ title: "Não foi possível entrar", variant: "destructive" });
      }
      return;
    }
    if (data.status === "member") {
      toast({ title: "Você já faz parte dessa equipe!" });
      await refetch();
      return;
    }
    // pendente
    setCode("");
    setPending({ id: "", teamName: data.team_name ?? "a equipe" });
    toast({ title: "Pedido enviado!", description: "Aguarde o líder aprovar sua entrada." });
    loadPending();
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    await loadPending();
    setRefreshing(false);
  };

  const handleCancel = async () => {
    if (!pending?.id) { setPending(null); return; }
    await supabase.from("team_join_requests").delete().eq("id", pending.id);
    setPending(null);
    toast({ title: "Pedido cancelado" });
  };

  // ---- Estado: aguardando aprovação ----
  if (pending) {
    return (
      <div className="mx-auto w-full max-w-md flex flex-col items-center text-center pt-6">
        <div className="grid place-items-center h-[60px] w-[60px] rounded-full bg-ios-orange/15 mb-4" aria-hidden="true">
          <Clock className="h-7 w-7 text-ios-orange" strokeWidth={2} />
        </div>
        <h2 className="text-title2 text-foreground">Pedido enviado!</h2>
        <p className="text-body text-muted-foreground mt-2">
          Sua solicitação para entrar em <strong className="font-semibold text-foreground">{pending.teamName}</strong> foi
          enviada. Assim que o líder aprovar, você entra automaticamente.
        </p>
        <div className="w-full mt-8 space-y-2.5">
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            size="lg"
            className="w-full"
          >
            {refreshing ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw strokeWidth={2.25} aria-hidden="true" />
            )}
            Já fui aprovado? Atualizar
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={handleCancel}
            className="w-full font-normal text-ios-red"
          >
            Cancelar pedido
          </Button>
        </div>
      </div>
    );
  }

  // ---- Estado: escolher caminho ----
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="flex flex-col items-center text-center pt-4 pb-8">
        <div className="grid place-items-center h-[60px] w-[60px] rounded-full bg-fill-tertiary mb-4" aria-hidden="true">
          <Users className="h-7 w-7 text-muted-foreground" strokeWidth={2} />
        </div>
        <h2 className="text-title2 text-foreground">Bem-vindo ao +Louvor!</h2>
        <p className="text-subhead text-muted-foreground mt-1.5 max-w-[340px]">
          Você ainda não faz parte de nenhuma equipe. Entre com um código de convite ou crie a sua.
        </p>
      </div>

      {/* Entrar com código */}
      <label htmlFor="onboarding-invite-code" className="block mx-4 mb-1.5 text-footnote text-muted-foreground">
        Tenho um código de convite
      </label>
      <div className="flex items-center gap-2 rounded-card bg-card py-1.5 pl-1.5 pr-2">
        <GlassInput
          id="onboarding-invite-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
          placeholder="Ex: JE8Y7H"
          maxLength={12}
          autoComplete="off"
          autoCapitalize="characters"
          className="h-11 flex-1 min-w-0 rounded-[18px] bg-transparent px-3 text-body font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-label-tertiary"
          disabled={loadingPending}
        />
        <Button
          onClick={handleJoin}
          disabled={joining || !code.trim()}
          size="sm"
          className="shrink-0 min-w-[76px]"
        >
          {joining ? <Loader2 className="animate-spin" aria-label="Entrando" /> : "Entrar"}
        </Button>
      </div>
      <p className="mx-4 mt-1.5 text-footnote text-muted-foreground">Peça o código ao líder da sua equipe.</p>

      {/* Criar equipe */}
      <div className="mt-7 rounded-card bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex w-full items-center gap-3 min-h-[52px] px-4 py-2.5 text-left transition-colors active:bg-grouped-tertiary [@media(hover:hover)]:hover:bg-fill-quaternary"
        >
          <span
            aria-hidden="true"
            className="grid place-items-center h-[30px] w-[30px] shrink-0 rounded-[8px] bg-prominent text-prominent-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="flex-1 min-w-0 text-body text-foreground">Criar minha própria equipe</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      <CreateTeamModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
