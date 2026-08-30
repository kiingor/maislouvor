import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: { id: string; full_name: string | null; user_id: string } | null;
  onSaved: () => void;
}

export function EditMemberModal({ open, onOpenChange, profile, onSaved }: Props) {
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (profile && open) setFullName(profile.full_name || "");
  }, [profile, open]);

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !fullName.trim()) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== profile.user_id) {
      toast({
        title: "Operação não permitida",
        description: "Cada pessoa deve editar o próprio perfil.",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() })
      .eq("id", profile.id)
      .eq("user_id", user.id);

    setLoading(false);
    if (error) {
      toast({ title: "Erro ao atualizar nome", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Dados atualizados" });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Editar meu perfil</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome completo</label>
            <GlassInput
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
              maxLength={120}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Alterações de senha ficam disponíveis somente no fluxo “Alterar senha” da sua conta.
          </p>
          <Button type="submit" disabled={loading || !fullName.trim()} className="w-full h-11 rounded-xl text-sm font-semibold">
            {loading
              ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
              : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
