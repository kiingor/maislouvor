import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { instrumentIcon } from "@/data/instruments";
import { CalendarDays, CheckCircle2, Clock, Guitar, Users } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface UserStatsCardProps {
  teamMemberId: string | null;
  /** Membro ainda carregando: mostra o esqueleto em vez de "entre em uma equipe". */
  loading?: boolean;
}

interface LineupRow {
  id: string;
  instrument: string;
  status: "pending" | "accepted" | "declined";
  culto_id: string;
  cultos: { id: string; name: string; date: string } | null;
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * "Minhas estatísticas" card — real numbers from culto_lineup for the current
 * member in the active team: how many cultos scheduled, accepted vs pending,
 * the most-scheduled instrument, and the next upcoming assignments.
 */
export function UserStatsCard({ teamMemberId, loading = false }: UserStatsCardProps) {
  const { data: lineups = [], isLoading } = useQuery({
    queryKey: ["my-lineup-stats", teamMemberId],
    queryFn: async () => {
      if (!teamMemberId) return [];
      const { data } = await supabase
        .from("culto_lineup")
        .select("id, instrument, status, culto_id, cultos(id, name, date)")
        .eq("team_member_id", teamMemberId);
      return (data ?? []) as unknown as LineupRow[];
    },
    enabled: !!teamMemberId,
  });

  const stats = useMemo(() => {
    const total = lineups.length;
    const accepted = lineups.filter((l) => l.status === "accepted").length;
    const pending = lineups.filter((l) => l.status === "pending").length;

    // Most-scheduled instrument
    const counts: Record<string, number> = {};
    lineups.forEach((l) => {
      if (l.instrument) counts[l.instrument] = (counts[l.instrument] ?? 0) + 1;
    });
    let topInstrument: string | null = null;
    let topCount = 0;
    Object.entries(counts).forEach(([inst, n]) => {
      if (n > topCount) {
        topInstrument = inst;
        topCount = n;
      }
    });

    // Upcoming assignments (date >= today), soonest first
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const upcoming = lineups
      .filter((l) => l.cultos?.date && l.cultos.date >= todayStr && l.status !== "declined")
      .sort((a, b) => (a.cultos!.date < b.cultos!.date ? -1 : 1))
      .slice(0, 3);

    return { total, accepted, pending, topInstrument, upcoming };
  }, [lineups]);

  const TopIcon = stats.topInstrument ? instrumentIcon(stats.topInstrument) : Guitar;

  return (
    <section aria-labelledby="my-stats-title">
      {/* Rótulo de grupo no padrão da tela Ajustes/Usuário, onde o card é usado. */}
      <h2 id="my-stats-title" className="mx-4 mb-1.5 text-footnote text-muted-foreground">
        Minhas estatísticas
      </h2>

      {isLoading || loading ? (
        <div className="grid grid-cols-2 gap-2.5" aria-busy="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[92px] rounded-card bg-card animate-pulse" />
          ))}
        </div>
      ) : !teamMemberId ? (
        <div className="rounded-card bg-card flex items-center gap-3 px-4 py-3.5">
          <Users className="h-7 w-7 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          <p className="text-body text-muted-foreground">Entre em uma equipe para ver suas estatísticas.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatTile
              icon={<CalendarDays />}
              value={stats.total}
              label={cap(stats.total === 1 ? "culto escalado" : "cultos escalados")}
            />
            <StatTile
              icon={<CheckCircle2 />}
              iconClassName="bg-ios-green"
              value={`${stats.accepted}`}
              label="Aceitas"
              caption={`${stats.pending} pendente${stats.pending === 1 ? "" : "s"}`}
            />
            <StatTile
              icon={<TopIcon />}
              label={
                <span className="block truncate text-headline text-foreground">{stats.topInstrument ?? "—"}</span>
              }
              caption="instrumento mais escalado"
            />
            <StatTile
              icon={<Clock />}
              iconClassName="bg-ios-orange"
              value={`${stats.pending}`}
              label={cap(stats.pending === 1 ? "escala pendente" : "escalas pendentes")}
            />
          </div>

          <h3 className="text-footnote text-muted-foreground mx-4 mt-6 mb-1.5">Próximas escalas</h3>
          <div className="rounded-card bg-card overflow-hidden">
            {stats.upcoming.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-3.5">
                <CalendarDays className="h-7 w-7 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
                <p className="text-body text-muted-foreground">Nenhuma escala futura.</p>
              </div>
            ) : (
              stats.upcoming.map((l, i) => {
                const Icon = instrumentIcon(l.instrument);
                return (
                  <div key={l.id} className="relative flex items-center justify-between gap-3 min-h-[52px] px-4 py-2.5">
                    {i > 0 && (
                      <span aria-hidden="true" className="absolute top-0 left-4 right-0 border-t border-separator" />
                    )}
                    <div className="min-w-0">
                      <p className="text-body text-foreground truncate">{l.cultos?.name ?? "Culto"}</p>
                      <p className="text-subhead text-muted-foreground">
                        {l.cultos?.date
                          ? cap(format(parseISO(l.cultos.date), "EEE, dd 'de' MMM", { locale: ptBR }))
                          : ""}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-[5px] shrink-0 max-w-[45%] rounded-full bg-fill-tertiary py-1 pl-2 pr-2.5 text-footnote font-medium text-foreground">
                      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />}
                      <span className="truncate">{l.instrument}</span>
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </section>
  );
}

interface StatTileProps {
  /** Ícone lucide (sem tamanho; o tile aplica 17px). */
  icon: ReactNode;
  /** Número em destaque (Title 1). Omitido = só rótulo. */
  value?: ReactNode;
  label: ReactNode;
  caption?: ReactNode;
  /** Torna o tile pressionável (botão). */
  onClick?: () => void;
  /** Ocupa as duas colunas, em linha (ícone · rótulo · número). */
  wide?: boolean;
  /** Troca a cor do círculo do ícone (padrão: `bg-prominent`). Use só para status. */
  iconClassName?: string;
  className?: string;
}

/**
 * Tile de resumo no estilo das listas inteligentes do Lembretes (iOS):
 * círculo tintado com ícone branco, número Title 1 à direita, rótulo Subhead semibold secundário.
 * Superfície opaca da camada de conteúdo (HIG > Materials).
 */
export function StatTile({ icon, value, label, caption, onClick, wide, iconClassName, className }: StatTileProps) {
  const iconEl = (
    <span
      aria-hidden="true"
      className={cn(
        "grid place-items-center h-8 w-8 shrink-0 rounded-full bg-prominent text-prominent-foreground [&_svg]:h-[17px] [&_svg]:w-[17px]",
        iconClassName,
      )}
    >
      {icon}
    </span>
  );
  const labelEl = (
    <span className={cn("min-w-0 text-subhead font-semibold text-muted-foreground", wide && "flex-1")}>
      {label}
      {caption && <small className="block text-footnote font-normal">{caption}</small>}
    </span>
  );
  const valueEl =
    value !== undefined && value !== null ? (
      <strong className="text-title1 font-bold tabular-nums text-foreground min-w-0 truncate">{value}</strong>
    ) : null;

  const classes = cn(
    "rounded-card bg-card text-left",
    wide
      ? "col-span-2 flex flex-row items-center gap-3 px-3.5 py-3"
      : "flex flex-col justify-between gap-2 min-h-[92px] px-3.5 py-3",
    onClick &&
      "cursor-pointer transition-[transform,background-color] duration-200 active:scale-[0.98] active:bg-grouped-tertiary",
    className,
  );

  const body = wide ? (
    <>
      {iconEl}
      {labelEl}
      {valueEl}
    </>
  ) : (
    <>
      <span className="flex items-start justify-between gap-2">
        {iconEl}
        {valueEl}
      </span>
      {labelEl}
    </>
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  ) : (
    <div className={classes}>{body}</div>
  );
}
