import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Loader2, Clock } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/** Entrar em OUTRA equipe usando o código de convite (gera pedido p/ o líder aprovar).
 *  Mesmo fluxo do onboarding, mas disponível para quem já tem equipe. */
export function JoinTeamModal({ open, onOpenChange }: Props) {
  const { refetch } = useTeam();
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [pendingTeam, setPendingTeam] = useState<string | null>(null);

  const close = (o: boolean) => {
    if (!o) { setPendingTeam(null); setCode(""); }
    onOpenChange(o);
  };

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
      close(false);
      return;
    }
    setPendingTeam(data.team_name ?? "a equipe");
    setCode("");
    toast({ title: "Pedido enviado!", description: "Aguarde o líder aprovar." });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Entrar em uma equipe
          </DialogTitle>
        </DialogHeader>

        {pendingTeam ? (
          <div className="text-center py-2">
            <div className="h-14 w-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center mx-auto mb-3">
              <Clock className="h-6 w-6 text-yellow-500" />
            </div>
            <p className="font-medium">Pedido enviado!</p>
            <p className="text-sm text-muted-foreground mt-1">
              Sua solicitação para entrar em <strong className="text-foreground">{pendingTeam}</strong> foi
              enviada. Assim que o líder aprovar, ela aparece nas suas equipes.
            </p>
            <Button className="mt-5 rounded-xl h-11 px-6" onClick={() => close(false)}>Ok</Button>
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">Use o código de convite que o líder compartilhou.</p>
            <div className="flex gap-2">
              <GlassInput
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                placeholder="Ex: JE8Y7H"
                maxLength={12}
                className="tracking-widest font-mono uppercase"
                autoFocus
              />
              <Button onClick={handleJoin} disabled={joining || !code.trim()} className="shrink-0 h-12 px-5 rounded-xl gap-2">
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
