import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CalendarDays, Copy, ListMusic, Music2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminMetric, AdminPageHeader, AdminPanel, EmptyState, QueryState, StatusBadge } from "@/components/admin/AdminUI";
import { SubscriptionForm } from "@/components/admin/SubscriptionForm";
import { useAccountMemberAdmin } from "@/components/admin/AccountMemberAdmin";
import { useToast } from "@/hooks/use-toast";
import { displayDate, planLabels, platformRpc, roleLabels, type AccountDetail } from "@/lib/platform";

const validTabs = ["resumo", "membros", "assinatura", "tickets"];
export default function AdminAccountDetail() {
  const { id } = useParams(); const [params, setParams] = useSearchParams(); const { toast } = useToast();
  const tab = validTabs.includes(params.get("tab") || "") ? params.get("tab")! : "resumo";
  const account = useQuery({ queryKey: ["platform", "account", id], queryFn: () => platformRpc<AccountDetail>("admin_get_account", { p_team_id: id! }), enabled: !!id });
  const data = account.data;
  // Suspender contas e passar a propriedade da equipe (aba Membros).
  const memberAdmin = useAccountMemberAdmin(id, data?.owner_id, data?.name);
  const copy = async () => {
    try { await navigator.clipboard.writeText(id!); toast({ className: "platform-toast", title: "Identificador copiado" }); }
    catch { toast({ className: "platform-toast", title: "Não foi possível copiar", description: "Selecione o identificador no resumo e copie manualmente.", variant: "destructive" }); }
  };
  return <><AdminPageHeader eyebrow="Resumo da conta" title={data?.name || "Detalhes da conta"} description={data ? `Responsável: ${data.owner_name || data.owner_email || "Sem nome"} · Criada em ${displayDate(data.created_at)}` : "Consulte o uso, os membros e os registros desta equipe."} back="/admin/contas"
    actions={data && <><span className="admin-badge admin-badge-neutral">{data.subscription.is_unlimited ? "Ilimitado" : planLabels[data.subscription.plan]}</span><Button variant="outline" size="sm" onClick={copy}><Copy size={14} className="mr-2" />Copiar ID</Button></>} />
    <QueryState loading={account.isPending} error={account.error} retry={() => void account.refetch()} />
    {data && !account.error && <><div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><AdminMetric label="Membros" value={data.members.length} detail={`${data.pending_invites} convites pendentes`} icon={<UsersRound size={16} />} /><AdminMetric label="Músicas" value={data.song_count} detail="Biblioteca da equipe" icon={<Music2 size={16} />} /><AdminMetric label="Repertórios" value={data.repertorio_count} detail="Listas criadas nesta conta" icon={<ListMusic size={16} />} /><AdminMetric label="Cultos" value={data.culto_count} detail="Eventos cadastrados" icon={<CalendarDays size={16} />} /></div>
      <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}><TabsList className="mb-5 grid h-auto w-full grid-cols-2 gap-1 rounded-lg border bg-white p-1 sm:flex sm:w-fit"><TabsTrigger value="resumo">Resumo</TabsTrigger><TabsTrigger value="membros">Membros</TabsTrigger><TabsTrigger value="assinatura">Assinatura</TabsTrigger><TabsTrigger value="tickets">Tickets</TabsTrigger></TabsList>
        <TabsContent value="resumo"><div className="grid items-start gap-6 xl:grid-cols-[minmax(250px,1fr)_minmax(0,1.5fr)]"><AdminPanel title="Informações da conta"><dl className="admin-definition p-6"><div><dt>Equipe</dt><dd>{data.name}</dd></div><div><dt>Responsável</dt><dd>{data.owner_name || "Sem nome informado"}</dd></div><div><dt>E-mail do responsável</dt><dd>{data.owner_email || "—"}</dd></div><div><dt>Identificador da conta</dt><dd className="select-all font-mono text-[10px]">{data.id}</dd></div><div><dt>Data de criação</dt><dd>{displayDate(data.created_at, true)}</dd></div></dl></AdminPanel>
          <div className="space-y-6"><AdminPanel title="Repertórios recentes" description="Até cinco listas cadastradas nesta equipe.">{!data.recent_repertorios.length ? <EmptyState title="Nenhum repertório criado" description="As listas aparecerão aqui quando a equipe começar a organizar suas músicas." /> : data.recent_repertorios.map((item) => <div key={item.id} className="admin-activity-row"><ListMusic size={15} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 break-words text-xs font-medium">{item.name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{displayDate(item.created_at)}</span></div>)}</AdminPanel>
            <AdminPanel title="Cultos recentes" description="Até cinco eventos, ordenados pela data do culto.">{!data.recent_cultos.length ? <EmptyState title="Nenhum culto cadastrado" description="Os eventos da equipe aparecerão aqui quando forem criados." /> : data.recent_cultos.map((item) => <div key={item.id} className="admin-activity-row"><CalendarDays size={15} className="shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 break-words text-xs font-medium">{item.name}</span><span className="shrink-0 text-[10px] text-muted-foreground">{displayDate(item.date)}</span></div>)}</AdminPanel></div>
        </div></TabsContent>
        <TabsContent value="membros"><AdminPanel title="Membros da equipe" description="Papéis, instrumentos e último acesso dos usuários desta conta.">{!data.members.length ? <EmptyState title="Nenhum membro vinculado" description="Os usuários vinculados à conta aparecerão nesta lista." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Membro</th><th>Papel</th><th>Instrumentos</th><th>Último acesso</th><th>Vínculo criado</th><th>Conta</th></tr></thead><tbody>{data.members.map((member) => <tr key={member.id}><td><p className="font-semibold">{member.full_name || "Sem nome"}</p><p className="admin-table-secondary">{member.email}</p></td><td><span className="admin-badge admin-badge-neutral">{roleLabels[member.role] || member.role}</span></td><td className="max-w-48 text-muted-foreground">{member.instruments?.join(", ") || "Não informado"}</td><td className="whitespace-nowrap text-muted-foreground">{displayDate(member.last_sign_in_at, true)}</td><td className="whitespace-nowrap text-muted-foreground">{displayDate(member.created_at)}</td><td>{memberAdmin.cell(member)}</td></tr>)}</tbody></table></div>}</AdminPanel></TabsContent>
        <TabsContent value="assinatura"><AdminPanel title="Registro da assinatura" description="Plano, situação e observações administrativas desta conta."><SubscriptionForm key={`${data.id}:${data.subscription.updated_at || "new"}`} subscription={data.subscription} accountName={data.name} /></AdminPanel></TabsContent>
        <TabsContent value="tickets"><AdminPanel title="Tickets desta conta" description="Até dez tickets recentes vinculados à equipe.">{!data.tickets.length ? <EmptyState title="Nenhum ticket desta equipe" description="Sugestões e relatos vinculados a esta conta aparecerão aqui." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Ticket</th><th>Tipo</th><th>Status</th><th>Atualizado em</th></tr></thead><tbody>{data.tickets.map((ticket) => <tr key={ticket.id}><td><span className="admin-table-number mr-2">#{ticket.ticket_number}</span><Link className="admin-table-link" to={`/admin/tickets/${ticket.id}`}>{ticket.title}</Link></td><td>{ticket.category === "bug" ? "Bug" : "Melhoria"}</td><td><StatusBadge status={ticket.status} /></td><td className="whitespace-nowrap text-muted-foreground">{displayDate(ticket.updated_at, true)}</td></tr>)}</tbody></table></div>}</AdminPanel></TabsContent>
      </Tabs>
    </>}
    {memberAdmin.dialogs}
  </>;
}
