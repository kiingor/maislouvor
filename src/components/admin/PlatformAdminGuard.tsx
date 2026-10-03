import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { usePlatformAccess } from "@/contexts/PlatformAccessContext";
import { Button } from "@/components/ui/button";
import { QueryState } from "./AdminUI";
import "./admin.css";

export function PlatformAdminGuard({ children }: { children: ReactNode }) {
  const { userId, isPlatformAdmin, loading, error, refetch } = usePlatformAccess();
  const location = useLocation();
  if (loading) return <div className="platform-support min-h-screen bg-background"><QueryState loading /></div>;
  if (!userId) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (error) return <div className="platform-support flex min-h-screen flex-col items-center justify-center"><QueryState error={error} retry={refetch} /><Button variant="link" asChild><Link to="/app/home">Voltar ao aplicativo</Link></Button></div>;
  if (!isPlatformAdmin) return <div className="platform-support flex min-h-screen items-center justify-center bg-background p-6"><div className="max-w-sm text-center">
    <ShieldCheck size={38} className="mx-auto mb-5 text-muted-foreground" /><h1 className="text-2xl font-semibold tracking-tight">Acesso restrito</h1>
    <p className="my-4 text-sm leading-relaxed text-muted-foreground">Este painel é exclusivo do administrador do +Louvor. Entre com a conta autorizada para continuar.</p>
    <Button asChild><Link to="/app/home">Voltar ao aplicativo</Link></Button>
  </div></div>;
  return <>{children}</>;
}
