import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  blockUser,
  chatModerationError,
  deleteChatMessage,
  firstName,
  unblockUser,
} from "@/lib/chatModeration";
import { ReportMessageDialog, type ReportTarget } from "./ReportMessageDialog";
import type { ModeratedMessageProps } from "./ModeratedMessage";
import { useBlockedIds } from "./useBlockedUsers";

interface ChatMessageLike {
  id: string;
  sender_profile_id: string;
  message_type: string | null;
  content: string | null;
}

interface Options {
  teamId: string | null;
  profileId: string | null;
  /** Líder da equipe: pode apagar qualquer mensagem. */
  isTeamAdmin: boolean;
  /** A mensagem saiu do chat (para tirar da lista na hora, sem esperar o realtime). */
  onDeleted: (messageId: string) => void;
}

type Target = ReportTarget;

/**
 * Moderação do chat: quem está bloqueado, os diálogos de denunciar/bloquear/apagar
 * e as props de cada <ModeratedMessage>. Os diálogos são únicos para a conversa toda.
 */
export function useChatModeration({ teamId, profileId, isTeamAdmin, onDeleted }: Options) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { ids: blockedIds } = useBlockedIds(profileId);
  const [reportTarget, setReportTarget] = useState<Target | null>(null);
  const [blockTarget, setBlockTarget] = useState<Target | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<(Target & { isMe: boolean }) | null>(null);

  const refreshBlocks = () => qc.invalidateQueries({ queryKey: ["chat-blocks"] });

  const confirmBlock = async (target: Target) => {
    try {
      await blockUser(target.sender_profile_id);
      await refreshBlocks();
      toast({ title: "Usuário bloqueado", description: `As mensagens de ${firstName(target.senderName)} ficam ocultas para você.` });
    } catch (error) {
      toast({ title: "Não foi possível bloquear", description: chatModerationError(error), variant: "destructive" });
    }
  };

  const unblock = async (target: Target) => {
    try {
      await unblockUser(target.sender_profile_id);
      await refreshBlocks();
      toast({ title: "Usuário desbloqueado", description: `Você volta a ver as mensagens de ${firstName(target.senderName)}.` });
    } catch (error) {
      toast({ title: "Não foi possível desbloquear", description: chatModerationError(error), variant: "destructive" });
    }
  };

  const confirmDelete = async (target: Target) => {
    try {
      await deleteChatMessage(target.id);
      onDeleted(target.id);
      toast({ title: "Mensagem apagada" });
    } catch (error) {
      toast({ title: "Não foi possível apagar", description: chatModerationError(error), variant: "destructive" });
    }
  };

  /** Props de <ModeratedMessage> (menos children) para uma mensagem. */
  const messageProps = (
    msg: ChatMessageLike,
    isMe: boolean,
    senderName: string | null | undefined,
  ): Omit<ModeratedMessageProps, "children"> => {
    const target: Target = {
      id: msg.id,
      sender_profile_id: msg.sender_profile_id,
      senderName: senderName?.trim() || "Usuário",
      message_type: msg.message_type ?? "text",
      content: msg.content,
    };
    return {
      isMe,
      senderName: target.senderName,
      type: target.message_type,
      content: msg.content,
      blocked: !isMe && blockedIds.has(msg.sender_profile_id),
      canDelete: isMe || isTeamAdmin,
      onReport: () => setReportTarget(target),
      onBlock: () => setBlockTarget(target),
      onUnblock: () => void unblock(target),
      onDelete: () => setDeleteTarget({ ...target, isMe }),
    };
  };

  const blockName = firstName(blockTarget?.senderName);
  const dialogs = (
    <>
      <ReportMessageDialog
        open={!!reportTarget}
        onOpenChange={(open) => !open && setReportTarget(null)}
        message={reportTarget}
        teamId={teamId}
        alreadyBlocked={!!reportTarget && blockedIds.has(reportTarget.sender_profile_id)}
        onBlocked={() => void refreshBlocks()}
      />

      <AlertDialog open={!!blockTarget} onOpenChange={(open) => !open && setBlockTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear {blockName}?</AlertDialogTitle>
            <AlertDialogDescription>
              As mensagens de {blockName} ficam ocultas para você no chat. Essa pessoa não é avisada. Para desfazer,
              vá em Usuário › Perfil › Usuários bloqueados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ios-red text-white hover:bg-ios-red/90"
              onClick={() => blockTarget && void confirmBlock(blockTarget)}
            >
              Bloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isMe
                ? "A mensagem será apagada para todos da equipe."
                : `A mensagem de ${firstName(deleteTarget?.senderName)} será apagada para todos da equipe.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ios-red text-white hover:bg-ios-red/90"
              onClick={() => deleteTarget && void confirmDelete(deleteTarget)}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { messageProps, dialogs, blockedIds };
}
