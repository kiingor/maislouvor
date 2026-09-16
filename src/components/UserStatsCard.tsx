import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { instrumentIcon } from "@/data/instruments";
import { BarChart3, CalendarDays, CheckCircle2, Clock, Guitar } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface UserStatsCardProps {
  teamMemberId: string | null;
}

interface LineupRow {
  id: string;
  instrument: string;
  status: "pending" | "accepted" | "declined";
  culto_id: string;
  cultos: { id: string; name: string; date: string } | null;
}

/**
 * "Minhas estatísticas" card — real numbers from culto_lineup for the current
 * member in the active team: how many cultos scheduled, accepted vs pending,
 * the most-scheduled instrument, and the next upcoming assignments.
 */
export function UserStatsCard({ teamMemberId }: UserStatsCardProps) {
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

  const TopIcon = stats.topInstrument ? instrumentIcon(stats.topInstrument) : null;

  return (
    <GlassCard className="p-4 space-y-4">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
        <BarChart3 className="h-3 w-3" /> Minhas estatísticas
      </label>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl glass-subtle animate-pulse" />
          ))}
        </div>
      ) : !teamMemberId ? (
        <p className="text-sm text-muted-foreground">Entre em uma equipe para ver suas estatísticas.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatTile
              icon={<CalendarDays className="h-4 w-4 text-primary" />}
              value={stats.total}
              label={stats.total === 1 ? "culto escalado" : "cultos escalados"}
            />
            <StatTile
              icon={<CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
              value={`${stats.accepted}`}
              label="aceitas"
              sub={`${stats.pending} pendente${stats.pending === 1 ? "" : "s"}`}
            />
            <StatTile
              icon={TopIcon ? <TopIcon className="h-4 w-4 text-primary" /> : <Guitar className="h-4 w-4 text-primary" />}
              value={stats.topInstrument ?? "—"}
              valueClassName="text-base truncate"
              label="instrumento mais escalado"
            />
            <StatTile
              icon={<Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
              value={`${stats.pending}`}
              label={stats.pending === 1 ? "escala pendente" : "escalas pendentes"}
            />
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Próximas escalas</p>
            {stats.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma escala futura.</p>
            ) : (
              <div className="space-y-2">
                {stats.upcoming.map((l) => {
                  const Icon = instrumentIcon(l.instrument);
                  return (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-3 rounded-xl glass-subtle px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.cultos?.name ?? "Culto"}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {l.cultos?.date
                            ? format(parseISO(l.cultos.date), "EEE, dd 'de' MMM", { locale: ptBR })
                            : ""}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-medium shrink-0">
                        {Icon && <Icon className="h-3 w-3" />}
                        {l.instrument}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </GlassCard>
  );
}

function StatTile({
  icon,
  value,
  label,
  sub,
  valueClassName,
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  sub?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-xl glass-subtle p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5">{icon}</div>
      <p className={valueClassName ? `font-semibold ${valueClassName}` : "text-2xl font-semibold leading-none"}>
        {value}
      </p>
      <p className="text-[10px] sm:text-[11px] text-muted-foreground leading-tight truncate">{label}</p>
      {sub && <p className="text-[10px] sm:text-[11px] text-muted-foreground/80 leading-tight truncate">{sub}</p>}
    </div>
  );
}
