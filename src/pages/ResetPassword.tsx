import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { authErrorMessage } from "@/lib/authErrors";
import { KeyRound } from "lucide-react";
import { AuthAppIcon, AuthField, AuthFieldGroup, AuthScreen, PasswordToggle, ProminentButton } from "./Login";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
      }
    });

    // Also check hash for type=recovery
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: "Senhas não coincidem", description: "A confirmação da senha não confere.", variant: "destructive" });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ title: "Erro ao redefinir senha", description: authErrorMessage(error), variant: "destructive" });
    } else {
      toast({ title: "Senha redefinida com sucesso!" });
      navigate("/login");
    }
    setLoading(false);
  };

  if (!ready) {
    // Estado de erro no padrão "conteúdo indisponível" do iOS.
    return (
      <AuthScreen className="items-center text-center">
        <div className="w-full max-w-sm animate-in-up">
          <KeyRound className="mx-auto h-14 w-14 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="mt-5 text-title2">Link inválido ou expirado</h2>
          <p className="mt-2 text-body text-muted-foreground">
            Solicite um novo link de redefinição de senha na tela de login.
          </p>
          <ProminentButton type="button" onClick={() => navigate("/login")} className="mt-8">
            Voltar ao login
          </ProminentButton>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen className="items-center">
      <div className="w-full max-w-[400px] animate-in-up">
        <div className="flex flex-col items-center text-center">
          <AuthAppIcon>
            <KeyRound className="h-10 w-10" strokeWidth={2} aria-hidden="true" />
          </AuthAppIcon>
          <h1 className="mt-5 text-large-title">Nova senha</h1>
          <p className="mt-1 text-body text-muted-foreground">Defina sua nova senha abaixo.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8">
          <AuthFieldGroup>
            <AuthField
              id="reset-password"
              label="Nova senha"
              labelClassName="w-[8.5rem]"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              trailing={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword(!showPassword)} />}
            />
            <AuthField
              id="reset-password-confirm"
              label="Confirmar senha"
              labelClassName="w-[8.5rem]"
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
            Redefinir senha
          </ProminentButton>
        </form>
      </div>
    </AuthScreen>
  );
}
