import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { getMemberCapacity } from "@/lib/billing/api";
import { functionError } from "@/lib/function-error";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChoosePlan: (seats: number, teamId: string) => void;
}

const ALL_TEAMS = "__all__";
const FORM_ID = "invite-member-form";

/* Grupos dentro da folha: a folha já redefine --card (claro: branco; escuro: #2C2C2E). */
const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_LABEL = "mx-4 mb-1.5 text-footnote text-muted-foreground";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";
const INPUT =
  "h-[52px] min-w-0 flex-1 bg-transparent text-body text-foreground placeholder:text-label-tertiary focus-visible:outline-offset-[-3px]";
const SELECT_ROW = "h-[52px] rounded-none bg-transparent px-4 active:bg-fill-quaternary data-[state=open]:bg-fill-quaternary";

function FieldRow({ id, label, trailing, children }: { id: string; label: ReactNode; trailing?: ReactNode; children: ReactNode }) {
  return (
    <div className="ml-4 flex min-h-[52px] items-center gap-3 pr-4">
      <label htmlFor={id} className="w-[7.25rem] shrink-0 py-2 text-body leading-[20px]">
        {label}
      </label>
      {children}
      {trailing}
    </div>
  );
}

export function InviteMemberModal({ open, onOpenChange, onChoosePlan }: Props) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>("viewer");
  const [loading, setLoading] = useState(false);
  const { currentTeam, teams, profileId } = useTeam();
  const { toast } = useToast();

  // Only teams where the current user is a leader can receive new members
  const adminTeams = teams.filter((t) => t.role === "admin");
  const [teamId, setTeamId] = useState<string>(currentTeam?.id ?? "");
  useEffect(() => {
    if (open) setTeamId(currentTeam?.id ?? adminTeams[0]?.id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentTeam?.id]);

  const targetTeams = teamId === ALL_TEAMS ? adminTeams.map(t => t.id).sort() : teamId ? [teamId] : [];
  const capacity = useQuery({
    queryKey: ['team-capacity', profileId, ...targetTeams],
    queryFn: async () => Promise.all(targetTeams.map(async id => ({ id, ...await getMemberCapacity(id) }))),
    enabled: open && targetTeams.length > 0, retry: false, staleTime: 0,
  });
  const blocked = capacity.data?.find(c => !c.can_add_member);
  const checking = capacity.isPending || capacity.isFetching;
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !email.trim() || !password.trim() || !fullName.trim() || checking || capacity.isError || blocked || loading) return;

    if (password.length < 6) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 6 caracteres.", variant: "destructive" });
      return;
    }

    setLoading(true);

    const team_ids = teamId === ALL_TEAMS ? adminTeams.map((t) => t.id) : [teamId];
    const { data, error } = await supabase.functions.invoke("create-invite", {
      body: {
        email: email.trim().toLowerCase(),
        team_ids,
        role,
        password: password,
        full_name: fullName.trim(),
      },
    });

    if (error || data?.error) {
      const issue = await functionError(error, data);
      toast({ title: "Não foi possível adicionar", description: issue.error, variant: "destructive" });
      if (issue.code === 'TEAM_MEMBER_LIMIT_REACHED') void capacity.refetch();
    } else if (data?.already_member) {
      toast({ title: "Já é membro", description: "Este usuário já faz parte da equipe." });
      handleClose(false);
    } else {
      const where = teamId === ALL_TEAMS ? "todas as suas equipes" : "a equipe";
      toast({
        title: "Membro adicionado!",
        description: data?.is_new_user
          ? `Conta criada. O membro foi adicionado a ${where} e já pode entrar.`
          : `O usuário já tinha conta e foi adicionado a ${where}.`,
      });
      handleClose(false);
    }
    setLoading(false);
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("viewer");
      setShowPassword(false);
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        {/* Confirmar fica fora do <form>: o atributo form mantém a validação nativa e o Enter. */}
        <DialogToolbar
          title="Convidar membro"
          confirm={{ label: "Convidar", type: "submit", form: FORM_ID, disabled: loading || checking || capacity.isError || Boolean(blocked), loading }}
        />

        {checking ? <p role="status" className="p-4 text-sm text-muted-foreground">Conferindo as vagas da equipe…</p> : capacity.isError ? <div className="space-y-4 p-4">
          <p role="alert">Não foi possível conferir as vagas.</p><Button onClick={() => void capacity.refetch()}>Tentar novamente</Button>
        </div> : blocked ? <div className="space-y-4 p-4">
          <h3 className="text-lg font-semibold">Sua equipe cresceu</h3>
          <p className="text-sm text-muted-foreground">{teams.find(t => t.id === blocked.id)?.name}: {blocked.member_limit === 5 && blocked.effective_plan === 'essencial'
            ? 'o Essencial gratuito inclui até 5 integrantes, contando o líder. Para adicionar mais uma pessoa, escolha um plano com mais vagas.'
            : 'as vagas estão ocupadas. Amplie o plano para adicionar mais uma pessoa.'}</p>
          {blocked.can_manage ? <Button className="h-12 w-full rounded-full" onClick={() => {
            handleClose(false); onChoosePlan(blocked.member_count + 1, blocked.id);
          }}>Escolher plano e continuar</Button> : <p className="text-sm">Peça ao responsável pela equipe para contratar mais vagas em Usuário → Assinatura.</p>}
          <Button variant="ghost" className="w-full" onClick={() => handleClose(false)}>Voltar para a equipe</Button>
        </div> : null}
        <form
          hidden={checking || capacity.isError || Boolean(blocked)}
          id={FORM_ID}
          onSubmit={handleInvite}
          className="min-w-0 space-y-6 pb-2 pt-1"
        >
          {adminTeams.length > 1 && (
            <section>
              <p id="invite-team-label" className={GROUP_LABEL}>Equipe</p>
              <div className={GROUP}>
                <Select value={teamId} onValueChange={setTeamId}>
                  <SelectTrigger aria-labelledby="invite-team-label" className={SELECT_ROW}>
                    <SelectValue placeholder="Selecione a equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TEAMS}>Todas as equipes</SelectItem>
                    {adminTeams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className={GROUP_FOOTER}>
                {teamId === ALL_TEAMS
                  ? "O membro participará e verá todas as suas equipes."
                  : "O membro participará e verá apenas esta equipe."}
              </p>
            </section>
          )}

          <section>
            <div className={cn(GROUP, "divide-y divide-separator")}>
              <FieldRow id="invite-name" label="Nome completo">
                <input
                  id="invite-name"
                  className={INPUT}
                  type="text"
                  autoComplete="off"
                  placeholder="Nome do membro"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </FieldRow>
              <FieldRow id="invite-email" label="Email">
                <input
                  id="invite-email"
                  className={INPUT}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="membro@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FieldRow>
              <FieldRow
                id="invite-password"
                label="Senha inicial"
                trailing={
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    aria-pressed={showPassword}
                    className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
                  </button>
                }
              >
                <input
                  id="invite-password"
                  className={INPUT}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Senha para o membro"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </FieldRow>
            </div>
            <p className={GROUP_FOOTER}>O membro poderá alterar a senha depois.</p>
          </section>

          <section>
            <p id="invite-role-label" className={GROUP_LABEL}>Função</p>
            <div className={GROUP}>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger aria-labelledby="invite-role-label" className={SELECT_ROW}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Líder</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Membro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
        </form>
      </DialogContent>
    </Dialog>
  );
}
