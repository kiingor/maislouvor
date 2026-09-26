import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogDescription, DialogToolbar } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { useToast } from "@/hooks/use-toast";
import { Clock } from "lucide-react";

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
      <DialogContent className="sm:max-w-md">
        {pendingTeam ? (
          <>
            <DialogToolbar title="Entrar em uma equipe" confirm={{ label: "Ok", onClick: () => close(false) }} />
            <div className="flex flex-col items-center text-center pt-2 pb-2">
              <div className="grid place-items-center h-[60px] w-[60px] rounded-full bg-ios-orange/15 mb-4" aria-hidden="true">
                <Clock className="h-7 w-7 text-ios-orange" strokeWidth={2} />
              </div>
              <p className="text-title3 text-foreground">Pedido enviado!</p>
              <DialogDescription className="text-body text-muted-foreground mt-1.5">
                Sua solicitação para entrar em <strong className="font-semibold text-foreground">{pendingTeam}</strong> foi
                enviada. Assim que o líder aprovar, ela aparece nas suas equipes.
              </DialogDescription>
            </div>
          </>
        ) : (
          <>
            <DialogToolbar
              title="Entrar em uma equipe"
              confirm={{ label: "Entrar", onClick: handleJoin, disabled: joining || !code.trim(), loading: joining }}
            />
            <div>
              <DialogDescription className="mx-4 mb-1.5 text-footnote text-muted-foreground">
                Use o código de convite que o líder compartilhou.
              </DialogDescription>
              <div className="rounded-card bg-card overflow-hidden">
                <GlassInput
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
                  placeholder="Ex: JE8Y7H"
                  maxLength={12}
                  aria-label="Código de convite"
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="h-[52px] rounded-card bg-transparent px-4 text-body font-mono uppercase tracking-widest placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-label-tertiary focus-visible:ring-inset focus-visible:ring-ios-blue/40"
                  autoFocus
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
