import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Clock3, Loader2 } from "lucide-react";
import { ChatReportEvidence } from "@/components/chat/ChatReportEvidence";
import { useReportModeration } from "@/components/chat/useReportModeration";
import {
  chatModerationError,
  listChatReports,
  reportReasonLabels,
  reportStatusLabels,
  type ChatReport,
} from "@/lib/chatModeration";
import { cn } from "@/lib/utils";

/* Lista agrupada no estilo do app Ajustes (mesmas medidas de TeamSettings). */
const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";
const CAPSULE_SM =
  "relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3.5 text-subhead font-semibold transition-[background-color,transform,opacity] active:scale-[0.97] disabled:opacity-40 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']";
const CAPSULE_NEUTRAL = cn(CAPSULE_SM, "bg-fill-tertiary text-foreground hover:bg-fill-secondary");

type Filter = "pendentes" | "";

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });

/**
 * Denúncias do chat da equipe, para a liderança (aba Membros). Denúncias sobre o
 * próprio líder não aparecem aqui: ficam com a equipe do +Louvor.
 */
export function TeamChatReports({ teamId }: { teamId: string }) {
  const [filter, setFilter] = useState<Filter>("pendentes");
  const queryKey = ["chat-reports", teamId, filter];
  const reports = useQuery({
    queryKey,
    queryFn: () => listChatReports({ teamId, status: filter, pageSize: 50 }),
    refetchInterval: 60_000,
  });
  const actions = useReportModeration({ invalidate: [["chat-reports", teamId]] });
  const pending = reports.data?.pending_total ?? 0;
  const overdue = reports.data?.overdue_total ?? 0;

  return (
    <section aria-labelledby="settings-chat-reports" id="denuncias">
      <div className="mx-4 mb-1.5 flex items-end justify-between gap-3">
        <h2 id="settings-chat-reports" className="text-footnote text-muted-foreground">
          Denúncias do chat{pending > 0 ? ` (${pending})` : ""}
        </h2>
        <div className="flex shrink-0 gap-1" role="group" aria-label="Filtrar denúncias">
          {(["pendentes", ""] as Filter[]).map((value) => (
            <button
              key={value || "todas"}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "relative rounded-full px-2.5 py-1 text-footnote font-semibold transition-colors before:absolute before:-inset-y-2 before:inset-x-0 before:content-['']",
                filter === value ? "bg-fill-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value ? "Em aberto" : "Todas"}
            </button>
          ))}
        </div>
      </div>

      <div className={GROUP}>
        {reports.isPending ? (
          <div className="flex min-h-[60px] items-center gap-2 px-4 text-subhead text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando denúncias…
          </div>
        ) : reports.error ? (
          <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-2 px-4 py-3" role="alert">
            <p className="text-subhead text-muted-foreground">{chatModerationError(reports.error)}</p>
            <button type="button" onClick={() => void reports.refetch()} className={CAPSULE_NEUTRAL}>
              Tentar de novo
            </button>
          </div>
        ) : !reports.data.items.length ? (
          <p className="flex min-h-[60px] items-center px-4 text-subhead text-muted-foreground">
            {filter ? "Nenhuma denúncia em aberto." : "Nenhuma denúncia por aqui."}
          </p>
        ) : (
          reports.data.items.map((report, i) => (
            <ReportRow key={report.id} report={report} first={i === 0} actions={actions} />
          ))
        )}
      </div>
      <p className={GROUP_FOOTER}>
        {overdue > 0 && <span className="font-semibold text-ios-red">{overdue} passaram do prazo de 24 horas. </span>}
        Analise cada denúncia em até 24 horas. A equipe do +Louvor também recebe as denúncias, e as que forem sobre
        você ficam só com ela.
      </p>
      {actions.dialogs}
    </section>
  );
}

function ReportRow({
  report,
  first,
  actions,
}: {
  report: ChatReport;
  first: boolean;
  actions: ReturnType<typeof useReportModeration>;
}) {
  const open = report.status === "aberta" || report.status === "em_analise";
  const busy = actions.busyId === report.id;
  return (
    <article
      aria-label={`Denúncia: ${reportReasonLabels[report.reason]}`}
      className={cn("space-y-2.5 px-4 py-3.5", !first && "border-t border-separator")}
    >
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-body font-semibold">{reportReasonLabels[report.reason]}</span>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-caption1 font-semibold",
            open ? "bg-prominent text-prominent-foreground" : "bg-fill-tertiary text-muted-foreground",
          )}
        >
          {reportStatusLabels[report.status]}
        </span>
        {report.overdue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-ios-red/10 px-2 py-0.5 text-caption1 font-semibold text-ios-red">
            <Clock3 className="h-3 w-3" aria-hidden="true" />
            Prazo vencido
          </span>
        )}
        <time dateTime={report.created_at} className="ml-auto text-footnote text-muted-foreground">
          {ago(report.created_at)}
        </time>
      </header>

      <ChatReportEvidence report={report} />

      <p className="text-footnote text-muted-foreground">
        Denunciada por {report.reporter_name || "conta excluída"}
        {!report.reported_is_member && report.reported_profile_id && " · quem enviou não está mais na equipe"}
      </p>
      {report.details && (
        <p className="whitespace-pre-wrap break-words text-subhead text-foreground [overflow-wrap:anywhere]">
          “{report.details}”
        </p>
      )}
      {!open && (
        <p className="text-footnote text-muted-foreground">
          {reportStatusLabels[report.status]}
          {report.resolved_by_name ? ` por ${report.resolved_by_name}` : ""}
          {report.resolved_at ? ` ${ago(report.resolved_at)}` : ""}
          {report.member_removed_at ? " · autor removido da equipe" : ""}
          {report.resolution_note ? ` · ${report.resolution_note}` : ""}
        </p>
      )}

      {open && (
        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => actions.resolve(report)}
            className={cn(CAPSULE_SM, "bg-prominent text-prominent-foreground")}
          >
            Resolver
          </button>
          {report.status === "aberta" && (
            <button type="button" disabled={busy} onClick={() => actions.setStatus(report, "em_analise")} className={CAPSULE_NEUTRAL}>
              Em análise
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => actions.setStatus(report, "descartada")} className={CAPSULE_NEUTRAL}>
            Descartar
          </button>
          {report.message_exists && (
            <button
              type="button"
              disabled={busy}
              onClick={() => actions.deleteMessage(report)}
              className={cn(CAPSULE_SM, "bg-ios-red/10 text-ios-red hover:bg-ios-red/15")}
            >
              Apagar mensagem
            </button>
          )}
        </div>
      )}
    </article>
  );
}
