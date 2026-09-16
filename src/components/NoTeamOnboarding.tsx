import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { Users, Plus, Ticket, Clock, RefreshCw, X, Loader2 } from "lucide-react";

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
      <div className="max-w-xl mx-auto animate-in-up">
        <GlassCard className="p-8 text-center">
          <div className="h-16 w-16 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-7 w-7 text-yellow-500" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Pedido enviado!</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Sua solicitação para entrar em <strong className="text-foreground">{pending.teamName}</strong> foi
            enviada. Assim que o líder aprovar, você entra automaticamente.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button onClick={handleRefresh} disabled={refreshing} className="rounded-xl gap-2 h-11">
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Já fui aprovado? Atualizar
            </Button>
            <Button variant="outline" onClick={handleCancel} className="rounded-xl gap-2 h-11">
              <X className="h-4 w-4" /> Cancelar pedido
            </Button>
          </div>
        </GlassCard>
      </div>
    );
  }

  // ---- Estado: escolher caminho ----
  return (
    <div className="max-w-xl mx-auto animate-in-up">
      <GlassCard className="p-8">
        <div className="text-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-foreground/[0.06] flex items-center justify-center mx-auto mb-4">
            <Users className="h-7 w-7 text-foreground/70" />
          </div>
          <h1 className="text-xl font-semibold mb-2">Bem-vindo ao +Louvor!</h1>
          <p className="text-sm text-muted-foreground">
            Você ainda não faz parte de nenhuma equipe. Entre com um código de convite ou crie a sua.
          </p>
        </div>

        {/* Entrar com código */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Ticket className="h-3.5 w-3.5" /> Tenho um código de convite
          </label>
          <div className="flex gap-2">
            <GlassInput
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
              placeholder="Ex: JE8Y7H"
              maxLength={12}
              className="tracking-widest font-mono uppercase"
              disabled={loadingPending}
            />
            <Button onClick={handleJoin} disabled={joining || !code.trim()} className="shrink-0 h-12 px-5 rounded-xl gap-2">
              {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Peça o código ao líder da sua equipe.</p>
        </div>

        {/* Divisor */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[11px] text-muted-foreground uppercase tracking-wider">ou</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Criar equipe */}
        <Button variant="outline" onClick={() => setCreateOpen(true)} className="w-full rounded-xl gap-2 h-12">
          <Plus className="h-4 w-4" /> Criar minha própria equipe
        </Button>
      </GlassCard>

      <CreateTeamModal open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
