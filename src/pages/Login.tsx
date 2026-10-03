import { useState, useEffect, forwardRef, type InputHTMLAttributes, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InstallPWABanner } from "@/components/InstallPWABanner";
import { BrandMark } from "@/components/BrandMark";
import { GoogleButton } from "@/components/GoogleButton";
import { LegalLinksFooter } from "@/components/legal/LegalConsent";
import { cn } from "@/lib/utils";
import { Music, ListMusic, Users, Mic2, MonitorSmartphone, Layers, Eye, EyeOff, Loader2 } from "lucide-react";

/* ------------------------------------------------------------------
   Kit das telas de autenticação (fora do shell do app).
   Padrão iOS de onboarding: ícone do app, título grande, campos em
   lista agrupada (card inset com separador fino) e botão proeminente
   em cápsula. Reutilizado por SignUp, ResetPassword, AcceptInvite e
   AuthCallback para as telas não divergirem.
   ------------------------------------------------------------------ */

const features = [
  { icon: ListMusic, title: "Repertórios", desc: "Organize músicas em listas para cada culto" },
  { icon: Music, title: "Cifras & Letras", desc: "Acesse cifras e letras sincronizadas" },
  { icon: Mic2, title: "Apresentação", desc: "Modo tela cheia com letra para projetar" },
  { icon: Users, title: "Equipe", desc: "Convide músicos e gerencie permissões" },
  { icon: MonitorSmartphone, title: "Multiplataforma", desc: "Use no celular, tablet ou computador" },
  { icon: Layers, title: "Transposição", desc: "Mude o tom da música com um clique" },
];

/** Tela cheia sobre o fundo agrupado do sistema, respeitando as safe areas (PWA/APK em tela cheia). */
export function AuthScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div
        className={cn(
          "mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-center px-4 min-[430px]:px-5 lg:px-12",
          "pt-[calc(max(env(safe-area-inset-top),12px)+28px)] pb-[calc(max(env(safe-area-inset-bottom),16px)+24px)]",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Ícone do app (quadrado arredondado estilo iOS) com a marca. */
export function AuthAppIcon({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] bg-prominent text-prominent-foreground dark:bg-card dark:ring-1 dark:ring-inset dark:ring-white/10",
        className,
      )}
    >
      {children ?? <BrandMark className="h-11 w-11" />}
    </div>
  );
}

/** Marca + chamada. No celular fica centralizada; no desktop vira a coluna da esquerda com os recursos. */
export function AuthHero() {
  return (
    <section className="lg:max-w-lg lg:flex-1">
      <div className="flex flex-col items-center text-center lg:flex-row lg:gap-4 lg:text-left">
        <AuthAppIcon className="lg:h-14 lg:w-14 lg:rounded-[16px] lg:[&_svg]:h-8 lg:[&_svg]:w-8" />
        <div className="mt-5 lg:mt-0">
          <h1 className="text-large-title lg:text-title2">+Louvor</h1>
          <p className="mt-0.5 text-body text-muted-foreground lg:text-subhead">Sua equipe, uma só voz</p>
        </div>
      </div>

      {/* Chamada visível em todos os tamanhos; só a lista de recursos é exclusiva do desktop. */}
      <div className="mt-8 text-center lg:mt-10 lg:text-left">
        <h2 className="text-title2 lg:text-large-title">
          Tudo que sua equipe
          <br />
          de louvor precisa.
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-subhead text-muted-foreground lg:mx-0 lg:text-body">
          Repertórios, cifras, letras e apresentações — tudo organizado em um único lugar.
        </p>
      </div>

      <div className="hidden lg:block">
        <ul className="mt-8 overflow-hidden rounded-card bg-card" aria-label="Recursos">
          {features.map((f) => (
            <li key={f.title} className="group/row flex items-center gap-3 pl-4">
              <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
                <f.icon className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <div className="min-h-[56px] min-w-0 flex-1 border-t border-separator py-2.5 pr-4 group-first/row:border-t-0">
                <p className="text-subhead font-semibold">{f.title}</p>
                <p className="text-footnote text-muted-foreground">{f.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Link dentro de um parágrafo: alvo de toque de 44pt sem alterar a altura da linha. */
export function AuthInlineLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-mx-1 -my-3 inline-flex min-h-[44px] items-center rounded-[10px] px-1 font-semibold text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

/** Coluna do formulário (à direita no desktop). */
export function AuthPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="mx-auto mt-10 w-full max-w-[400px] lg:mx-0 lg:mt-0 lg:w-[400px]">
      <div className="mb-3 px-1">
        <h2 className="text-title3">{title}</h2>
        {subtitle && <p className="mt-0.5 text-subhead text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

/** Grupo de campos: card inset com separadores finos recuados 16px. */
export function AuthFieldGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-separator overflow-hidden rounded-card bg-card", className)}>{children}</div>;
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: ReactNode;
  /** Largura da coluna do rótulo (alinha os campos do mesmo grupo). */
  labelClassName?: string;
  trailing?: ReactNode;
}

/** Linha de campo iOS: rótulo à esquerda, campo sem borda, acessório opcional (ex.: mostrar senha). */
export const AuthField = forwardRef<HTMLInputElement, AuthFieldProps>(
  ({ id, label, labelClassName, trailing, className, ...props }, ref) => (
    <div className="ml-4 flex min-h-[52px] items-center gap-3 pr-4">
      <label htmlFor={id} className={cn("w-[4.75rem] shrink-0 py-2 text-body", labelClassName)}>
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        className={cn(
          "h-[52px] min-w-0 flex-1 bg-transparent text-body text-foreground placeholder:text-label-tertiary",
          "focus-visible:outline-offset-[-3px] disabled:opacity-60",
          className,
        )}
        {...props}
      />
      {trailing}
    </div>
  ),
);
AuthField.displayName = "AuthField";

/** Botão de olho para mostrar/ocultar a senha (alvo de 44pt). */
export function PasswordToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={shown ? "Ocultar senha" : "Mostrar senha"}
      aria-pressed={shown}
      className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
    >
      {shown ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
    </button>
  );
}

interface ProminentButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: "prominent" | "gray";
}

/** Botão em cápsula de 50pt (HIG > Buttons, tamanho grande): proeminente ou cinza. */
export function ProminentButton({ loading, variant = "prominent", className, children, disabled, ...props }: ProminentButtonProps) {
  return (
    <button
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn(
        "flex h-[50px] w-full items-center justify-center gap-2 rounded-full px-5 text-headline transition-[opacity,transform,background-color] duration-200 active:scale-[0.98] disabled:opacity-50",
        variant === "prominent"
          ? "bg-prominent text-prominent-foreground hover:bg-prominent/90"
          : "bg-fill-tertiary text-foreground hover:bg-fill-secondary",
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : children}
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-separator" />
      <span className="text-footnote text-muted-foreground">ou</span>
      <div className="h-px flex-1 bg-separator" />
    </div>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/app/home", { replace: true });
    });
  }, [navigate]);

  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!email) {
      toast({ title: "Informe seu email", description: "Digite seu email para receber o link de redefinição.", variant: "destructive" });
      return;
    }
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Email enviado!", description: "Verifique sua caixa de entrada para redefinir a senha." });
    }
    setForgotLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        title: "Erro ao entrar",
        description: error.message,
        variant: "destructive",
      });
    } else {
      navigate("/app/home");
    }
    setLoading(false);
  };

  return (
    <AuthScreen className="lg:flex-row lg:items-center lg:justify-center lg:gap-20">
      <AuthHero />

      <AuthPanel title="Bem-vindo de volta" subtitle="Entre na sua conta para continuar">
        <form onSubmit={handleLogin}>
          <AuthFieldGroup>
            <AuthField
              id="login-email"
              label="Email"
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
              id="login-password"
              label="Senha"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </AuthFieldGroup>

          <div className="mb-3 flex justify-end">
            <button
              type="button"
              onClick={handleForgotPassword}
              aria-busy={forgotLoading || undefined}
              className={cn(
                "-mr-1.5 min-h-[44px] rounded-[10px] px-1.5 text-subhead font-medium text-primary transition-opacity",
                forgotLoading && "opacity-50",
              )}
            >
              Esqueceu a senha?
            </button>
          </div>

          <ProminentButton type="submit" disabled={loading} loading={loading}>
            Entrar
          </ProminentButton>
        </form>

        <AuthDivider />

        <GoogleButton label="Entrar com Google" />

        <p className="mt-6 text-center text-subhead text-muted-foreground">
          Não tem conta?{" "}
          <AuthInlineLink to="/signup">Criar conta</AuthInlineLink>
        </p>

        <p className="mt-3 text-center text-footnote text-muted-foreground">Gratuito para equipes pequenas</p>

        <LegalLinksFooter className="mt-4" />
      </AuthPanel>

      <InstallPWABanner />
    </AuthScreen>
  );
}
