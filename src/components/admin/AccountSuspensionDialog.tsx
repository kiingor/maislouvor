import { useEffect, useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
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
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  SUSPENSION_REASON_MAX,
  setAccountSuspension,
  teamsNeedingNewOwner,
  type SuspensionResult,
} from "@/lib/platformSuspension";

export interface SuspensionTarget {
  profileId: string;
  name: string | null;
  /** Já suspensa: o diálogo oferece reativar. */
  suspended: boolean;
  /** Denúncia que motivou (fica no registro). */
  reportId?: string | null;
  defaultReason?: string;
}

/**
 * Suspender ou reativar uma conta (painel da plataforma). Suspensa, a pessoa não
 * entra mais no +Louvor; os dados e as equipes continuam. Dona de uma equipe com
 * outros membros: o aviso final pede para passar a propriedade na página da conta.
 */
export function AccountSuspensionDialog({ target, onClose, onDone }: {
  target: SuspensionTarget | null;
  onClose: () => void;
  onDone?: (result: SuspensionResult) => unknown;
}) {
  const { toast } = useToast();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (target) setReason(target.defaultReason ?? "");
  }, [target]);

  const suspend = !target?.suspended;
  const name = target?.name || "esta pessoa";
  const mutation = useMutation({
    mutationFn: (vars: SuspensionTarget & { reason: string }) =>
      setAccountSuspension(vars.profileId, vars.suspended ? "reactivate" : "suspend", { reason: vars.reason, reportId: vars.reportId }),
    onSuccess: async (result) => {
      const pending = teamsNeedingNewOwner(result.ownedTeams);
      toast({
        className: "platform-toast",
        title: result.suspended ? "Conta suspensa" : "Conta reativada",
        description: !result.suspended
          ? "A pessoa já pode entrar de novo."
          : pending.length
            ? `Também é dona de ${pending.map((team) => team.team_name).join(", ")}: passe a propriedade para outro membro na página da conta.`
            : "A pessoa não entra mais no +Louvor. As sessões abertas caem em até 1 hora.",
      });
      onClose();
      await onDone?.(result);
    },
    onError: (error) =>
      toast({
        className: "platform-toast",
        title: suspend ? "Não foi possível suspender" : "Não foi possível reativar",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      }),
  });

  return (
    <AlertDialog open={!!target} onOpenChange={(open) => { if (!open && !mutation.isPending) onClose(); }}>
      <AlertDialogContent className="platform-dialog bg-white">
        <AlertDialogHeader>
          <AlertDialogTitle>{suspend ? `Suspender a conta de ${name}?` : `Reativar a conta de ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {suspend
              ? "A pessoa não consegue mais entrar no +Louvor, no app nem no site; as sessões abertas caem em até 1 hora. Os dados e as equipes continuam, e dá para reativar depois."
              : "A pessoa volta a entrar normalmente. A suspensão continua no histórico administrativo."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {suspend && (
          <div className="space-y-1.5">
            <label htmlFor={reasonId} className="block text-xs font-medium">Motivo (fica no registro)</label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(event) => setReason(event.target.value.slice(0, SUSPENSION_REASON_MAX))}
              maxLength={SUSPENSION_REASON_MAX}
              rows={3}
              disabled={mutation.isPending}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className={suspend ? "bg-ios-red text-white hover:bg-ios-red/90" : undefined}
            disabled={mutation.isPending}
            onClick={(event) => {
              event.preventDefault();
              if (target) mutation.mutate({ ...target, reason });
            }}
          >
            {mutation.isPending ? "Salvando…" : suspend ? "Suspender" : "Reativar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
