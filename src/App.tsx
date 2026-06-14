import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import SignUp from "./pages/SignUp";
import Repertorios from "./pages/Repertorios";
import RepertorioDetail from "./pages/RepertorioDetail";
import Cultos from "./pages/Cultos";
import CultoDetail from "./pages/CultoDetail";
import SongEditor from "./pages/SongEditor";
import Presentation from "./pages/Presentation";
import TeamSettings from "./pages/TeamSettings";
import Disponibilidades from "./pages/Disponibilidades";
import ChangePassword from "./pages/ChangePassword";
import Home from "./pages/Home";
import Chat from "./pages/Chat";
import AcceptInvite from "./pages/AcceptInvite";
import NotFound from "./pages/NotFound";
import PublicPlaylist from "./pages/PublicPlaylist";
import { AuthGuard } from "./components/AuthGuard";
import { AppLayout } from "./components/AppLayout";

const queryClient = new QueryClient();


const App = () => {
  // If installed from a playlist, redirect to that playlist on PWA launch
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    (window.navigator as any).standalone === true;

  const savedStartUrl = localStorage.getItem("pwa_start_url");
  const defaultRedirect = isStandalone && savedStartUrl ? savedStartUrl : "/login";

  return (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={defaultRedirect} replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite/:token" element={<AcceptInvite />} />
          <Route path="/playlist/:token" element={<PublicPlaylist />} />
          <Route
            path="/app/cultos/:id/present"
            element={
              <AuthGuard>
                <Presentation source="culto" />
              </AuthGuard>
            }
          />
          <Route
            path="/app/repertorios/:id/present"
            element={
              <AuthGuard>
                <Presentation source="repertorio" />
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
            <Route path="repertorios" element={<Repertorios />} />
            <Route path="repertorios/:id" element={<RepertorioDetail />} />
            <Route path="cultos" element={<Cultos />} />
            <Route path="cultos/:id" element={<CultoDetail />} />
            <Route path="songs/:id" element={<SongEditor />} />
            <Route path="disponibilidades" element={<Disponibilidades />} />
            <Route path="chat" element={<Chat />} />
            <Route path="settings" element={<TeamSettings />} />
            <Route path="change-password" element={<ChangePassword />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
};

export default App;
