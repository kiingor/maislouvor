import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, Building2, CalendarDays, CreditCard, ListMusic, MessageSquareText, Music2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminMetric, AdminPageHeader, AdminPanel, EmptyState, QueryState, StatusBadge } from "@/components/admin/AdminUI";
import { displayDate, integerFormat, platformRpc, planLabels, type Overview } from "@/lib/platform";

export default function AdminOverview() {
  const [days, setDays] = useState(30);
  const overview = useQuery({ queryKey: ["platform", "overview", days], queryFn: () => platformRpc<Overview>("admin_get_overview", { p_days: days }), refetchInterval: 60_000 });
  const data = overview.data;
  return <>
    <AdminPageHeader eyebrow="Tudo em um só lugar" title="Visão geral" description="Acompanhe as equipes, os cadastros e o que precisa da sua atenção."
      actions={<div className="flex rounded-lg border bg-white p-1" aria-label="Período do resumo">{[7, 30, 90].map((period) => <button key={period} aria-pressed={days === period}
        onClick={() => setDays(period)} className={`rounded-md px-3 py-2 text-xs font-medium ${days === period ? "bg-[#111111] text-white" : "text-muted-foreground hover:bg-muted"}`}>{period} dias</button>)}</div>} />
    <QueryState loading={overview.isPending} error={overview.error} retry={() => void overview.refetch()} />
    {data && !overview.error && <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <AdminMetric label="Contas de equipes" value={data.total_accounts} icon={<Building2 size={16} />} detail={`${data.new_accounts} novas nos últimos ${days} dias`} />
        <AdminMetric label="Usuários cadastrados" value={data.total_users} icon={<UsersRound size={16} />} detail={`${data.total_memberships} vínculos com equipes`} />
        <AdminMetric label="Tickets em aberto" value={data.open_tickets} icon={<MessageSquareText size={16} />} detail={`${data.waiting_tickets} aguardando seu retorno`} accent />
        <AdminMetric label="Assinaturas ativas" value={data.active_subscriptions} icon={<CreditCard size={16} />} detail="Registros de assinatura da plataforma" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(270px,1fr)]">
        <AdminPanel title="Pulso da plataforma" description={`Novos cadastros e equipes por dia · últimos ${days} dias`} action={<span className="admin-badge admin-badge-neutral">{data.new_users} cadastros</span>}>
          <div className="h-[270px] px-3 pb-4 pt-6 sm:px-5" role="img" aria-label={`Gráfico de crescimento: ${data.new_users} novos usuários e ${data.new_accounts} novas equipes em ${days} dias.`}>
            <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.growth} margin={{ left: -24, right: 8, top: 8, bottom: 0 }}>
              <defs><linearGradient id="platform-user-growth" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#171717" stopOpacity={.2} /><stop offset="100%" stopColor="#171717" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid stroke="#ededed" vertical={false} /><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={28} tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={(value: string) => displayDate(value).split(" de ").slice(0, 2).join(" ")} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#737373" }} />
              <Tooltip labelFormatter={(value) => displayDate(String(value))} contentStyle={{ borderRadius: 10, border: "1px solid #e5e5e5", fontSize: 12 }} />
              <Area type="monotone" dataKey="users" name="Usuários" stroke="#171717" strokeWidth={2} fill="url(#platform-user-growth)" isAnimationActive={false} />
              <Area type="monotone" dataKey="accounts" name="Equipes" stroke="#a3a3a3" strokeWidth={2} strokeDasharray="4 4" fill="transparent" isAnimationActive={false} />
            </AreaChart></ResponsiveContainer>
          </div><div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4 text-[11px] text-muted-foreground"><div className="flex gap-4"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-[#171717]" />Usuários</span><span className="flex items-center gap-2"><i className="w-3 border-t-2 border-dashed border-neutral-400" />Equipes</span></div><span>{data.active_accounts} equipes com acesso no período</span></div>
        </AdminPanel>
        <AdminPanel title="Sua fila de atendimento" description="Sugestões e relatos enviados pelos usuários.">
          <div className="p-6"><p className="text-xs text-muted-foreground">Aguardando retorno</p><p className="my-3 text-5xl font-semibold tracking-[-2px] text-[#111111]">{integerFormat.format(data.waiting_tickets)}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">Cada resposta chega ao usuário por notificação. Acompanhe os relatos e mantenha todos informados.</p>
            <Button className="mt-6 w-full bg-[#111111] text-white hover:bg-[#333333]" asChild><Link to="/admin/tickets?status=unresolved">Abrir fila de tickets<ArrowRight className="ml-2" size={15} /></Link></Button>
            <div className="mt-6 grid grid-cols-3 gap-3 border-t pt-5">{[{ icon: Music2, label: "Músicas", value: data.total_songs }, { icon: ListMusic, label: "Repertórios", value: data.total_repertorios }, { icon: CalendarDays, label: "Cultos", value: data.total_cultos }].map((item) => <div key={item.label}><item.icon size={14} className="mb-2 text-muted-foreground" /><strong className="block text-base font-semibold tabular-nums">{integerFormat.format(item.value)}</strong><span className="text-[9px] text-muted-foreground">{item.label}</span></div>)}</div>
          </div>
        </AdminPanel>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel title="Contas recentes" description="As últimas equipes que chegaram ao +Louvor." action={<Link className="flex items-center gap-1 text-[11px] font-medium text-[#111111]" to="/admin/contas">Ver todas<ArrowRight size={13} /></Link>}>
          {!data.recent_accounts.length ? <EmptyState title="As primeiras equipes aparecerão aqui" description="As contas são listadas assim que uma equipe é criada no aplicativo." /> : data.recent_accounts.map((account) => <Link key={account.id} to={`/admin/contas/${account.id}`} className="admin-activity-row hover:bg-neutral-50"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#f5f5f5] text-[#525252]"><Building2 size={17} /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{account.name}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{account.owner_name || account.owner_email || "Responsável"} · {account.member_count} membros</p></div><span className="admin-badge admin-badge-neutral">{planLabels[account.plan]}</span></Link>)}
        </AdminPanel>
        <AdminPanel title="Últimos tickets em aberto" description="A conversa continua por aqui." action={<Link className="flex items-center gap-1 text-[11px] font-medium text-[#111111]" to="/admin/tickets">Ver todos<ArrowRight size={13} /></Link>}>
          {!data.recent_tickets.length ? <EmptyState title="Nenhum ticket em aberto" description="Quando um usuário enviar uma sugestão ou relatar um bug, o ticket aparecerá aqui." /> : data.recent_tickets.map((ticket) => <Link key={ticket.id} to={`/admin/tickets/${ticket.id}`} className="admin-activity-row hover:bg-neutral-50"><span className="admin-table-number shrink-0">#{ticket.ticket_number}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{ticket.title}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{ticket.requester_name || "Usuário"} · {ticket.category === "bug" ? "Bug" : "Melhoria"}</p></div><StatusBadge status={ticket.status} /></Link>)}
        </AdminPanel>
      </div><p className="text-right text-[10px] text-muted-foreground">Dados atualizados em {displayDate(new Date(overview.dataUpdatedAt).toISOString(), true)}.</p>
    </div>}
  </>;
}
