import { useState, useEffect } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { syncPushSubscription, registerNativePush } from "@/lib/push";
import { useTeam } from "@/contexts/TeamContext";
import { Home, Music, LogOut, Menu, X, User, CalendarDays, CalendarCheck, MessageCircle, Megaphone, Sparkles, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";
import { TeamProvider } from "@/contexts/TeamContext";
import { NotificationBell } from "@/components/NotificationBell";
import { BottomNav } from "@/components/BottomNav";
import { SendNotificationModal } from "@/components/SendNotificationModal";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { BrandMark } from "@/components/BrandMark";

function AppLayoutInner() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const { can } = useTeam();

  // Push: web (sync da assinatura) + nativo Android (registro FCM).
  useEffect(() => {
    syncPushSubscription();
    registerNativePush((link) => navigate(link));
  }, [navigate]);

  const navItems = [
    { title: "Início", href: "/app/home", icon: Home },
    { title: "Repertório", href: "/app/repertorios", icon: Music, resource: "repertorios" as const },
    { title: "Cultos", href: "/app/cultos", icon: CalendarDays, resource: "cultos" as const },
    { title: "Chat", href: "/app/chat", icon: MessageCircle, resource: "chat" as const },
    { title: "Disponibilidades", href: "/app/disponibilidades", icon: CalendarCheck },
    // Relatórios são de gestão da equipe → só para quem edita cultos.
    { title: "Relatórios", href: "/app/relatorios", icon: BarChart3, resource: "cultos" as const, action: "editar" as const },
    // OCULTO até a gamificação ser liberada:
    // { title: "Jornada", href: "/app/gamificacao", icon: Sparkles },
    { title: "Usuário", href: "/app/settings", icon: User },
  ].filter((item) => !item.resource || can(item.resource, (item as any).action ?? "ver"));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-background relative overflow-hidden">
      {/* Ambient glass orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-foreground/[0.03] blur-3xl" />
        <div className="absolute top-1/3 -right-48 w-[500px] h-[500px] rounded-full bg-foreground/[0.02] blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 w-80 h-80 rounded-full bg-foreground/[0.03] blur-3xl" />
      </div>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-foreground/10 backdrop-blur-sm z-40 lg:hidden animate-in-fade"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 z-50 h-screen w-64 flex flex-col transition-transform duration-300 ease-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="m-3 flex-1 flex flex-col rounded-2xl glass-sidebar overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-md bg-foreground flex items-center justify-center shadow-lg">
                <BrandMark className="h-5 w-5 text-background" />
              </div>
              <div>
                <span className="text-lg font-semibold tracking-tight leading-none">+Louvor</span>
                <span className="block text-[10px] font-light text-muted-foreground tracking-wide">Gestão de Louvor</span>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-3 pb-3">
            <TeamSwitcher />
          </div>

          <nav className="flex-1 px-3 space-y-0.5">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-200"
                activeClassName="bg-accent/80 text-foreground shadow-sm"
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className="h-4 w-4" />
                {item.title}
              </NavLink>
            ))}
          </nav>

          <div className="p-3 border-t border-white/[0.08] space-y-0.5">
            {can("avisos", "editar") && (
              <button
                onClick={() => { setNotifModalOpen(true); setSidebarOpen(false); }}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-200"
              >
                <Megaphone className="h-4 w-4" />
                Enviar aviso
              </button>
            )}
            <div className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-all duration-200">
              <NotificationBell variant="sidebar" />
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="shrink-0 z-30 flex items-center gap-2 px-4 lg:hidden pt-[max(env(safe-area-inset-top),1rem)] pb-1 min-h-[calc(3.25rem+env(safe-area-inset-top))]">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-xl hover:bg-accent transition-colors shrink-0"
          >
            <Menu className="h-5 w-5" />
          </button>
          <TeamSwitcher compact />
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:px-8 lg:pt-6 lg:pb-8 pb-[calc(4rem+env(safe-area-inset-bottom))]">
          <Outlet />
        </main>

        <BottomNav hidden={sidebarOpen} />
        <SendNotificationModal open={notifModalOpen} onOpenChange={setNotifModalOpen} />
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <TeamProvider>
      <AppLayoutInner />
    </TeamProvider>
  );
}
