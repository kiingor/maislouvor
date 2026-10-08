import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ScanFace } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BiometricSession, enableFaceId, isFaceIdPlatform, sessionStorageKey, type FaceIdStatus } from "@/lib/biometricStorage";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const actionClass = "flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-prominent px-5 text-headline text-prominent-foreground disabled:opacity-60";
const preferenceKey = (userId: string) => `maislouvor.faceid.prompted.${userId}`;

export function BiometricGate({ children }: { children: ReactNode }) {
  const native = isFaceIdPlatform();
  const [loading, setLoading] = useState(native);
  const [status, setStatus] = useState<FaceIdStatus>({ available: false, enabled: false, locked: false });
  const [session, setSession] = useState<Session | null>(null);
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const working = useRef(false);
  const qc = useQueryClient();

  const unlock = useCallback(async () => {
    if (working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      await BiometricSession.unlock({ key: sessionStorageKey });
      const result = await supabase.auth.getSession();
      if (result.error || !result.data.session) throw new Error("Sessão expirada");
      setSession(result.data.session);
      setStatus(await BiometricSession.status());
      await supabase.auth.startAutoRefresh();
    } catch {
      await BiometricSession.lock().catch(() => {});
      setStatus(current => ({ ...current, locked: true }));
      setError("Não foi possível entrar com Face ID. Tente novamente ou entre de outra forma.");
    } finally { working.current = false; setBusy(false); }
  }, []);

  useEffect(() => {
    if (!native) return;
    let disposed = false;
    const removers: (() => Promise<void>)[] = [];
    const refresh = () => {
      void BiometricSession.status().then(next => { if (!disposed) setStatus(next); }).catch(() => {
        if (!disposed) setStatus(current => ({ ...current, locked: true }));
      });
    };
    window.addEventListener("faceid-status-changed", refresh);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, value) => {
      // Do not call auth methods inside Supabase's auth-state lock.
      if (!disposed) setSession(value);
    });
    void (async () => {
      const next = await BiometricSession.status();
      if (disposed) return;
      setStatus(next); setLoading(false);
      if (next.locked) { await supabase.auth.stopAutoRefresh(); await unlock(); }
      if (disposed) return;
      const { App } = await import("@capacitor/app");
      for (const event of ["pause", "resume"] as const) {
        const onLifecycle = () => {
          void (async () => {
            const current = await BiometricSession.status();
            if (disposed || !current.enabled) return;
            setStatus({ ...current, locked: true }); setError(""); setOffer(false);
            await supabase.auth.stopAutoRefresh();
            await BiometricSession.lock();
          })().catch(() => { if (!disposed) setStatus(current => ({ ...current, locked: true })); });
        };
        const handle = event === "pause" ? await App.addListener("pause", onLifecycle) : await App.addListener("resume", onLifecycle);
        if (disposed) await handle.remove(); else removers.push(() => handle.remove());
      }
    })().catch(() => {
      if (!disposed) { setLoading(false); setStatus(current => ({ ...current, locked: true })); setError("Não foi possível acessar a sessão segura. Tente novamente."); }
    });
    return () => {
      disposed = true; subscription.unsubscribe(); window.removeEventListener("faceid-status-changed", refresh);
      for (const remove of removers) void remove();
    };
  }, [native, unlock]);

  useEffect(() => {
    if (!native || loading || !session || !status.available || status.enabled || status.locked) return;
    try { setOffer(!localStorage.getItem(preferenceKey(session.user.id))); } catch { /* Preferences unavailable: offer remains optional in Settings. */ }
  }, [native, loading, session, status]);

  const enroll = async () => {
    if (!session || working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      // Get the latest refresh token in case an OAuth profile update refreshed it.
      const current = await supabase.auth.getSession();
      if (current.error || !current.data.session) throw new Error("Entre novamente");
      await enableFaceId(current.data.session);
      localStorage.setItem(preferenceKey(session.user.id), "yes");
      setStatus(await BiometricSession.status()); setOffer(false);
    } catch { setError("O Face ID não foi ativado. Você pode tentar novamente ou continuar sem ele."); }
    finally { working.current = false; setBusy(false); }
  };
  const decline = () => {
    if (session) localStorage.setItem(preferenceKey(session.user.id), "later");
    setOffer(false); setError("");
  };
  const handleOtherLogin = async () => {
    if (working.current) return;
    working.current = true; setBusy(true);
    try {
      // Clearing the protected credential never unlocks the previous account.
      await BiometricSession.clear({ key: sessionStorageKey });
      localStorage.removeItem(sessionStorageKey);
      await supabase.auth.signOut({ scope: "local" });
      qc.clear();
      window.location.replace("/login");
    } catch { setError("Não foi possível limpar a sessão. Feche e abra o app para tentar novamente."); }
    finally { working.current = false; setBusy(false); }
  };

  if (native && (loading || status.locked)) {
    return <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-8 text-center text-foreground">
      <ScanFace className="mb-6 h-14 w-14" aria-hidden="true" />
      <h1 className="text-title-1 font-bold">+Louvor</h1>
      <p className="mt-2 mb-8 text-body text-muted-foreground">{loading ? "Abrindo sua sessão…" : "Use o Face ID para entrar."}</p>
      {error && <p role="alert" className="mb-5 max-w-sm text-footnote text-muted-foreground">{error}</p>}
      <div className="w-full max-w-sm space-y-3">
        <button type="button" className={actionClass} disabled={loading || busy} onClick={() => void unlock()}>{busy || loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}Entrar com Face ID</button>
        <button type="button" className="min-h-12 w-full text-body underline" disabled={loading || busy} onClick={() => void handleOtherLogin()}>Entrar de outra forma</button>
      </div>
    </main>;
  }
  return <>{children}{native && <AlertDialog open={offer && !!session}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <ScanFace className="mb-2 h-9 w-9" aria-hidden="true" />
        <AlertDialogTitle>Entrar com Face ID nas próximas vezes?</AlertDialogTitle>
        <AlertDialogDescription>Use o reconhecimento facial deste iPhone ou iPad para abrir sua conta com segurança. Você pode mudar essa opção nos Ajustes do app.</AlertDialogDescription>
      </AlertDialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
        <button type="button" className={actionClass} onClick={() => void enroll()} disabled={busy}>{busy && <Loader2 className="h-5 w-5 animate-spin" />}Ativar Face ID</button>
        <button type="button" className="min-h-11 text-body" onClick={decline} disabled={busy}>Agora não</button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>}</>;
}
