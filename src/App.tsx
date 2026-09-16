import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { AuthGuard } from "./components/AuthGuard";
import { AppLayout } from "./components/AppLayout";
import { ResourceGuard } from "./components/ResourceGuard";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Login e NotFound continuam estáticos: Login é a primeira tela em quase todo
// acesso, e carregá-la sob demanda só adicionaria uma ida ao servidor.
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// As demais páginas são carregadas sob demanda. Antes, as 21 telas iam num único
// chunk de 1,93 MB — a tela de login baixava o player, os gráficos e o motor de
// áudio antes de desenhar qualquer coisa.
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const Download = lazy(() => import("./pages/Download"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const SignUp = lazy(() => import("./pages/SignUp"));
const Repertorios = lazy(() => import("./pages/Repertorios"));
const RepertorioDetail = lazy(() => import("./pages/RepertorioDetail"));
const Cultos = lazy(() => import("./pages/Cultos"));
const CultoDetail = lazy(() => import("./pages/CultoDetail"));
const SongEditor = lazy(() => import("./pages/SongEditor"));
const Presentation = lazy(() => import("./pages/Presentation"));
const TeamSettings = lazy(() => import("./pages/TeamSettings"));
const Disponibilidades = lazy(() => import("./pages/Disponibilidades"));
const ChangePassword = lazy(() => import("./pages/ChangePassword"));
const Home = lazy(() => import("./pages/Home"));
const Chat = lazy(() => import("./pages/Chat"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const PublicPlaylist = lazy(() => import("./pages/PublicPlaylist"));
const PublicCulto = lazy(() => import("./pages/PublicCulto"));
// Rota ainda desativada (ver abaixo); sob demanda, mantém o three.js fora do bundle inicial.
const Gamificacao = lazy(() => import("./pages/Gamificacao"));

/** Mostrado enquanto o chunk da rota é baixado. */
function RouteFallback() {
  return (
    <div
      style={{
        minHeight: "60dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "hsl(var(--muted-foreground))",
        fontSize: "0.9rem",
      }}
    >
      Carregando…
    </div>
  );
}

const queryClient = new QueryClient();

/**
 * No app nativo (Capacitor), o login Google volta por um deep link
 * (com.maislouvor.app://auth/callback#access_token=...). Aqui capturamos esse
 * retorno, gravamos a sessão e seguimos pro app, fechando a aba do navegador.
 */
function NativeAuthHandler() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    (async () => {
      const { App: CapApp } = await import("@capacitor/app");
      const { Browser } = await import("@capacitor/browser");
      const handle = await CapApp.addListener("appUrlOpen", async ({ url }) => {
        if (!url || !url.includes("auth/callback")) return;
        const frag = url.split("#")[1];
        if (frag) {
          const p = new URLSearchParams(frag);
          const access_token = p.get("access_token");
          const refresh_token = p.get("refresh_token");
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        }
        try { await Browser.close(); } catch { /* ignore */ }
        navigate("/app/home", { replace: true });
      });
      remove = () => handle.remove();
    })();
    return () => { if (remove) remove(); };
  }, [navigate]);
  return null;
}

const App = () => {
  // If installed from a playlist, redirect to that playlist on PWA launch.
  // Em WebView com armazenamento bloqueado, localStorage lança em vez de devolver
  // null — e isto roda no corpo do render, então a exceção derrubaria o app inteiro.
  let defaultRedirect = "/login";
  try {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (window.navigator as any).standalone === true;

    const savedStartUrl = localStorage.getItem("pwa_start_url");
    if (isStandalone && savedStartUrl) defaultRedirect = savedStartUrl;
  } catch {
    /* sem acesso a storage/matchMedia: segue para o login */
  }

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <NativeAuthHandler />
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={defaultRedirect} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/baixar" element={<Download />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/playlist/:token" element={<PublicPlaylist />} />
          <Route path="/culto/:token" element={<PublicCulto />} />
          <Route
            path="/app/cultos/:id/present"
            element={
              <AuthGuard>
                <ErrorBoundary scope="ensaio-culto">
                  <Presentation source="culto" />
                </ErrorBoundary>
              </AuthGuard>
            }
          />
          <Route
            path="/app/repertorios/:id/present"
            element={
              <AuthGuard>
                <ErrorBoundary scope="ensaio-repertorio">
                  <Presentation source="repertorio" />
                </ErrorBoundary>
              </AuthGuard>
            }
          />
          <Route
            path="/app"
            element={
              <AuthGuard>
                <AppLayout />
              </AuthGuard>
            }
          >
            <Route index element={<Navigate to="home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="repertorios" element={<ResourceGuard resource="repertorios"><Repertorios /></ResourceGuard>} />
            <Route path="repertorios/:id" element={<ResourceGuard resource="repertorios"><RepertorioDetail /></ResourceGuard>} />
            <Route path="cultos" element={<ResourceGuard resource="cultos"><Cultos /></ResourceGuard>} />
            <Route path="cultos/:id" element={<ResourceGuard resource="cultos"><CultoDetail /></ResourceGuard>} />
            <Route path="songs/:id" element={<ResourceGuard resource="musicas"><SongEditor /></ResourceGuard>} />
            <Route path="disponibilidades" element={<Disponibilidades />} />
            <Route path="relatorios" element={<ResourceGuard resource="cultos"><Relatorios /></ResourceGuard>} />
            {/* OCULTO até a gamificação ser liberada: */}
            {/* <Route path="gamificacao" element={<Gamificacao />} /> */}
            <Route path="chat" element={<ResourceGuard resource="chat"><Chat /></ResourceGuard>} />
            <Route path="settings" element={<TeamSettings />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
