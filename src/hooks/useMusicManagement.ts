import { useTeam } from "@/contexts/TeamContext";
import { musicManagementEnabled } from "@/lib/storeBuild";

/** Disponibilidade das telas de cadastro. As permissões de ensaio são independentes. */
export function useMusicManagement() {
  const { isAdmin, can } = useTeam();
  const web = musicManagementEnabled();
  const leaderOnWeb = web && isAdmin;
  return {
    canAuthorSongs: leaderOnWeb && can("musicas", "editar"),
    canCreateRepertoire: leaderOnWeb && can("repertorios", "editar"),
    canShowSongWebNotice: !web && isAdmin && can("musicas", "editar"),
    canShowRepertoireWebNotice: !web && isAdmin && can("repertorios", "editar"),
  };
}
