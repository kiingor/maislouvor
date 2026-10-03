import { useEffect, useId, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2, UserRoundCheck, LogOut, Crown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DELETE_ACCOUNT_ANCHOR, LEGAL_PATHS } from "@/lib/legal";
import {
  AccountDeletionError,
  DELETE_CONFIRMATION,
  clearLocalAccountData,
  fetchDeletionPreview,
  isConfirmationTyped,
  promoteTeamLeader,
  requestAccountDeletion,
  transferTeamOwnership,
  type DeletionTeam,
} from "@/lib/accountDeletion";

/* Lista agrupada no estilo do app Ajustes (mesmas medidas de TeamSettings). */
const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_LABEL = "mx-4 mb-1.5 text-footnote text-muted-foreground";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";

export const DELETION_PREVIEW_KEY = ["account-deletion-preview"];

const ROLE_LABELS = { admin: "Líder", editor: "Editor", viewer: "Membro" } as const;

const STATUS: Record<DeletionTeam["action"], { label: string; icon: LucideIcon; tone: string }> = {
  delete_team: { label: "Será excluída com a conta", icon: Trash2, tone: "text-ios-red" },
  leave: { label: "Você sai da equipe", icon: LogOut, tone: "text-muted-foreground" },
  transfer_required: { label: "Transfira a propriedade", icon: Crown, tone: "text-ios-orange" },
  promote_required: { label: "Escolha um novo líder", icon: UserRoundCheck, tone: "text-ios-orange" },
};

const HELP: Record<DeletionTeam["action"], string> = {
  delete_team: "Você é o único membro: músicas, repertórios, cultos, chat e arquivos desta equipe serão apagados.",
  leave: "O que você criou continua com a equipe, sem o seu nome.",
  transfer_required: "Você é dono(a) desta equipe. Escolha quem assume; a pessoa também vira líder.",
  promote_required: "Você é o único líder. Promova alguém para a equipe não ficar sem liderança.",
};

/** Equipe que bloqueia a exclusão: escolher quem assume e resolver aqui mesmo. */
function ResolveTeam({ team, onResolved }: { team: DeletionTeam; onResolved: () => Promise<void> }) {
  const { toast } = useToast();
  const selectId = useId();
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const transfer = team.action === "transfer_required";

  const resolve = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      if (transfer) await transferTeamOwnership(team.team_id, selected);
      else await promoteTeamLeader(team.team_id, selected);
      const name = team.candidates.find((c) => c.profile_id === selected)?.full_name || "A pessoa escolhida";
      toast({
        title: transfer ? "Propriedade transferida" : "Novo líder definido",
        description: transfer ? `${name} agora é dono(a) de ${team.team_name}.` : `${name} agora é líder de ${team.team_name}.`,
      });
      await onResolved();
    } catch (error) {
      toast({
        title: transfer ? "Não foi possível transferir" : "Não foi possível promover",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (team.candidates.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      <div className="min-w-[10rem] flex-1">
        <label htmlFor={selectId} className="mb-1 block text-footnote text-muted-foreground">
          {transfer ? "Novo dono(a)" : "Novo líder"}
        </label>
        <select
          id={selectId}
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="h-11 w-full min-w-0 rounded-[12px] bg-fill-tertiary px-3 text-body text-foreground"
        >
          <option value="">Escolha alguém</option>
          {team.candidates.map((c) => (
            <option key={c.profile_id} value={c.profile_id}>
              {(c.full_name || "Sem nome") + " · " + ROLE_LABELS[c.role]}
            </option>
          ))}
        </select>
      </div>
      <Button type="button" variant="secondary" onClick={resolve} disabled={!selected || saving} aria-busy={saving || undefined}>
        {saving && <Loader2 className="animate-spin" aria-hidden="true" />}
        {transfer ? "Transferir" : "Promover"}
      </Button>
    </div>
  );
}

function DeleteAccountDialog({ open, onOpenChange, returnFocusRef }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Volta o foco (e a rolagem) para cá ao fechar, também quando a folha abriu sozinha pelo endereço. */
  returnFocusRef?: RefObject<HTMLButtonElement>;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { refetch: refetchTeams } = useTeam();
  const confirmId = useId();
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);

  const preview = useQuery({
    queryKey: DELETION_PREVIEW_KEY,
    queryFn: fetchDeletionPreview,
    enabled: open,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const refreshAfterResolve = async () => {
    await Promise.all([
      preview.refetch(),
      refetchTeams(),
      qc.invalidateQueries({ queryKey: ["team-members"] }),
    ]);
  };

  const data = preview.data;
  const canDelete = !!data?.can_delete;
  const confirmed = isConfirmationTyped(typed);
  const blocking = data?.teams.filter((t) => t.action === "transfer_required" || t.action === "promote_required") ?? [];

  const handleDelete = async () => {
    if (!canDelete || !confirmed || deleting) return;
    setDeleting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      await requestAccountDeletion(typed);
      clearLocalAccountData(session.session?.user.id);
      // A conta já não existe no servidor: só falta esquecer a sessão neste aparelho.
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      qc.clear();
      onOpenChange(false);
      navigate("/login", { replace: true });
      toast({ title: "Conta excluída", description: "Seus dados foram apagados. Obrigado por ter usado o +Louvor." });
    } catch (error) {
      if (error instanceof AccountDeletionError && error.code === "blocked") void preview.refetch();
      toast({
        title: "Não foi possível excluir a conta",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !deleting && onOpenChange(next)}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return;
          event.preventDefault();
          returnFocusRef.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Excluir minha conta</DialogTitle>
          <DialogDescription>Esta ação é permanente e não pode ser desfeita.</DialogDescription>
        </DialogHeader>

        {preview.isPending ? (
          <p role="status" className="flex items-center justify-center gap-2 py-8 text-subhead text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Conferindo suas equipes…
          </p>
        ) : preview.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-subhead text-muted-foreground">Não foi possível carregar o que será excluído.</p>
            <Button type="button" variant="secondary" onClick={() => void preview.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {data && data.teams.length > 0 && (
              <section aria-labelledby="delete-account-teams">
                <h3 id="delete-account-teams" className={GROUP_LABEL}>Suas equipes</h3>
                <ul className={GROUP}>
                  {data.teams.map((team) => {
                    const status = STATUS[team.action];
                    return (
                      <li key={team.team_id} className="border-t border-separator px-4 py-3 first:border-t-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 flex-1 truncate text-body font-medium">{team.team_name}</p>
                          <span className={cn("flex shrink-0 items-center gap-1 text-footnote font-semibold", status.tone)}>
                            <status.icon className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
                            {status.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-footnote text-muted-foreground">{HELP[team.action]}</p>
                        {(team.action === "transfer_required" || team.action === "promote_required") && (
                          <ResolveTeam team={team} onResolved={refreshAfterResolve} />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section aria-labelledby="delete-account-erased">
              <h3 id="delete-account-erased" className={GROUP_LABEL}>O que será apagado</h3>
              <ul className={cn(GROUP, "list-disc space-y-1.5 py-3 pl-9 pr-4 text-subhead marker:text-label-tertiary")}>
                <li>Seu perfil: nome, foto, e-mail, telefone e preferências</li>
                <li>Suas escalas, disponibilidade, funções e loops de ensaio</li>
                <li>
                  Suas mensagens no chat
                  {data?.personal.chat_messages ? ` (${data.personal.chat_messages})` : ""} e os arquivos que você enviou
                </li>
                <li>
                  Rascunhos de músicas que você ainda não cadastrou
                  {data?.personal.draft_songs ? ` (${data.personal.draft_songs})` : ""} e os arquivos deles
                </li>
                <li>O vínculo com o assistente no WhatsApp e as conversas com ele</li>
                <li>Notificações, aparelhos cadastrados para avisos e seus tickets de suporte</li>
                <li>Convites pendentes enviados para o seu e-mail</li>
              </ul>
              <p className={GROUP_FOOTER}>
                Músicas já cadastradas, repertórios e cultos que você criou continuam com as equipes, sem o seu nome.
              </p>
            </section>

            <p role="note" className="flex gap-2 rounded-card bg-card p-3.5 text-footnote text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-ios-orange" aria-hidden="true" />
              Assinaturas feitas pela App Store ou Google Play precisam ser canceladas na loja.
            </p>

            <div>
              <label htmlFor={confirmId} className="mx-1 mb-1.5 block text-subhead">
                Para confirmar, digite <strong className="font-semibold">{DELETE_CONFIRMATION}</strong>
              </label>
              <Input
                id={confirmId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="done"
                disabled={!canDelete || deleting}
                aria-describedby={!canDelete ? "delete-account-blocked" : undefined}
              />
              {!canDelete && blocking.length > 0 && (
                <p id="delete-account-blocked" className="mx-1 mt-1.5 text-footnote text-ios-orange">
                  Resolva {blocking.length === 1 ? "a equipe indicada" : "as equipes indicadas"} acima para continuar.
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={deleting}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={!canDelete || !confirmed || deleting}
                aria-busy={deleting || undefined}
              >
                {deleting && <Loader2 className="animate-spin" aria-hidden="true" />}
                {deleting ? "Excluindo…" : "Excluir conta"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Usuário › Meu usuário › Excluir minha conta (App Store 5.1.1(v) / Google Play). */
export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const sectionRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const handledEntry = useRef<string | null>(null);

  // /excluir-conta e o pedido de aceite dos termos mandam para
  // /app/settings#excluir-conta: abre a exclusão direto. Só rolar até a seção não
  // basta — ela fica no fim da página, abaixo de grupos que carregam depois e a
  // empurram. Uma vez por navegação; ao fechar, o foco volta ao botão (que rola até ele).
  useEffect(() => {
    if (location.hash !== `#${DELETE_ACCOUNT_ANCHOR}` || handledEntry.current === location.key) return;
    handledEntry.current = location.key;
    setOpen(true);
    sectionRef.current?.scrollIntoView?.({ block: "center" });
  }, [location.hash, location.key]);

  return (
    <section id={DELETE_ACCOUNT_ANCHOR} ref={sectionRef} aria-label="Excluir conta" className="scroll-mt-24">
      <div className={GROUP}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex min-h-[50px] w-full items-center justify-center px-4 text-body text-ios-red transition-colors active:bg-fill-quaternary"
        >
          Excluir minha conta
        </button>
      </div>
      <p className={GROUP_FOOTER}>
        Apaga seu perfil e seus dados pessoais.{" "}
        <Link to={LEGAL_PATHS.deleteAccount} className="font-medium text-primary">
          Como funciona
        </Link>
      </p>
      <DeleteAccountDialog open={open} onOpenChange={setOpen} returnFocusRef={buttonRef} />
    </section>
  );
}
