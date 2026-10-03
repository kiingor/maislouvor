import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPageHeader, AdminPanel, AdminPagination, EmptyState, PriorityBadge, QueryState, SearchField, StatusBadge } from "@/components/admin/AdminUI";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { displayDate, integerFormat, platformRpc, ticketCategoryLabels, ticketPriorityLabels, ticketStatusLabels, type Paged, type Ticket } from "@/lib/platform";

export default function AdminTickets() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(""); const [category, setCategory] = useState("all"); const [priority, setPriority] = useState("all"); const [page, setPage] = useState(1);
  const rawStatus = params.get("status") || "unresolved";
  const status = rawStatus === "all" || rawStatus === "unresolved" || rawStatus in ticketStatusLabels ? rawStatus : "unresolved";
  const query = useDebouncedValue(search);
  const tickets = useQuery({ queryKey: ["platform", "tickets", query, status, category, priority, page], queryFn: () => platformRpc<Paged<Ticket>>("list_support_tickets", { p_admin: true, p_search: query, p_status: status === "all" ? "" : status, p_category: category === "all" ? "" : category, p_priority: priority === "all" ? "" : priority, p_page: page }), refetchInterval: 30_000 });
  return <><AdminPageHeader eyebrow="Escute quem usa o +Louvor" title="Sugestões e bugs" description="Analise os relatos, organize as prioridades e dê retorno a cada usuário." />
    <AdminPanel><div className="admin-filterbar"><SearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Ticket, assunto, usuário ou equipe" label="Buscar tickets" />
      <Select value={status} onValueChange={(value) => { setParams({ status: value }); setPage(1); }}><SelectTrigger className="w-full sm:w-40" aria-label="Filtrar tickets por status"><SelectValue /></SelectTrigger><SelectContent className="platform-popover"><SelectItem value="unresolved">Em aberto</SelectItem><SelectItem value="all">Todos os status</SelectItem>{Object.entries(ticketStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}><SelectTrigger className="w-full sm:w-32" aria-label="Filtrar tickets por tipo"><SelectValue /></SelectTrigger><SelectContent className="platform-popover"><SelectItem value="all">Todos os tipos</SelectItem>{Object.entries(ticketCategoryLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <Select value={priority} onValueChange={(value) => { setPriority(value); setPage(1); }}><SelectTrigger className="w-full sm:w-40" aria-label="Filtrar tickets por prioridade"><SelectValue /></SelectTrigger><SelectContent className="platform-popover"><SelectItem value="all">Todas as prioridades</SelectItem>{Object.entries(ticketPriorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
    </div><QueryState loading={tickets.isPending} error={tickets.error} retry={() => void tickets.refetch()} />
      {tickets.data && !tickets.error && <>{!tickets.data.items.length ? <EmptyState title="Nenhum ticket nesta seleção" description="Ajuste os filtros ou aguarde novos relatos dos usuários." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Ticket</th><th>Usuário / equipe</th><th>Tipo</th><th>Prioridade</th><th>Status</th><th>Última atualização</th></tr></thead><tbody>{tickets.data.items.map((ticket) => <tr key={ticket.id}>
        <td className="min-w-[250px]"><p className="admin-table-number mb-1">#{ticket.ticket_number}</p><Link className="admin-table-link" to={`/admin/tickets/${ticket.id}`}>{ticket.title}</Link><div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground"><MessageCircle size={11} />{ticket.message_count} mensagens{ticket.waiting_for_staff && !["resolved", "closed"].includes(ticket.status) && <span className="text-[#111111]">· Aguardando retorno</span>}</div></td>
        <td><p className="font-medium">{ticket.requester_name || "Usuário"}</p><p className="admin-table-secondary">{ticket.team_name || "Sem equipe vinculada"}</p></td><td><span className="admin-badge admin-badge-neutral">{ticketCategoryLabels[ticket.category]}</span></td><td><PriorityBadge priority={ticket.priority} /></td><td><StatusBadge status={ticket.status} /></td><td className="whitespace-nowrap text-muted-foreground">{displayDate(ticket.updated_at, true)}</td>
      </tr>)}</tbody></table></div>}<AdminPagination total={tickets.data.total} page={page} onChange={setPage} /></>}
    </AdminPanel><p className="mt-4 text-[11px] text-muted-foreground">{integerFormat.format(tickets.data?.total ?? 0)} tickets nesta seleção · A fila é atualizada automaticamente.</p>
  </>;
}
