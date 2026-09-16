import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useTeam } from "@/contexts/TeamContext";
import type { PermResource } from "@/lib/permissions";

/**
 * Bloqueia uma rota quando o usuário não tem permissão de "ver" o recurso.
 * Usado dentro do AppLayout (já está sob o TeamProvider).
 */
export function ResourceGuard({ resource, children }: { resource: PermResource; children: ReactNode }) {
  const { can, loading, currentTeam } = useTeam();
  if (loading) return null;
  // Sem equipe ainda: deixa a própria página tratar o estado vazio.
  if (currentTeam && !can(resource, "ver")) {
    return <Navigate to="/app/home" replace />;
  }
  return <>{children}</>;
}
