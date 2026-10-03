import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AdminPageHeader, AdminPanel, AdminPagination, EmptyState, QueryState, SearchField } from "@/components/admin/AdminUI";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { displayDate, initials, integerFormat, platformRpc, roleLabels, type Member, type Paged } from "@/lib/platform";

export default function AdminMembers() {
  const [search, setSearch] = useState(""); const [page, setPage] = useState(1); const [selected, setSelected] = useState<Member | null>(null);
  const query = useDebouncedValue(search);
  const members = useQuery({ queryKey: ["platform", "members", query, page], queryFn: () => platformRpc<Paged<Member>>("admin_list_members", { p_search: query, p_page: page }) });
  return <><AdminPageHeader eyebrow="Pessoas e vínculos" title="Membros" description="Todos os usuários cadastrados, incluindo aqueles que ainda não participam de uma equipe." />
    <AdminPanel><div className="admin-filterbar"><SearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Nome ou e-mail do usuário" label="Buscar membros" /><span className="ml-auto text-xs text-muted-foreground">{integerFormat.format(members.data?.total ?? 0)} usuários</span></div>
      <QueryState loading={members.isPending} error={members.error} retry={() => void members.refetch()} />
      {members.data && !members.error && <>{!members.data.items.length ? <EmptyState title="Nenhum usuário encontrado" description="Altere a busca para localizar um nome ou e-mail diferente." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Equipes</th><th>Confirmação do e-mail</th><th>Último acesso</th><th>Cadastro</th><th><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{members.data.items.map((member) => <tr key={member.user_id}>
        <td><div className="flex min-w-[220px] items-center gap-3"><Avatar className="h-9 w-9"><AvatarImage src={member.avatar_url || undefined} /><AvatarFallback className="bg-neutral-100 text-[10px]">{initials(member.full_name)}</AvatarFallback></Avatar><div><button className="admin-table-link text-left" onClick={() => setSelected(member)}>{member.full_name || "Sem nome informado"}</button><p className="admin-table-secondary">{member.email || "Sem e-mail"}</p></div></div></td>
        <td><p>{member.teams.length ? `${member.teams.length} equipe${member.teams.length > 1 ? "s" : ""}` : "Sem equipe"}</p><p className="admin-table-secondary">{member.teams.slice(0, 2).map((team) => team.name).join(", ")}</p></td>
        <td><span className={`admin-badge ${member.email_confirmed ? "admin-status-resolved" : "admin-badge-warn"}`}>{member.email_confirmed ? <CheckCircle2 size={12} /> : <Clock3 size={12} />}{member.email_confirmed ? "Confirmado" : "Pendente"}</span></td>
        <td className="whitespace-nowrap text-muted-foreground">{member.last_sign_in_at ? displayDate(member.last_sign_in_at, true) : "Nunca acessou"}</td><td className="whitespace-nowrap text-muted-foreground">{displayDate(member.created_at)}</td><td><Button size="sm" variant="ghost" onClick={() => setSelected(member)}>Detalhes</Button></td>
      </tr>)}</tbody></table></div>}<AdminPagination total={members.data.total} page={page} onChange={setPage} /></>}
    </AdminPanel>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="platform-dialog max-h-[85dvh] w-[92vw] overflow-y-auto rounded-2xl bg-white sm:w-full sm:max-w-lg"><DialogHeader><DialogTitle>{selected?.full_name || "Detalhes do usuário"}</DialogTitle><DialogDescription>{selected?.email || "Cadastro sem e-mail"}</DialogDescription></DialogHeader>
      {selected && <div className="space-y-6"><dl className="grid grid-cols-2 gap-4 text-sm"><div><dt className="text-xs text-muted-foreground">Cadastrado em</dt><dd className="mt-1">{displayDate(selected.created_at)}</dd></div><div><dt className="text-xs text-muted-foreground">Último acesso</dt><dd className="mt-1">{displayDate(selected.last_sign_in_at, true)}</dd></div><div className="col-span-2"><dt className="text-xs text-muted-foreground">Identificador do usuário</dt><dd className="mt-1 break-all font-mono text-xs">{selected.user_id}</dd></div></dl>
        <div><h3 className="mb-3 text-sm font-semibold">Equipes e permissões</h3>{!selected.teams.length ? <p className="rounded-lg bg-muted p-4 text-xs text-muted-foreground">Este usuário ainda não tem vínculo com uma equipe.</p> : <div className="space-y-2">{selected.teams.map((team) => <Link onClick={() => setSelected(null)} key={team.id} to={`/admin/contas/${team.id}`} className="flex items-center justify-between gap-3 rounded-lg border p-4 hover:bg-muted"><div className="min-w-0"><p className="break-words text-sm font-medium">{team.name}</p><p className="mt-1 text-xs text-muted-foreground">{roleLabels[team.role] || team.role}{team.instruments?.length ? ` · ${team.instruments.join(", ")}` : ""}</p></div><ExternalLink size={15} className="shrink-0 text-muted-foreground" /></Link>)}</div>}</div>
      </div>}
    </DialogContent></Dialog>
  </>;
}
