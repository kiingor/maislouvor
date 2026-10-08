import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPageHeader, AdminPanel, AdminPagination, EmptyState, QueryState, SearchField } from "@/components/admin/AdminUI";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { displayDate, integerFormat, planLabels, platformRpc, type Account, type Paged } from "@/lib/platform";

export default function AdminAccounts() {
  const [search, setSearch] = useState(""); const [plan, setPlan] = useState("all"); const [page, setPage] = useState(1);
  const query = useDebouncedValue(search);
  const accounts = useQuery({ queryKey: ["platform", "accounts", query, plan, page], queryFn: () => platformRpc<Paged<Account>>("admin_list_accounts", { p_search: query, p_plan: plan === "all" ? "" : plan, p_page: page }) });
  return <><AdminPageHeader eyebrow="A comunidade +Louvor" title="Contas" description="Veja cada equipe, seu responsável, o plano registrado e o uso da aplicação." />
    <AdminPanel><div className="admin-filterbar"><SearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Equipe, responsável ou e-mail" label="Buscar contas" />
      <Select value={plan} onValueChange={(value) => { setPlan(value); setPage(1); }}><SelectTrigger className="w-full bg-white sm:w-44" aria-label="Filtrar contas por plano"><SelectValue /></SelectTrigger><SelectContent className="platform-popover"><SelectItem value="all">Todos os planos</SelectItem><SelectItem value="unlimited">Ilimitado</SelectItem>{Object.entries(planLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
      <span className="ml-auto text-xs text-muted-foreground">{integerFormat.format(accounts.data?.total ?? 0)} contas</span></div>
      <QueryState loading={accounts.isPending} error={accounts.error} retry={() => void accounts.refetch()} />
      {accounts.data && !accounts.error && <>{!accounts.data.items.length ? <EmptyState title="Nenhuma conta encontrada" description={search || plan !== "all" ? "Ajuste a busca ou o filtro de plano para ver outras contas." : "As equipes criadas no aplicativo aparecerão nesta lista."} /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Conta / equipe</th><th>Responsável</th><th>Plano</th><th>Membros</th><th>Conteúdo</th><th>Criada em</th><th><span className="sr-only">Ações</span></th></tr></thead><tbody>{accounts.data.items.map((account) => <tr key={account.id}>
        <td><div className="flex min-w-[150px] items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-neutral-100 text-neutral-500"><Building2 size={16} /></span><div><Link className="admin-table-link" to={`/admin/contas/${account.id}`}>{account.name}</Link><p className="admin-table-secondary">Último acesso: {displayDate(account.last_activity_at)}</p></div></div></td>
        <td><p className="font-medium">{account.owner_name || "Sem nome"}</p><p className="admin-table-secondary">{account.owner_email || "Sem e-mail"}</p></td><td><span className="admin-badge admin-badge-neutral">{account.is_unlimited ? "Ilimitado" : planLabels[account.plan]}</span></td><td className="tabular-nums">{account.member_count}</td><td className="whitespace-nowrap"><p>{account.song_count} músicas</p><p className="admin-table-secondary">{account.repertorio_count} repertórios · {account.culto_count} cultos</p></td><td className="whitespace-nowrap text-muted-foreground">{displayDate(account.created_at)}</td><td><Link to={`/admin/contas/${account.id}`} aria-label={`Abrir conta ${account.name}`} className="inline-flex rounded-md p-2 hover:bg-muted"><ArrowUpRight size={16} /></Link></td>
      </tr>)}</tbody></table></div>}<AdminPagination total={accounts.data.total} page={page} onChange={setPage} /></>}
    </AdminPanel><p className="mt-4 text-[11px] text-muted-foreground">Uma conta representa uma equipe. Os cadastros individuais e seus vínculos estão na aba Membros.</p>
  </>;
}
