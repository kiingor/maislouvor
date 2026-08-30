import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteMemberModal({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { currentTeam } = useTeam();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setEmail("");
    setRole("viewer");
    setInviteLink(null);
    setCopied(false);
    setLoading(false);
  };

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentTeam || !email.trim()) return;

    setLoading(true);
    const { data, error } = await supabase.functions.invoke("create-invite", {
      body: {
        email: email.trim().toLowerCase(),
        team_id: currentTeam.id,
        role,
      },
    });
    setLoading(false);

    if (error || data?.error) {
      toast({
        title: "Erro ao criar convite",
        description: data?.error ?? error?.message,
        variant: "destructive",
      });
      return;
    }

    if (typeof data?.token !== "string") {
      toast({ title: "Resposta inválida do servidor", variant: "destructive" });
      return;
    }

    setInviteLink(`${window.location.origin}/invite/${encodeURIComponent(data.token)}`);
    queryClient.invalidateQueries({ queryKey: ["team-invites", currentTeam.id] });
    toast({ title: "Convite criado", description: "Compartilhe o link com o titular deste e-mail." });
  };

  const copyInvite = async () => {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({ title: "Link copiado" });
    } catch {
      toast({
        title: "Não foi possível copiar",
        description: "Selecione o link e copie manualmente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Convidar membro</DialogTitle>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-4 mt-2">
            <div className="rounded-xl bg-accent/50 p-4 text-sm text-muted-foreground">
              A associação só será concluída quando a pessoa entrar com o e-mail convidado e aceitar o link.
              O convite expira em 7 dias.
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Link do convite
              </label>
              <GlassInput value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} />
            </div>
            <Button type="button" onClick={copyInvite} className="w-full h-11 rounded-xl gap-2">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado" : "Copiar link"}
            </Button>
            <Button type="button" variant="outline" onClick={() => handleClose(false)} className="w-full rounded-xl">
              Concluir
            </Button>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4 mt-2">
            <div className="rounded-xl bg-accent/50 p-3 flex gap-2 text-xs text-muted-foreground">
              <Link2 className="h-4 w-4 shrink-0 mt-0.5" />
              A pessoa cria ou acessa a própria conta e confirma o convite. Nenhuma senha será definida por terceiros.
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">E-mail</label>
              <GlassInput
                type="email"
                placeholder="membro@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={254}
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Função</label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="h-12 rounded-xl glass-input border-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Líder</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Membro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading || !email.trim()} className="w-full h-11 rounded-xl text-sm font-semibold">
              {loading
                ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
                : "Gerar convite"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
