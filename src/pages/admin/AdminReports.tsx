import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock3, Flag, Search, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminMetric, AdminPageHeader, AdminPagination, AdminPanel, EmptyState, QueryState, SearchField } from "@/components/admin/AdminUI";
import { ChatReportEvidence } from "@/components/chat/ChatReportEvidence";
import { useReportModeration } from "@/components/chat/useReportModeration";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { listChatReports, reportReasonLabels, reportStatusLabels, type ChatReport } from "@/lib/chatModeration";
import { displayDate, integerFormat } from "@/lib/platform";
import { cn } from "@/lib/utils";

const statusFilters: Record<string, string> = { pendentes: "Em aberto", todas: "Todos os status", ...reportStatusLabels };
const PAGE_SIZE = 20;

/**
 * Denúncias do chat de todas as equipes (App Store 1.2: agir em até 24 horas).
 * Denúncias sobre alguém da liderança (ou o responsável) só a plataforma vê e decide.
 */
export default function AdminReports() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const rawStatus = params.get("status") || "pendentes";
  const status = rawStatus in statusFilters ? rawStatus : "pendentes";
  const query = useDebouncedValue(search);
  const reports = useQuery({
    queryKey: ["platform", "chat-reports", query, status, page],
    queryFn: () => listChatReports({ teamId: null, status: status === "todas" ? "" : status, search: query, page, pageSize: PAGE_SIZE }),
    refetchInterval: 30_000,
  });
  const actions = useReportModeration({ invalidate: [["platform", "chat-reports"]], platform: true });
  const data = reports.data;

  return <>
    <AdminPageHeader eyebrow="Segurança do chat" title="Denúncias" description="Mensagens denunciadas nas equipes. Analise cada uma em até 24 horas: apague o conteúdo e, se preciso, remova o autor da equipe." />
    {data && <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <AdminMetric label="Em aberto" value={data.pending_total} icon={<Flag size={16} />} detail="Abertas ou em análise" accent />
      <AdminMetric label="Prazo vencido" value={data.overdue_total} icon={<Clock3 size={16} />} detail="Em aberto há mais de 24 horas" />
    </div>}
    <AdminPanel>
      <div className="admin-filterbar">
        <SearchField value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Equipe, pessoa ou texto da mensagem" label="Buscar denúncias" />
        <Select value={status} onValueChange={(value) => { setParams({ status: value }); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-44" aria-label="Filtrar denúncias por status"><SelectValue /></SelectTrigger>
          <SelectContent className="platform-popover">{Object.entries(statusFilters).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <QueryState loading={reports.isPending} error={reports.error} retry={() => void reports.refetch()} />
      {data && !reports.error && <>
        {!data.items.length
          ? <EmptyState title="Nenhuma denúncia nesta seleção" description={status === "pendentes" ? "Tudo em dia. Novas denúncias também chegam nas suas notificações." : "Ajuste os filtros para ver outras denúncias."} />
          : data.items.map((report) => <ReportItem key={report.id} report={report} actions={actions} />)}
        <AdminPagination total={data.total} page={page} pageSize={PAGE_SIZE} onChange={setPage} />
      </>}
    </AdminPanel>
    <p className="mt-4 text-[11px] text-muted-foreground">{integerFormat.format(data?.total ?? 0)} {data?.total === 1 ? "denúncia" : "denúncias"} nesta seleção · A fila é atualizada automaticamente. Ações ficam no histórico administrativo.</p>
    {actions.dialogs}
  </>;
}

function ReportItem({ report, actions }: { report: ChatReport; actions: ReturnType<typeof useReportModeration> }) {
  const open = report.status === "aberta" || report.status === "em_analise";
  const busy = actions.busyId === report.id;
  return <article className="border-b p-5 last:border-b-0 sm:p-6" aria-label={`Denúncia: ${reportReasonLabels[report.reason]}`}>
    <header className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold">{reportReasonLabels[report.reason]}</span>
      <span className={cn("admin-badge", open ? "admin-badge-warn" : "admin-badge-neutral")}>{reportStatusLabels[report.status]}</span>
      {report.overdue && <span className="admin-badge admin-badge-danger"><Clock3 size={11} aria-hidden="true" />Prazo de 24 h vencido</span>}
      {report.platform_only && <span className="admin-badge admin-badge-neutral" title="Denúncia sobre alguém da liderança: a equipe não vê, só a plataforma decide.">Sobre a liderança</span>}
      <time dateTime={report.created_at} className="ml-auto text-[11px] text-muted-foreground">{displayDate(report.created_at, true)}</time>
    </header>
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,1fr)]">
      <div className="min-w-0 space-y-3">
        <ChatReportEvidence report={report} />
        {report.details && <p className="whitespace-pre-wrap break-words text-xs leading-relaxed">“{report.details}”</p>}
      </div>
      <dl className="admin-definition">
        <div><dt>Equipe</dt><dd><Link className="text-[#111111] underline underline-offset-4" to={`/admin/contas/${report.team_id}`}>{report.team_name}</Link></dd></div>
        <div><dt>Quem enviou</dt><dd>{report.reported_name || "Conta excluída"}{report.reported_is_owner ? " · responsável pela equipe" : !report.reported_is_member && report.reported_profile_id ? " · fora da equipe" : ""}</dd></div>
        <div><dt>Quem denunciou</dt><dd>{report.reporter_name || "Conta excluída"}</dd></div>
        {!open && <div><dt>Resultado</dt><dd>{reportStatusLabels[report.status]}{report.resolved_by_name ? ` por ${report.resolved_by_name}` : ""} em {displayDate(report.resolved_at, true)}{report.member_removed_at ? " · autor removido da equipe" : ""}{report.resolution_note ? <span className="mt-1 block text-muted-foreground">{report.resolution_note}</span> : null}</dd></div>}
      </dl>
    </div>
    {open && <div className="mt-4 flex flex-wrap gap-2">
      <Button size="sm" disabled={busy} onClick={() => actions.resolve(report)}><CheckCircle2 size={14} className="mr-2" />Resolver</Button>
      {report.status === "aberta" && <Button size="sm" variant="outline" disabled={busy} onClick={() => actions.setStatus(report, "em_analise")}><Search size={14} className="mr-2" />Em análise</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => actions.setStatus(report, "descartada")}><XCircle size={14} className="mr-2" />Descartar</Button>
      {report.message_exists && <Button size="sm" variant="outline" disabled={busy} onClick={() => actions.deleteMessage(report)}><Trash2 size={14} className="mr-2" />Apagar mensagem</Button>}
    </div>}
  </article>;
}
