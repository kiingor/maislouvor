import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { GoogleButton } from "./GoogleButton";
import { useToast } from "@/hooks/use-toast";
import { isAppleSignInAvailable, isAppleSignInCancelled, signInWithApple } from "@/lib/appleSignIn";
import { safeAppRedirect } from "@/lib/authRedirect";

export function SocialLoginButtons({ label, onStart }: { label?: string; onStart?: () => void }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const handleApple = async () => {
    if (loading) return;
    setLoading(true);
    try {
      onStart?.();
      const { nameSaved } = await signInWithApple();
      if (!nameSaved) toast({ title: "Login concluído", description: "Você pode completar seu nome nos Ajustes." });
      navigate(safeAppRedirect(new URLSearchParams(window.location.search).get("redirect")), { replace: true });
    } catch (error) {
      if (!isAppleSignInCancelled(error)) toast({ title: "Não foi possível entrar com a Apple", description: "Tente novamente. Se o problema continuar, entre com seu e-mail.", variant: "destructive" });
    } finally { setLoading(false); }
  };
  return (
    <div className="flex flex-col gap-3" data-social-logins>
      <GoogleButton label={label} onStart={onStart} />
      {isAppleSignInAvailable() && (
        <button type="button" onClick={handleApple} disabled={loading} aria-busy={loading || undefined}
          className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-full bg-black px-5 text-headline text-white transition-opacity hover:opacity-85 disabled:opacity-60 dark:border dark:border-white">
          {loading ? <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" /> : (
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M17.05 12.54c.03 3.27 2.87 4.36 2.9 4.37-.02.08-.45 1.55-1.5 3.07-.9 1.32-1.84 2.63-3.31 2.66-1.45.04-1.92-.86-3.58-.86-1.65 0-2.17.83-3.55.9-1.42.05-2.5-1.42-3.4-2.73C2.77 17.27 1.37 12.36 3.25 9.05a5.28 5.28 0 0 1 4.49-2.7c1.4-.02 2.72.95 3.58.95.85 0 2.46-1.18 4.14-1.01.7.03 2.67.28 3.94 2.14-.1.07-2.38 1.39-2.35 4.11ZM14.33 4.5c.75-.92 1.26-2.21 1.12-3.5-1.08.04-2.4.72-3.17 1.64-.7.81-1.32 2.12-1.15 3.37 1.2.09 2.44-.64 3.2-1.51Z" />
            </svg>
          )}
          <span>Entrar com Apple</span>
        </button>
      )}
    </div>
  );
}
