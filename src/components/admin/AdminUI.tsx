import type { ReactNode } from "react";
import { Archive, ArrowLeft, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock3, Inbox, Loader2, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { integerFormat, platformError, ticketStatusLabels, ticketPriorityLabels, type TicketStatus, type TicketPriority } from "@/lib/platform";

export function AdminPageHeader({ eyebrow, title, description, actions, back }: {
  eyebrow?: string; title: string; description: string; actions?: ReactNode; back?: string;
}) {
  return <div className="admin-page-heading">
    <div className="min-w-0">
      {back && <Link to={back} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} />Voltar</Link>}
      {eyebrow && <p className="admin-eyebrow">{eyebrow}</p>}
      <h1>{title}</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}

export function AdminPanel({ title, description, action, children, className }: {
  title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string;
}) {
  return <section className={cn("admin-panel", className)}>
    {title && <div className="admin-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>}
    {children}
  </section>;
}

export function AdminMetric({ label, value, detail, icon, accent }: {
  label: string; value: number | string; detail?: string; icon: ReactNode; accent?: boolean;
}) {
  return <div className={cn("admin-metric", accent && "admin-metric-accent")}>
    <div className="flex items-center justify-between gap-2"><p>{label}</p><span className="admin-metric-icon">{icon}</span></div>
    <strong>{typeof value === "number" ? integerFormat.format(value) : value}</strong>
    {detail && <span className="block text-xs leading-relaxed text-muted-foreground">{detail}</span>}
  </div>;
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  const Icon = { open: Circle, in_review: Search, planned: CalendarClock, in_progress: Clock3, resolved: CheckCircle2, closed: Archive }[status];
  return <span className={cn("admin-badge", `admin-status-${status}`)}><Icon size={12} aria-hidden="true" className="shrink-0" />{ticketStatusLabels[status]}</span>;
}
export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return <span className={cn("admin-badge", priority === "urgent" ? "admin-badge-danger" : priority === "high" ? "admin-badge-warn" : "admin-badge-neutral")}>
    {ticketPriorityLabels[priority]}
  </span>;
}

export function SearchField({ value, onChange, placeholder = "Buscar", label = "Buscar" }: {
  value: string; onChange: (value: string) => void; placeholder?: string; label?: string;
}) {
  return <div className="relative w-full sm:max-w-sm"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-muted-foreground" />
    <Input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} maxLength={200} placeholder={placeholder} className="h-10 bg-white pl-9" />
  </div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="admin-empty"><span className="admin-empty-icon"><Inbox size={23} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function QueryState({ loading, error, retry }: { loading?: boolean; error?: unknown; retry?: () => void }) {
  if (loading) return <div role="status" className="flex min-h-64 items-center justify-center gap-3 text-sm text-muted-foreground"><Loader2 size={20} className="animate-spin" />Carregando dados…</div>;
  if (error) return <div role="alert" className="admin-empty"><span className="admin-empty-icon"><TriangleAlert size={23} /></span><h3>Não foi possível carregar</h3><p>{platformError(error)}</p>
    {retry && <Button variant="outline" onClick={retry}><RefreshCw size={15} className="mr-2" />Tentar novamente</Button>}</div>;
  return null;
}
export function AdminPagination({ page, total, pageSize = 20, onChange }: { page: number; total: number; pageSize?: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="admin-pagination"><p>{total ? `${integerFormat.format((page - 1) * pageSize + 1)}–${integerFormat.format(Math.min(page * pageSize, total))} de ${integerFormat.format(total)}` : "0 resultados"}</p>
    <div className="flex items-center gap-2"><Button size="icon" variant="outline" aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></Button>
      <span className="min-w-16 text-center text-xs tabular-nums">{page} / {pages}</span>
      <Button size="icon" variant="outline" aria-label="Próxima página" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></Button></div>
  </div>;
}
