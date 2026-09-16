import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { AlertTriangle, BellRing, CheckCircle2, CalendarX, ShieldCheck } from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  hasAvailabilityConflict,
  type AvailabilityMode,
  type AvailabilityStatus,
} from "@/lib/availability";

export interface HomeAlertLineup {
  id: string;
  status: string;
  instrument: string;
  culto: { id: string; name: string; date: string } | null;
}

interface HomeAlertsProps {
  /** Future lineups for the current user (status + culto with date). */
  lineups: HomeAlertLineup[];
  /** Active availability response keyed by date ('yyyy-MM-dd'). */
  availabilityByDate: Record<string, AvailabilityStatus>;
  availabilityMode: AvailabilityMode;
  /** Accept a pending lineup (sets status='accepted'). */
  onConfirm: (lineupId: string) => void;
}

const parseDate = (d: string) => new Date(d + "T12:00:00");
const fmt = (d: string) => format(parseDate(d), "EEEE, dd 'de' MMMM", { locale: ptBR });

/**
 * Smart alerts for the Home dashboard:
 *  (a) Cultos within <=3 days where my lineup is still 'pending' → "Confirme sua presença".
 *  (b) Conflicts according to the team's active availability workflow.
 * Renders nothing-but-a-discreet "tudo certo" when there are no alerts.
 */
export function HomeAlerts({ lineups, availabilityByDate, availabilityMode, onConfirm }: HomeAlertsProps) {
  const navigate = useNavigate();
  const today = new Date();

  const withCulto = lineups.filter((l) => l.culto?.date);

  // (a) Confirm-soon: pending lineups for cultos within the next 3 days.
  const confirmSoon = withCulto.filter((l) => {
    if (l.status !== "pending") return false;
    const days = differenceInCalendarDays(parseDate(l.culto!.date), today);
    return days >= 0 && days <= 3;
  });

  // (b) Conflicts follow the team's active availability workflow.
  const conflicts = withCulto.filter(
    (l) =>
      l.status !== "declined" &&
      hasAvailabilityConflict(availabilityMode, availabilityByDate[l.culto!.date]),
  );

  const hasAlerts = confirmSoon.length > 0 || conflicts.length > 0;

  if (!hasAlerts) {
    return (
      <GlassCard
        variant="subtle"
        className="p-3 flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ShieldCheck className="h-4 w-4 text-green-500 shrink-0" />
        Tudo certo — sem pendências ou conflitos.
      </GlassCard>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
        <BellRing className="h-3.5 w-3.5" /> Alertas
      </h2>
      <div className="space-y-2">
        {confirmSoon.map((l) => {
          const days = differenceInCalendarDays(parseDate(l.culto!.date), today);
          const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
          return (
            <GlassCard
              key={`confirm-${l.id}`}
              className="p-4 border border-yellow-500/30 bg-yellow-500/[0.04]"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4.5 w-4.5 text-yellow-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Confirme sua presença</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {l.culto!.name} · {fmt(l.culto!.date)} ({when}) · {l.instrument}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 mt-2.5">
                    <Button
                      size="sm"
                      className="rounded-xl gap-1.5 h-8 w-full sm:w-auto"
                      onClick={() => onConfirm(l.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl h-8 w-full sm:w-auto"
                      onClick={() => navigate(`/app/cultos/${l.culto!.id}`)}
                    >
                      Ver culto
                    </Button>
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}

        {conflicts.map((l) => (
          <GlassCard
            key={`conflict-${l.id}`}
            className="p-4 border border-red-500/30 bg-red-500/[0.04]"
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <CalendarX className="h-4.5 w-4.5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">Conflito de disponibilidade</p>
                <p className="text-xs text-muted-foreground capitalize">
                  Você está escalado em {l.culto!.name} ({fmt(l.culto!.date)}), mas {" "}
                  {availabilityByDate[l.culto!.date] === "unavailable"
                    ? "marcou indisponibilidade nesse dia."
                    : "não marcou disponibilidade nesse dia."}
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mt-2.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl h-8 w-full sm:w-auto"
                    onClick={() => navigate("/app/disponibilidades")}
                  >
                    Revisar disponibilidade
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-xl h-8 w-full sm:w-auto"
                    onClick={() => navigate(`/app/cultos/${l.culto!.id}`)}
                  >
                    Ver culto
                  </Button>
                </div>
              </div>
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
