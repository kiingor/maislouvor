import { useState, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { LEGAL_SITE_URL } from "@/lib/legal";
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
  const [links, setLinks] = useState<{ teamId: string; name: string; url: string }[]>([]);
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
    if (!teamId || !email.trim() || checking || capacity.isError || blocked || loading) return;
    setLoading(true);
    try {
      for (const id of targetTeams.filter(id => !links.some(link => link.teamId === id))) {
        const { data, error } = await supabase.functions.invoke("create-invite", {
          body: { email: email.trim().toLowerCase(), team_id: id, role },
        });
        if (error || data?.error || typeof data?.token !== "string") {
          const issue = await functionError(error, data);
          toast({ title: "Não foi possível criar o convite", description: issue.error || "Tente novamente. Os links já criados continuam abaixo.", variant: "destructive" });
          if (issue.code === "TEAM_MEMBER_LIMIT_REACHED") void capacity.refetch();
          break;
        }
        setLinks(current => [...current, { teamId: id, name: teams.find(t => t.id === id)?.name || "Equipe", url: `${LEGAL_SITE_URL}/invite/${encodeURIComponent(data.token)}` }]);
      }
    } catch {
      toast({ title: "Não foi possível criar o convite", description: "Confira a conexão e tente novamente. Os links já criados continuam abaixo.", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setEmail("");
      setLinks([]);
      setRole("viewer");
    }
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        {/* Confirmar fica fora do <form>: o atributo form mantém a validação nativa e o Enter. */}
        <DialogToolbar
          title="Convidar membro"
          confirm={{ label: "Convidar", type: "submit", form: FORM_ID, disabled: loading || checking || capacity.isError || Boolean(blocked) || targetTeams.every(id => links.some(link => link.teamId === id)), loading }}
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
                <Select value={teamId} onValueChange={setTeamId} disabled={loading || links.length > 0}>
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
                  disabled={loading || links.length > 0}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </FieldRow>
            </div>
            <p className={GROUP_FOOTER}>A pessoa entra com este e-mail ou cria sua própria conta e autoriza a participação antes de entrar na equipe. Nenhum e-mail é enviado automaticamente.</p>
          </section>

          <section>
            <p id="invite-role-label" className={GROUP_LABEL}>Função</p>
            <div className={GROUP}>
              <Select value={role} onValueChange={setRole} disabled={loading || links.length > 0}>
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
        {links.length > 0 && <section aria-label="Convites criados" className="space-y-3">
          <p className="text-sm text-muted-foreground">Envie estes links para a pessoa convidada. Eles valem por 7 dias e são vinculados ao e-mail informado.</p>
          {links.map(link => <div key={link.teamId} className="space-y-2 rounded-xl bg-card p-3">
            <label className="block text-sm font-medium" htmlFor={`invite-link-${link.teamId}`}>{link.name}</label>
            <input id={`invite-link-${link.teamId}`} className="w-full rounded-md border p-2 text-xs" value={link.url} readOnly onFocus={e => e.target.select()} />
            <Button variant="outline" className="w-full" onClick={async () => {
              try { await navigator.clipboard.writeText(link.url); toast({ title: "Link copiado" }); }
              catch { toast({ title: "Selecione o link acima e copie para compartilhar." }); }
            }}>Copiar link</Button>
          </div>)}
        </section>}

      </DialogContent>
    </Dialog>
  );
}
