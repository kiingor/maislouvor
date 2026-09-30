import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, BellRing, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminPageHeader, AdminPanel, PriorityBadge, QueryState, StatusBadge } from "@/components/admin/AdminUI";
import { usePlatformAccess } from "@/contexts/PlatformAccessContext";
import { useToast } from "@/hooks/use-toast";
import { displayDate, platformError, platformRpc, ticketCategoryLabels, ticketPriorityLabels, ticketStatusLabels, type TicketDetail, type TicketPriority, type TicketStatus } from "@/lib/platform";
import "@/components/admin/admin.css";

export default function SupportTicketDetail({ admin = false }: { admin?: boolean }) {
  const { id } = useParams(); const { userId } = usePlatformAccess(); const { toast } = useToast(); const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<{ status?: TicketStatus; priority?: TicketPriority }>({});
  const queryKey = ["support", "ticket", userId, id];
  const ticket = useQuery({ queryKey, queryFn: () => platformRpc<TicketDetail>("get_support_ticket", { p_ticket_id: id! }), enabled: !!id && !!userId, refetchInterval: 15_000 });
  const update = useMutation({
    mutationFn: (variables: { message?: string; changes?: boolean }) => platformRpc<TicketDetail>("reply_support_ticket", {
      p_ticket_id: id!, p_message: variables.message || null,
      ...(admin && variables.changes ? { p_status: draft.status ?? null, p_priority: draft.priority ?? null } : {}),
    }),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(queryKey, data);
      if (variables.message) setMessage(""); if (variables.changes) setDraft({});
      void queryClient.invalidateQueries({ queryKey: ["support"] }); void queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast({ className: "platform-toast", title: variables.message ? (admin ? "Resposta enviada" : "Mensagem enviada") : "Ticket atualizado",
        description: data.notified ? "O usuário receberá uma notificação com o retorno." : undefined });
    },
    onError: (error) => toast({ className: "platform-toast", title: "Não foi possível enviar", description: platformError(error), variant: "destructive" }),
  });
  const data = ticket.data;
  const metaDirty = !!data && ((draft.status !== undefined && draft.status !== data.status) || (draft.priority !== undefined && draft.priority !== data.priority));
  return <div className={admin ? "" : "platform-support mx-auto max-w-5xl animate-in-fade"}>
    {admin ? <AdminPageHeader eyebrow={data ? `Ticket #${data.ticket_number} · ${ticketCategoryLabels[data.category]}` : "Atendimento"} title={data?.title || "Detalhes do ticket"} description="Analise o relato e mantenha o usuário informado sobre o andamento." back="/admin/tickets" /> : <div className="mb-6"><Link to="/app/sugestoes" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} />Minhas sugestões</Link><p className="mb-2 text-xs text-muted-foreground">{data ? `Ticket #${data.ticket_number} · ${ticketCategoryLabels[data.category]}` : "Atendimento"}</p><h1 className="break-words text-2xl font-semibold tracking-tight">{data?.title || "Detalhes do ticket"}</h1></div>}
    <QueryState loading={ticket.isPending} error={ticket.error} retry={() => void ticket.refetch()} />
    {data && !ticket.error && <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5"><AdminPanel title="Relato original" action={<StatusBadge status={data.status} />}><div className="p-5 sm:p-6"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{data.description}</p><p className="mt-5 border-t pt-4 text-[10px] text-muted-foreground">Enviado em {displayDate(data.created_at, true)}</p></div></AdminPanel>
        <AdminPanel title="Conversa" description="O histórico de mensagens fica disponível para acompanhar o atendimento."><div className="space-y-4 p-5 sm:p-6">
          {!data.messages.length && <p className="rounded-lg bg-neutral-50 p-4 text-xs leading-relaxed text-muted-foreground">{admin ? "O usuário aguarda seu primeiro retorno. Envie uma resposta abaixo." : "Seu ticket foi recebido. A resposta do suporte aparecerá aqui e nas suas notificações."}</p>}
          {data.messages.map((item) => <article key={item.id} className={`support-thread-message ${item.is_staff ? "is-staff" : ""}`}><header className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold">{item.is_staff ? "Equipe +Louvor" : item.author_name}{item.is_staff && <span className="ml-2 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-medium text-[#111111]">Suporte</span>}</p><time className="text-[10px] text-muted-foreground" dateTime={item.created_at}>{displayDate(item.created_at, true)}</time></header><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.message}</p></article>)}
        </div><form onSubmit={(event) => { event.preventDefault(); update.mutate({ message: message.trim() }); }} className="border-t p-5 sm:p-6"><label htmlFor="ticket-reply" className="mb-3 block text-sm font-medium">{admin ? "Responder ao usuário" : "Adicionar uma mensagem"}</label><Textarea id="ticket-reply" value={message} onChange={(event) => setMessage(event.target.value)} minLength={2} maxLength={8000} required rows={5} placeholder={admin ? "Explique o que foi analisado e quais são os próximos passos." : "Adicione detalhes ou responda às perguntas do suporte."} disabled={update.isPending} />
          {!admin && ["resolved", "closed"].includes(data.status) && <p className="mt-2 text-xs text-muted-foreground">Enviar uma nova mensagem reabre o ticket para análise.</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] text-muted-foreground">{message.length}/8.000 caracteres</p><Button type="submit" disabled={message.trim().length < 2 || update.isPending}><Send size={14} className="mr-2" />{update.isPending ? "Enviando…" : admin ? "Enviar resposta" : "Enviar mensagem"}</Button></div>
          {admin && <p className="mt-4 flex items-center gap-2 text-[10px] text-muted-foreground"><BellRing size={12} />Sua resposta gera uma notificação para quem abriu o ticket.</p>}
        </form></AdminPanel>
      </div>
      <div className="min-w-0 space-y-5">{admin && <AdminPanel title="Organizar atendimento"><div className="space-y-4 p-5"><div><label className="admin-field-label" htmlFor="ticket-status">Status</label><Select value={draft.status ?? data.status} onValueChange={(value: TicketStatus) => setDraft((previous) => ({ ...previous, status: value }))} disabled={update.isPending}><SelectTrigger id="ticket-status"><SelectValue /></SelectTrigger><SelectContent className="platform-popover">{Object.entries(ticketStatusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><div><label className="admin-field-label" htmlFor="ticket-priority">Prioridade</label><Select value={draft.priority ?? data.priority} onValueChange={(value: TicketPriority) => setDraft((previous) => ({ ...previous, priority: value }))} disabled={update.isPending}><SelectTrigger id="ticket-priority"><SelectValue /></SelectTrigger><SelectContent className="platform-popover">{Object.entries(ticketPriorityLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><Button className="w-full" variant="outline" disabled={!metaDirty || update.isPending} onClick={() => update.mutate({ changes: true })}><Check size={14} className="mr-2" />{update.isPending ? "Salvando…" : "Salvar alterações"}</Button><p className="text-[10px] leading-relaxed text-muted-foreground">Mudanças de status também notificam o usuário. A prioridade organiza sua fila.</p></div></AdminPanel>}
        <AdminPanel title="Sobre o ticket"><dl className="admin-definition p-5"><div><dt>Número</dt><dd>#{data.ticket_number}</dd></div><div><dt>Tipo</dt><dd>{ticketCategoryLabels[data.category]}</dd></div><div><dt>Situação atual</dt><dd><StatusBadge status={data.status} /></dd></div>{admin && <><div><dt>Prioridade</dt><dd><PriorityBadge priority={data.priority} /></dd></div><div><dt>Usuário</dt><dd>{data.requester_name || "Sem nome"}</dd></div><div><dt>E-mail</dt><dd>{data.requester_email || "—"}</dd></div></>}<div><dt>Equipe</dt><dd>{admin && data.team_id ? <Link className="text-[#111111] underline underline-offset-4" to={`/admin/contas/${data.team_id}`}>{data.team_name}</Link> : data.team_name || "Sem equipe vinculada"}</dd></div><div><dt>Última atualização</dt><dd>{displayDate(data.updated_at, true)}</dd></div></dl></AdminPanel>
      </div>
    </div>}
  </div>;
}
