import { useState } from "react";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
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
  chatModerationError,
  deleteChatMessage,
  moderateChatReport,
  type ChatReport,
  type ModerationAction,
} from "@/lib/chatModeration";
import { cn } from "@/lib/utils";
import { ResolveReportDialog } from "./ResolveReportDialog";

const statusToasts: Record<ModerationAction, string> = {
  em_analise: "Denúncia em análise",
  resolvida: "Denúncia resolvida",
  descartada: "Denúncia descartada",
};

interface Options {
  /** Consultas a atualizar depois de cada ação. */
  invalidate: QueryKey[];
  /** Painel da plataforma: diálogos e avisos com o tema do gerenciador. */
  platform?: boolean;
}

/** Ações sobre denúncias (liderança e plataforma) e os diálogos de confirmação. */
export function useReportModeration({ invalidate, platform = false }: Options) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const toastClass = platform ? "platform-toast" : undefined;
  const [resolving, setResolving] = useState<ChatReport | null>(null);
  const [deleting, setDeleting] = useState<ChatReport | null>(null);

  const refresh = async () => {
    await Promise.all(invalidate.map((queryKey) => qc.invalidateQueries({ queryKey })));
  };

  const moderate = useMutation({
    mutationFn: (vars: { report: ChatReport; status: ModerationAction; note?: string; removeMember?: boolean }) =>
      moderateChatReport(vars.report.id, vars.status, vars.note, vars.removeMember),
    onSuccess: async (result, vars) => {
      setResolving(null);
      if (result.member_removed) void qc.invalidateQueries({ queryKey: ["team-members"] });
      await refresh();
      toast({
        className: toastClass,
        title: statusToasts[vars.status],
        description: result.member_removed ? "Quem enviou a mensagem foi removido da equipe." : undefined,
      });
    },
    onError: (error) =>
      toast({ className: toastClass, title: "Não foi possível atualizar a denúncia", description: chatModerationError(error), variant: "destructive" }),
  });

  const removeMessage = useMutation({
    mutationFn: (report: ChatReport) => deleteChatMessage(report.message_id!),
    onSuccess: async () => {
      await refresh();
      toast({ className: toastClass, title: "Mensagem apagada", description: "A cópia continua na denúncia como registro." });
    },
    onError: (error) =>
      toast({ className: toastClass, title: "Não foi possível apagar a mensagem", description: chatModerationError(error), variant: "destructive" }),
  });

  const busyId = moderate.isPending ? moderate.variables?.report.id : removeMessage.isPending ? removeMessage.variables?.id : null;

  const dialogs = (
    <>
      <ResolveReportDialog
        report={resolving}
        onOpenChange={(open) => !open && setResolving(null)}
        pending={moderate.isPending}
        platform={platform}
        onConfirm={(note, removeMember) =>
          resolving && moderate.mutate({ report: resolving, status: "resolvida", note, removeMember })
        }
      />
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent className={cn(platform && "platform-dialog bg-white")}>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar a mensagem denunciada?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem sai do chat para todos da equipe. A cópia continua nesta denúncia como registro.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-ios-red text-white hover:bg-ios-red/90"
              onClick={() => deleting && removeMessage.mutate(deleting)}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return {
    /** Em análise ou descartar, direto. */
    setStatus: (report: ChatReport, status: Exclude<ModerationAction, "resolvida">) => moderate.mutate({ report, status }),
    /** Abre o diálogo de resolver. */
    resolve: setResolving,
    /** Abre a confirmação de apagar a mensagem. */
    deleteMessage: setDeleting,
    busyId,
    dialogs,
  };
}
