import { useState, useEffect, Suspense } from "react";
import { prefetchAppScreens } from "@/lib/routeLoaders";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { syncPushSubscription, registerNativePush } from "@/lib/push";
import { useTeam } from "@/contexts/TeamContext";
import { Home, Music, LogOut, UserRound, CalendarDays, CalendarCheck, MessageCircle, Megaphone, BarChart3, MessageSquareText, ShieldCheck } from "lucide-react";
import { usePlatformAccess } from "@/contexts/PlatformAccessContext";
import { NavLink } from "@/components/NavLink";
import { TeamProvider } from "@/contexts/TeamContext";
import { ShellProvider, useShell } from "@/contexts/ShellContext";
import { NotificationBell } from "@/components/NotificationBell";
import { SendNotificationModal } from "@/components/SendNotificationModal";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { BrandMark } from "@/components/BrandMark";
import { AppearanceSegmented } from "@/components/AppearanceControl";
import { TopBar } from "@/components/shell/TopBar";
import { TabBar } from "@/components/shell/TabBar";
import { ScrollEdge } from "@/components/shell/ScrollEdge";

function AppLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const shell = useShell()!;
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { can } = useTeam();
  const { isPlatformAdmin } = usePlatformAccess();

  // Push: web (sync da assinatura) + nativo Android (registro FCM).
  useEffect(() => {
    syncPushSubscription();
    registerNativePush((link) => navigate(link));
  }, [navigate]);

  // Pré-carrega as outras telas depois que o app abriu (troca de aba instantânea).
  useEffect(() => {
    const t = setTimeout(prefetchAppScreens, 1200);
    return () => clearTimeout(t);
  }, []);

  // Borda de rolagem superior só quando há conteúdo passando por baixo da barra.
  useEffect(() => {
    const el = shell.scrollEl;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 2);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [shell.scrollEl]);

  // Cada tela começa do topo.
  useEffect(() => {
    shell.scrollEl?.scrollTo({ top: 0 });
  }, [location.pathname, shell.scrollEl]);

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
    { title: "Usuário", href: "/app/settings", icon: UserRound },
    { title: "Sugestões e suporte", href: "/app/sugestoes", icon: MessageSquareText },
    ...(isPlatformAdmin ? [{ title: "Gerenciador", href: "/admin", icon: ShieldCheck }] : []),
  ].filter((item) => !item.resource || can(item.resource, (item as any).action ?? "ver"));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="h-[100dvh] flex bg-background overflow-hidden">
      {/* Desktop: barra lateral de vidro flutuante (estilo iPadOS). */}
      <aside className="hidden lg:flex w-72 shrink-0 p-3">
        <div className="liquid-glass-thick flex-1 flex flex-col rounded-[26px] overflow-hidden">
          <div className="relative z-[4] flex items-center gap-2.5 px-5 pt-5 pb-4">
            {/* Mesma cor do ícone do app (grafite da marca) nos dois temas. */}
            <div className="h-9 w-9 rounded-[10px] bg-[#1C1B17] dark:ring-1 dark:ring-inset dark:ring-white/10 flex items-center justify-center">
              <BrandMark className="h-5 w-5 text-white" />
            </div>
            <div>
              <span className="block text-headline leading-none">+Louvor</span>
              <span className="block text-caption1 text-muted-foreground mt-1">Gestão de Louvor</span>
            </div>
          </div>

          <div className="relative z-[4] px-3 pb-3">
            <TeamSwitcher />
          </div>

          <nav className="relative z-[4] flex-1 px-3 space-y-0.5 overflow-y-auto" aria-label="Seções">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className="flex items-center gap-3 h-11 px-3 rounded-[12px] text-subhead font-medium text-foreground hover:bg-fill-tertiary transition-colors"
                activeClassName="bg-fill-secondary !text-primary font-semibold"
              >
                <item.icon className="h-[19px] w-[19px]" strokeWidth={2} aria-hidden="true" />
                {item.title}
              </NavLink>
            ))}
          </nav>

          <div className="relative z-[4] p-3 border-t border-separator space-y-0.5">
            <div className="px-1 pb-2">
              <AppearanceSegmented compact />
            </div>
            {can("avisos", "editar") && (
              <button
                onClick={() => setNotifModalOpen(true)}
                className="flex items-center gap-3 w-full h-11 px-3 rounded-[12px] text-subhead font-medium hover:bg-fill-tertiary transition-colors"
              >
                <Megaphone className="h-[19px] w-[19px]" aria-hidden="true" />
                Enviar aviso
              </button>
            )}
            <div className="flex items-center gap-3 w-full min-h-11 px-3 rounded-[12px] text-subhead font-medium hover:bg-fill-tertiary transition-colors">
              <NotificationBell variant="sidebar" />
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full h-11 px-3 rounded-[12px] text-subhead font-medium text-ios-red hover:bg-ios-red/10 transition-colors"
            >
              <LogOut className="h-[19px] w-[19px]" aria-hidden="true" />
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Coluna de conteúdo: camada de conteúdo rolável + camada funcional flutuante. */}
      <div className="relative flex-1 min-w-0 h-full overflow-hidden">
        <main
          ref={shell.setScrollEl}
          className="shell-scroll absolute inset-0 overflow-y-auto overflow-x-hidden"
        >
          <div className="mx-auto w-full max-w-6xl px-4 min-[430px]:px-5 lg:px-8 pt-[calc(max(env(safe-area-inset-top),12px)+56px)] lg:pt-8 pb-[calc(max(env(safe-area-inset-bottom),8px)+96px)] lg:pb-10">
            {/* Suspense aqui dentro: se uma tela ainda estiver baixando, só o conteúdo espera —
                barras, abas e equipe continuam montadas (antes o app inteiro virava "Carregando…"). */}
            <Suspense fallback={<div className="min-h-[60dvh]" aria-busy="true" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>

        {/* Celular: borda de rolagem progressiva sob as barras flutuantes. */}
        {!shell.hideTopBar && (
          <ScrollEdge
            position="top"
            active={scrolled}
            className="lg:hidden"
            style={{ height: "calc(max(env(safe-area-inset-top), 12px) + 66px)", top: 0 }}
          />
        )}
        <ScrollEdge
          position="bottom"
          active={!shell.hideTabBar}
          className={shell.hideTabBar ? "hidden" : "lg:hidden"}
          style={{ height: "calc(max(env(safe-area-inset-bottom), 8px) + 92px)", bottom: 0 }}
        />
        <TopBar onSendNotice={() => setNotifModalOpen(true)} onLogout={handleLogout} />
        <TabBar hidden={shell.hideTabBar} />
        <SendNotificationModal open={notifModalOpen} onOpenChange={setNotifModalOpen} />
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <TeamProvider>
      <ShellProvider>
        <AppLayoutInner />
      </ShellProvider>
    </TeamProvider>
  );
}
