import { lazy, Suspense, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { acceptCurrentTerms } from "@/integrations/supabase/legal-client";
import { useToast } from "@/hooks/use-toast";
import { InstallPWABanner } from "@/components/InstallPWABanner";
import { SocialLoginButtons } from "@/components/SocialLoginButtons";
import { Checkbox } from "@/components/ui/checkbox";
import { LegalConsentNotice, LegalDocLink, LegalLinksFooter } from "@/components/legal/LegalConsent";
import {
  clearPendingAcceptance,
  legalAcceptanceMetadata,
  rememberPendingAcceptance,
  type LegalDocKind,
} from "@/lib/legal";
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

// Termos/Política numa folha por cima do formulário (só baixa ao abrir).
const LegalDocumentSheet = lazy(() => import("@/components/legal/LegalDocumentSheet"));

export default function SignUp() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [openDoc, setOpenDoc] = useState<LegalDocKind | null>(null);
  // Fica montada depois de aberta uma vez, para a folha animar ao fechar.
  const [sheetLoaded, setSheetLoaded] = useState(false);
  const openDocument = (doc: LegalDocKind) => {
    setSheetLoaded(true);
    setOpenDoc(doc);
  };
  const termsRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    // Aceite obrigatório (App Store / LGPD): sem a caixa marcada, nada é enviado.
    if (!acceptedTerms) {
      setTermsError(true);
      termsRef.current?.focus();
      return;
    }
    setLoading(true);
    // Guardado antes da conta existir: se a gravação abaixo falhar (ou houver
    // confirmação de e-mail), o TermsGate registra o aceite na primeira sessão.
    rememberPendingAcceptance();

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, ...legalAcceptanceMetadata() },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      clearPendingAcceptance();
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
      try {
        await acceptCurrentTerms();
        clearPendingAcceptance();
      } catch {
        /* o TermsGate tenta de novo ao entrar no app */
      }
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

          {/* Aceite dos Termos e da Política (links abrem numa folha, sem perder o formulário). */}
          <div className="mx-1 mt-5 flex items-start gap-3">
            <Checkbox
              ref={termsRef}
              id="signup-terms"
              checked={acceptedTerms}
              onCheckedChange={(value) => {
                setAcceptedTerms(value === true);
                if (value === true) setTermsError(false);
              }}
              // Nome explícito: alguns leitores de tela pulam o texto dos links dentro do <label>.
              aria-label="Li e aceito os Termos de Uso e a Política de Privacidade"
              aria-invalid={termsError || undefined}
              aria-describedby={termsError ? "signup-terms-error" : undefined}
              className="mt-px aria-[invalid=true]:border-ios-red"
            />
            <label htmlFor="signup-terms" className="text-subhead text-muted-foreground">
              Li e aceito os{" "}
              <LegalDocLink doc="terms" onOpen={openDocument}>Termos de Uso</LegalDocLink> e a{" "}
              <LegalDocLink doc="privacy" onOpen={openDocument}>Política de Privacidade</LegalDocLink>.
            </label>
          </div>
          {termsError && (
            <p id="signup-terms-error" role="alert" className="mx-1 mt-2 pl-[34px] text-footnote text-ios-red">
              Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.
            </p>
          )}

          <ProminentButton type="submit" disabled={loading} loading={loading} className="mt-6">
            Criar conta
          </ProminentButton>
        </form>

        <AuthDivider />

        <SocialLoginButtons label="Criar conta com Google" onStart={rememberPendingAcceptance} />
        <LegalConsentNotice lead="Ao continuar com o Google" onOpen={openDocument} className="mt-3" />

        <p className="mt-6 text-center text-subhead text-muted-foreground">
          Já tem conta?{" "}
          <AuthInlineLink to="/login">Entrar</AuthInlineLink>
        </p>

        <p className="mt-3 text-center text-footnote text-muted-foreground">Gratuito para equipes pequenas</p>

        <LegalLinksFooter onOpen={openDocument} className="mt-4" />
      </AuthPanel>

      <InstallPWABanner />

      {sheetLoaded && (
        <Suspense fallback={null}>
          <LegalDocumentSheet doc={openDoc} onClose={() => setOpenDoc(null)} />
        </Suspense>
      )}
    </AuthScreen>
  );
}
