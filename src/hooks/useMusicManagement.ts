import { useTeam } from "@/contexts/TeamContext";
import { musicManagementEnabled } from "@/lib/storeBuild";

/** Disponibilidade das telas de cadastro. As permissões de ensaio são independentes. */
export function useMusicManagement() {
  const { isAdmin, can } = useTeam();
  const leaderOnWeb = musicManagementEnabled() && isAdmin;
  return {
    canAuthorSongs: leaderOnWeb && can("musicas", "editar"),
    canCreateRepertoire: leaderOnWeb && can("repertorios", "editar"),
  };
}
