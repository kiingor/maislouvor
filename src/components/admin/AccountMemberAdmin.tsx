import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { platformError, type AccountMember } from "@/lib/platform";
import { listTeamMemberSuspensions, transferTeamOwnershipAsPlatform } from "@/lib/platformSuspension";
import { AccountSuspensionDialog, type SuspensionTarget } from "./AccountSuspensionDialog";

/**
 * Página da conta no painel (/admin/contas/:id), aba Membros: situação de cada
 * conta (suspensa ou não), suspender/reativar e passar a propriedade da equipe
 * para outro membro — o caminho para afastar um dono que abusa, que a moderação
 * da equipe não remove.
 */
export function useAccountMemberAdmin(teamId: string | undefined, ownerProfileId: string | undefined, teamName: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [suspending, setSuspending] = useState<SuspensionTarget | null>(null);
  const [transferring, setTransferring] = useState<AccountMember | null>(null);
  const statusKey = ["platform", "account-suspensions", teamId];
  const statuses = useQuery({
    queryKey: statusKey,
    queryFn: () => listTeamMemberSuspensions(teamId!),
    enabled: !!teamId,
  });
  const byMember = new Map((statuses.data ?? []).map((s) => [s.member_id, s]));

  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: statusKey }),
    qc.invalidateQueries({ queryKey: ["platform", "account", teamId] }),
  ]);

  const transfer = useMutation({
    mutationFn: (member: AccountMember) => transferTeamOwnershipAsPlatform(teamId!, member.id),
    onSuccess: async (_result, member) => {
      setTransferring(null);
      await refresh();
      toast({
        className: "platform-toast",
        title: "Propriedade transferida",
        description: `${member.full_name || "A pessoa escolhida"} agora é responsável e líder da equipe.`,
      });
    },
    onError: (error) =>
      toast({ className: "platform-toast", title: "Não foi possível transferir", description: platformError(error), variant: "destructive" }),
  });

  const cell = (member: AccountMember): ReactNode => {
    const status = byMember.get(member.id);
    if (!status) return <span className="text-muted-foreground">—</span>;
    const owner = status.profile_id === ownerProfileId;
    return (
      <div className="flex flex-wrap items-center gap-2">
        {owner && <span className="admin-badge admin-badge-neutral">Responsável</span>}
        {status.suspended && <span className="admin-badge admin-badge-danger">Suspensa</span>}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setSuspending({ profileId: status.profile_id, name: member.full_name, suspended: status.suspended })}
        >
          {status.suspended ? <><UserCheck size={14} className="mr-2" />Reativar</> : <><UserX size={14} className="mr-2" />Suspender</>}
        </Button>
        {!owner && !status.suspended && (
          <Button size="sm" variant="outline" onClick={() => setTransferring(member)}>
            <Crown size={14} className="mr-2" />Tornar responsável
          </Button>
        )}
      </div>
    );
  };

  const dialogs = (
    <>
      <AccountSuspensionDialog target={suspending} onClose={() => setSuspending(null)} onDone={() => refresh()} />
      <AlertDialog open={!!transferring} onOpenChange={(open) => { if (!open && !transfer.isPending) setTransferring(null); }}>
        <AlertDialogContent className="platform-dialog bg-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Passar a propriedade para {transferring?.full_name || "esta pessoa"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {transferring?.full_name || "A pessoa"} passa a ser responsável e líder de {teamName || "esta equipe"} e recebe uma
              notificação. Quem era responsável continua na equipe: para tirá-lo, resolva a denúncia com “remover da equipe”
              ou suspenda a conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={transfer.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={transfer.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (transferring) transfer.mutate(transferring);
              }}
            >
              {transfer.isPending ? "Transferindo…" : "Transferir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  return { cell, dialogs };
}
