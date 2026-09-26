import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shell/PageHeader";
import { AuthField, AuthFieldGroup, PasswordToggle, ProminentButton } from "./Login";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast({ title: "Senha muito curta", description: "A nova senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({ title: "Senhas não coincidem", description: "A confirmação da senha não confere.", variant: "destructive" });
      return;
    }

    setLoading(true);

    // Verify current password by re-signing in
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.email) {
      toast({ title: "Erro", description: "Usuário não autenticado.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password: currentPassword,
    });

    if (signInError) {
      toast({ title: "Senha atual incorreta", description: "A senha atual informada está errada.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Update password
    const { error } = await supabase.auth.updateUser({ password: newPassword });

    if (error) {
      toast({ title: "Erro ao alterar senha", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Senha alterada com sucesso!" });
      navigate("/app/settings");
    }
    setLoading(false);
  };

  // Rótulos longos ("Confirmar nova senha") quebram em duas linhas dentro da coluna;
  // py-1.5 mantém essa linha com os mesmos 52pt das demais (2 × 20pt + 12pt).
  const labelClassName = "w-[6.75rem] py-1.5 leading-5";

  return (
    <div className="max-w-xl">
      <PageHeader title="Alterar senha" back />

      <form onSubmit={handleSubmit}>
        <AuthFieldGroup>
          <AuthField
            id="current-password"
            label="Senha atual"
            labelClassName={labelClassName}
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            trailing={<PasswordToggle shown={showCurrent} onToggle={() => setShowCurrent(!showCurrent)} />}
          />
        </AuthFieldGroup>

        <AuthFieldGroup className="mt-6">
          <AuthField
            id="new-password"
            label="Nova senha"
            labelClassName={labelClassName}
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={6}
            trailing={<PasswordToggle shown={showNew} onToggle={() => setShowNew(!showNew)} />}
          />
          <AuthField
            id="confirm-password"
            label="Confirmar nova senha"
            labelClassName={labelClassName}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </AuthFieldGroup>
        <p className="mx-4 mt-2 text-footnote text-muted-foreground">Mínimo 6 caracteres.</p>

        <ProminentButton type="submit" disabled={loading} loading={loading} className="mt-6">
          Alterar senha
        </ProminentButton>
      </form>
    </div>
  );
}
