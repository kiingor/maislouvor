import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GlassInput } from "@/components/GlassInput";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  profile: { id: string; full_name: string | null; user_id: string } | null;
  onSaved: () => void;
  isAdmin: boolean;
}

export function EditMemberModal({ open, onOpenChange, profile, onSaved, isAdmin }: Props) {
  const [fullName, setFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (profile && open) {
      setFullName(profile.full_name || "");
      setNewPassword("");
      setShowPassword(false);
    }
  }, [profile, open]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setLoading(true);

    const nameChanged = fullName.trim() !== (profile.full_name || "");
    const passwordChanged = newPassword.trim().length > 0;

    if (passwordChanged && newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "Mínimo 6 caracteres.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Check if current user is editing themselves
    const { data: { user } } = await supabase.auth.getUser();
    const isSelfEdit = user?.id === profile.user_id;

    if (isSelfEdit && nameChanged) {
      // Self-edit: direct update (RLS allows it)
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() })
        .eq("id", profile.id);
      if (error) {
        toast({ title: "Erro ao atualizar nome", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
    } else if (!isSelfEdit && (nameChanged || passwordChanged)) {
      // Admin editing another member: use edge function
      const { data, error } = await supabase.functions.invoke("admin-update-user", {
        body: {
          user_id: profile.user_id,
          ...(nameChanged ? { full_name: fullName.trim() } : {}),
          ...(passwordChanged ? { password: newPassword } : {}),
        },
      });
      if (error || data?.error) {
        toast({ title: "Erro ao atualizar", description: data?.error || error?.message, variant: "destructive" });
        setLoading(false);
        return;
      }
    }

    toast({ title: "Dados atualizados!" });
    onSaved();
    onOpenChange(false);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass rounded-2xl border-0 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Editar membro</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 mt-2">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nome completo</label>
            <GlassInput value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Nova senha (opcional)</label>
              <div className="relative">
                <GlassInput
                  type={showPassword ? "text" : "password"}
                  placeholder="Deixe vazio para manter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
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
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full h-11 rounded-xl text-sm font-semibold">
            {loading ? <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" /> : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
