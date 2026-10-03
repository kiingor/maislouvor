import { useState } from "react";
import { NavLink, Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Building2, CreditCard, LayoutDashboard, LogOut, Menu, MessageSquareText, RefreshCw, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { platformError } from "@/lib/platform";
import "./admin.css";

const navigation = [
  { to: "/admin", label: "Visão geral", icon: LayoutDashboard, end: true },
  { to: "/admin/contas", label: "Contas", icon: Building2 },
  { to: "/admin/membros", label: "Membros", icon: UsersRound },
  { to: "/admin/assinaturas", label: "Assinaturas", icon: CreditCard },
  { to: "/admin/tickets", label: "Sugestões e bugs", icon: MessageSquareText },
  { to: "/admin/configuracoes", label: "Configurações", icon: Settings2 },
];

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const section = navigation.find((item) => item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))?.label ?? "Painel";
  const signOut = async () => {
    setSigningOut(true);
    const { error } = await supabase.auth.signOut();
    if (error) { toast({ className: "platform-toast", title: "Não foi possível sair", description: platformError(error), variant: "destructive" }); setSigningOut(false); return; }
    queryClient.clear();
    navigate("/login", { replace: true });
  };
  const sidebar = <div className="admin-sidebar-inner">
    <Link to="/admin" className="admin-brand" onClick={() => setOpen(false)}><span className="admin-brand-mark">+L</span><div><strong>+Louvor</strong><span>Gerenciador da plataforma</span></div></Link>
    <p className="admin-sidebar-label">ADMINISTRAÇÃO</p>
    <nav aria-label="Administração da plataforma" className="admin-navigation">{navigation.map((item) => <NavLink key={item.to} to={item.to} end={item.end}
      onClick={() => setOpen(false)} className={({ isActive }) => `admin-nav-item ${isActive ? "is-active" : ""}`}><item.icon size={18} /><span>{item.label}</span></NavLink>)}</nav>
    <div className="admin-sidebar-bottom"><div className="admin-access-note"><ShieldCheck size={17} /><div><strong>Acesso exclusivo</strong><p>Administrador da plataforma</p></div></div>
      <Link to="/app/home" className="admin-nav-item"><ArrowUpRight size={18} />Abrir aplicativo</Link>
      <button className="admin-nav-item w-full" onClick={signOut} disabled={signingOut}><LogOut size={18} />{signingOut ? "Saindo…" : "Sair da conta"}</button>
    </div>
  </div>;
  return <div className="admin-workspace">
    <aside className="admin-sidebar hidden lg:flex">{sidebar}</aside>
    <Sheet open={open} onOpenChange={setOpen}><SheetContent side="left" className="admin-mobile-sidebar w-72 border-0 p-0 text-white"><SheetTitle className="sr-only">Menu de administração</SheetTitle><SheetDescription className="sr-only">Navegue pelo painel gerenciador do +Louvor.</SheetDescription>{sidebar}</SheetContent></Sheet>
    <div className="admin-main-shell"><header className="admin-topbar"><div className="flex min-w-0 items-center gap-3"><Button variant="ghost" size="icon" aria-label="Abrir menu de administração" className="lg:hidden" onClick={() => setOpen(true)}><Menu size={20} /></Button>
      <span className="hidden text-xs text-muted-foreground sm:block">Plataforma</span><span className="hidden text-xs text-muted-foreground sm:block">/</span><span className="truncate text-sm font-medium">{section}</span></div>
      <div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Atualizar dados do painel" onClick={() => { void queryClient.invalidateQueries({ queryKey: ["platform"] }); void queryClient.invalidateQueries({ queryKey: ["support"] }); }}><RefreshCw size={16} /></Button>
        <span className="admin-topbar-role"><ShieldCheck size={13} />Administrador</span></div>
    </header><main id="admin-content" className="admin-content"><Outlet /></main><footer className="admin-footer"><span>+Louvor · Administração</span><span>Uma visão de todas as equipes.</span></footer></div>
  </div>;
}
