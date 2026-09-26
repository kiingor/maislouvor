import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InstallPWABanner } from "@/components/InstallPWABanner";
import { GoogleButton } from "@/components/GoogleButton";
import { MailCheck } from "lucide-react";
import {
  AuthDivider,
  AuthField,
  AuthFieldGroup,
  AuthHero,
  AuthInlineLink,
  AuthPanel,
  AuthScreen,
  ProminentButton,
} from "./Login";

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast({
        title: "Erro ao criar conta",
        description: error.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Email confirmation is disabled — sign-up returns a session, so go straight in.
    if (data.session) {
      navigate("/app/home", { replace: true });
      return;
    }

    // Fallback: confirmation required (e.g. SMTP enabled later)
    setSuccess(true);
    setLoading(false);
  };

  if (success) {
    return (
      <AuthScreen className="items-center text-center">
        <div className="w-full max-w-sm animate-in-up">
          <MailCheck className="mx-auto h-14 w-14 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="mt-5 text-title2">Verifique seu email</h2>
          <p className="mt-2 text-body text-muted-foreground">
            Enviamos um link de confirmação para <strong className="font-semibold text-foreground">{email}</strong>.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-[10px] px-2 text-subhead font-semibold text-primary underline-offset-4 hover:underline"
          >
            Voltar ao login
          </Link>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen className="lg:flex-row lg:items-center lg:justify-center lg:gap-20">
      <AuthHero />

      <AuthPanel title="Crie sua conta" subtitle="Comece a organizar seus repertórios">
        <form onSubmit={handleSignUp}>
          <AuthFieldGroup>
            <AuthField
              id="signup-name"
              label="Nome completo"
              labelClassName="w-[7.75rem]"
              type="text"
              autoComplete="name"
              placeholder="Seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <AuthField
              id="signup-email"
              label="Email"
              labelClassName="w-[7.75rem]"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <AuthField
              id="signup-password"
              label="Senha"
              labelClassName="w-[7.75rem]"
              type="password"
              autoComplete="new-password"
              aria-describedby="signup-password-hint"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </AuthFieldGroup>
          <p id="signup-password-hint" className="mx-4 mt-2 text-footnote text-muted-foreground">Mínimo 6 caracteres.</p>

          <ProminentButton type="submit" disabled={loading} loading={loading} className="mt-6">
            Criar conta
          </ProminentButton>
        </form>

        <AuthDivider />

        <GoogleButton label="Criar conta com Google" />

        <p className="mt-6 text-center text-subhead text-muted-foreground">
          Já tem conta?{" "}
          <AuthInlineLink to="/login">Entrar</AuthInlineLink>
        </p>

        <p className="mt-3 text-center text-footnote text-muted-foreground">Gratuito para equipes pequenas</p>
      </AuthPanel>

      <InstallPWABanner />
    </AuthScreen>
  );
}
