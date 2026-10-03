import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBlockedUsers } from "@/lib/chatModeration";

/** Chave da lista de bloqueados (Chat, Início e Usuário › Usuários bloqueados usam a mesma). */
export const blockedUsersKey = (profileId: string | null) => ["chat-blocks", profileId] as const;

/** Lista de pessoas que eu bloqueei. */
export function useBlockedUsers(profileId: string | null) {
  return useQuery({
    queryKey: blockedUsersKey(profileId),
    queryFn: listBlockedUsers,
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

/** Ids de quem eu bloqueei, para esconder as mensagens dessas pessoas. */
export function useBlockedIds(profileId: string | null) {
  const blocks = useBlockedUsers(profileId);
  const ids = useMemo(() => new Set((blocks.data ?? []).map((b) => b.profile_id)), [blocks.data]);
  return { ids, loading: blocks.isLoading };
}
