import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, CalendarX } from "lucide-react";
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
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Pure alert computation, shared by HomeAlerts and the Home "Tudo certo" row:
 *  (a) Cultos within <=3 days where my lineup is still 'pending' → "Confirme sua presença".
 *  (b) Conflicts according to the team's active availability workflow.
 */
export function getHomeAlerts(
  lineups: HomeAlertLineup[],
  availabilityByDate: Record<string, AvailabilityStatus>,
  availabilityMode: AvailabilityMode,
  today: Date = new Date(),
) {
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

  return { confirmSoon, conflicts, hasAlerts: confirmSoon.length > 0 || conflicts.length > 0 };
}

/**
 * Smart alerts for the Home dashboard, as an inset grouped list (iOS).
 * Renders nothing when there are no alerts — Home then shows the "Tudo certo"
 * row inside the profile card (see getHomeAlerts).
 */
export function HomeAlerts({ lineups, availabilityByDate, availabilityMode, onConfirm }: HomeAlertsProps) {
  const navigate = useNavigate();
  const today = new Date();
  const { confirmSoon, conflicts, hasAlerts } = getHomeAlerts(lineups, availabilityByDate, availabilityMode, today);

  if (!hasAlerts) return null;

  return (
    <section aria-labelledby="home-alerts-title">
      <h2 id="home-alerts-title" className="text-title3 text-foreground mx-1 mb-2">
        Alertas
      </h2>
      <div className="rounded-card bg-card overflow-hidden">
        {confirmSoon.map((l, i) => {
          const days = differenceInCalendarDays(parseDate(l.culto!.date), today);
          const when = days === 0 ? "hoje" : days === 1 ? "amanhã" : `em ${days} dias`;
          return (
            <div key={`confirm-${l.id}`} className="relative flex items-start gap-3 px-4 py-3">
              {i > 0 && <Separator />}
              <span
                aria-hidden="true"
                className="mt-0.5 grid place-items-center h-[30px] w-[30px] shrink-0 rounded-[8px] bg-ios-orange/15 text-ios-orange"
              >
                <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-headline text-foreground">Confirme sua presença</p>
                <p className="text-subhead text-muted-foreground break-words">
                  {l.culto!.name} · {cap(fmt(l.culto!.date))} ({when}) · {l.instrument}
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  <Button size="sm" onClick={() => onConfirm(l.id)}>
                    <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" /> Confirmar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/app/cultos/${l.culto!.id}`)}
                  >
                    Ver culto
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {conflicts.map((l, i) => (
          <div key={`conflict-${l.id}`} className="relative flex items-start gap-3 px-4 py-3">
            {(confirmSoon.length > 0 || i > 0) && <Separator />}
            <span
              aria-hidden="true"
              className="mt-0.5 grid place-items-center h-[30px] w-[30px] shrink-0 rounded-[8px] bg-ios-red/15 text-ios-red"
            >
              <CalendarX className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-headline text-foreground">Conflito de disponibilidade</p>
              <p className="text-subhead text-muted-foreground break-words">
                Você está escalado em {l.culto!.name} ({fmt(l.culto!.date)}), mas {" "}
                {availabilityByDate[l.culto!.date] === "unavailable"
                  ? "marcou indisponibilidade nesse dia."
                  : "não marcou disponibilidade nesse dia."}
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate("/app/disponibilidades")}
                >
                  Revisar disponibilidade
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/app/cultos/${l.culto!.id}`)}
                >
                  Ver culto
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Separador hairline recuado até o texto (58px = margem 16 + ícone 30 + espaço 12). */
function Separator() {
  return <span aria-hidden="true" className="absolute top-0 left-[58px] right-0 border-t border-separator" />;
}
