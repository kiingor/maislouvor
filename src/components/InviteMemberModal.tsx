import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function InviteMemberModal({ open, onOpenChange }: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>("viewer");
  const [loading, setLoading] = useState(false);
  const { currentTeam } = useTeam();
  const { toast } = useToast();

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeam || !email.trim() || !password.trim() || !fullName.trim()) return;

    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.functions.invoke("create-invite", {
      body: {
        email: email.trim().toLowerCase(),
        team_id: currentTeam.id,
        role,
        password: password,
        full_name: fullName.trim(),
      },
    });

    if (error || data?.error) {
      toast({ title: "Erro ao convidar", description: data?.error ?? error?.message, variant: "destructive" });
    } else if (data?.already_member) {
      toast({ title: "Já é membro", description: "Este usuário já faz parte da equipe." });
      handleClose(false);
    } else {
      if (data?.is_new_user) {
        toast({ title: "Membro adicionado!", description: "Conta criada com a senha definida. O usuário pode fazer login agora." });
      } else {
        toast({ title: "Membro adicionado!", description: "O usuário já tinha conta e foi adicionado à equipe." });
      }
      handleClose(false);
    }
    setLoading(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("viewer");
      setShowPassword(false);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Convidar membro</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleInvite} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome completo</label>
            <GlassInput type="text" placeholder="Nome do membro" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</label>
            <GlassInput type="email" placeholder="membro@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Senha inicial</label>
            <div className="relative">
              <GlassInput
                type={showPassword ? "text" : "password"}
                placeholder="Senha para o membro"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">O membro poderá alterar a senha depois.</p>
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
          <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl text-sm font-semibold">
            {loading ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : "Convidar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
