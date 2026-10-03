import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { useBlockedUsers } from "@/components/chat/useBlockedUsers";
import { chatModerationError, firstName, unblockUser } from "@/lib/chatModeration";
import { cn } from "@/lib/utils";

/* Lista agrupada no estilo do app Ajustes (mesmas medidas de TeamSettings). */
const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_LABEL = "mx-4 mb-1.5 text-footnote text-muted-foreground";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";
const ROW_BODY =
  "flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-t border-separator py-2 pr-4 group-first/row:border-t-0";
const CAPSULE_SM =
  "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3.5 text-subhead font-semibold transition-[background-color,transform,opacity] active:scale-[0.97] disabled:opacity-40 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']";

/** Usuário › Meu usuário › Usuários bloqueados: quem eu bloqueei no chat, com opção de desbloquear. */
export function BlockedUsersSettings() {
  const { profileId } = useTeam();
  const { toast } = useToast();
  const qc = useQueryClient();
  const blocked = useBlockedUsers(profileId);
  const [busy, setBusy] = useState<string | null>(null);

  const handleUnblock = async (id: string, name: string | null) => {
    setBusy(id);
    try {
      await unblockUser(id);
      await qc.invalidateQueries({ queryKey: ["chat-blocks"] });
      toast({ title: "Usuário desbloqueado", description: `Você volta a ver as mensagens de ${firstName(name)}.` });
    } catch (error) {
      toast({ title: "Não foi possível desbloquear", description: chatModerationError(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (!profileId) return null;
  const list = blocked.data ?? [];

  return (
    <section aria-labelledby="settings-blocked-users">
      <h2 id="settings-blocked-users" className={GROUP_LABEL}>Usuários bloqueados</h2>
      <div className={GROUP}>
        {blocked.isPending ? (
          <p className="flex min-h-[52px] items-center gap-2 px-4 text-subhead text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando…
          </p>
        ) : blocked.error ? (
          <p className="flex min-h-[52px] items-center px-4 text-subhead text-muted-foreground" role="alert">
            {chatModerationError(blocked.error)}
          </p>
        ) : !list.length ? (
          <p className="flex min-h-[52px] items-center px-4 text-subhead text-muted-foreground">Você não bloqueou ninguém.</p>
        ) : (
          list.map((user) => (
            <div key={user.profile_id} className="group/row flex items-center gap-3 pl-4">
              <Avatar className="h-[30px] w-[30px]">
                {user.avatar_url ? <AvatarImage src={user.avatar_url} alt="" className="object-cover" /> : null}
                <AvatarFallback className="bg-fill-tertiary text-caption1 font-semibold text-muted-foreground">
                  {(user.full_name ?? "?")[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className={ROW_BODY}>
                <span className="min-w-0 flex-1 truncate text-body">{user.full_name || "Sem nome"}</span>
                <button
                  type="button"
                  disabled={busy === user.profile_id}
                  onClick={() => void handleUnblock(user.profile_id, user.full_name)}
                  aria-label={`Desbloquear ${user.full_name || "usuário"}`}
                  className={cn(CAPSULE_SM, "bg-fill-tertiary text-foreground hover:bg-fill-secondary")}
                >
                  {busy === user.profile_id && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                  Desbloquear
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <p className={GROUP_FOOTER}>
        Mensagens de quem você bloqueou ficam ocultas no chat. A pessoa não é avisada. Para bloquear alguém, toque e
        segure uma mensagem dela no chat.
      </p>
    </section>
  );
}
