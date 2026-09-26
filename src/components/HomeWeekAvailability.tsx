import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AvailabilityDayModal, MyAvailabilityEntry } from "@/components/AvailabilityDayModal";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AVAILABILITY_MODE,
  isAvailabilityStatusAllowed,
  type AvailabilityMode,
  type AvailabilityStatus,
} from "@/lib/availability";

const toDateStr = (d: Date) => format(d, "yyyy-MM-dd");
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Mesmos rótulos curtos do calendário de Disponibilidade (com acento: "sáb"). */
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Máscaras de borda que indicam que a semana continua fora da área visível (larguras estreitas). */
const MASKS = {
  right: "linear-gradient(90deg, black 82%, transparent)",
  left: "linear-gradient(90deg, transparent, black 18%)",
  both: "linear-gradient(90deg, transparent, black 18%, black 82%, transparent)",
} as const;

interface HomeWeekAvailabilityProps {
  teamMemberId: string | null;
  myInstruments: string[];
  availabilityMode?: AvailabilityMode;
  /** Called after a successful save/remove so the parent can refresh dependent data (alerts etc.). */
  onChanged?: () => void;
}

/**
 * Quick "próximos 7 dias" availability shortcut.
 * Each day is a cell whose tint reflects the saved status:
 * available = green, unavailable = red, unmarked = neutral; today = filled circle.
 * Tapping a day opens the same AvailabilityDayModal used on the
 * Disponibilidade screen (Disponível/Indisponível + instruments + reason).
 */
export function HomeWeekAvailability({
  teamMemberId,
  myInstruments,
  availabilityMode = DEFAULT_AVAILABILITY_MODE,
  onChanged,
}: HomeWeekAvailabilityProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<Map<string, MyAvailabilityEntry>>(new Map());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const weekRef = useRef<HTMLDivElement>(null);
  const [cue, setCue] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });

  const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i));

  const fetchAvailability = async () => {
    if (!teamMemberId) {
      setLoading(false);
      return;
    }
    const start = toDateStr(days[0]);
    const end = toDateStr(days[days.length - 1]);
    const { data } = await supabase
      .from("member_availability")
      .select("available_date, status, instruments, reason")
      .eq("team_member_id", teamMemberId)
      .gte("available_date", start)
      .lte("available_date", end);
    const map = new Map<string, MyAvailabilityEntry>();
    (data || []).forEach((a: any) => {
      const status = (a.status ?? "available") as AvailabilityStatus;
      if (!isAvailabilityStatusAllowed(availabilityMode, status)) return;
      map.set(a.available_date, {
        status,
        instruments: a.instruments ?? [],
        reason: a.reason ?? null,
      });
    });
    setEntries(map);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchAvailability();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMemberId, availabilityMode]);

  // Dica de rolagem horizontal: esmaece a borda do lado em que ainda há dias escondidos.
  useEffect(() => {
    const el = weekRef.current;
    if (!el) return;
    const update = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      const left = over && el.scrollLeft > 1;
      const right = over && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setCue((c) => (c.left === left && c.right === right ? c : { left, right }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
  }, [loading, teamMemberId]);

  const openDay = (date: Date) => {
    setSelectedDate(date);
    setModalOpen(true);
  };

  const handleSaved = () => {
    fetchAvailability();
    onChanged?.();
  };

  if (!teamMemberId) return null;

  const selectedEntry = selectedDate ? entries.get(toDateStr(selectedDate)) ?? null : null;

  const title =
    availabilityMode === "available_only"
      ? "Disponibilidade"
      : availabilityMode === "unavailable_only"
        ? "Indisponibilidades"
        : "Agenda";

  const mask = cue.left && cue.right ? MASKS.both : cue.right ? MASKS.right : cue.left ? MASKS.left : undefined;
  const maskStyle: CSSProperties | undefined = mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined;

  return (
    <section aria-labelledby="home-week-title">
      <div className="flex flex-wrap items-end justify-between gap-x-3 mx-1 mb-2">
        <h2 id="home-week-title" className="min-w-0 break-words text-title3 text-foreground">
          {title}{" "}
          <span className="block text-subhead font-normal text-muted-foreground">da semana</span>
        </h2>
        <button
          type="button"
          onClick={() => navigate("/app/disponibilidades")}
          className="inline-flex items-center gap-[3px] min-h-11 -my-2.5 -mr-1.5 px-1.5 rounded-[10px] whitespace-nowrap text-subhead font-medium text-primary transition-opacity active:opacity-60"
        >
          Ver mais <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </div>

      <div className="rounded-card bg-card p-2">
        <div
          ref={weekRef}
          style={maskStyle}
          aria-label={`${cap(format(days[0], "d 'de' MMMM", { locale: ptBR }))} a ${format(days[6], "d 'de' MMMM", { locale: ptBR })}`}
          role="group"
          className="grid grid-cols-[repeat(7,minmax(44px,1fr))] overflow-x-auto overscroll-x-contain snap-x snap-proximity hide-scrollbar"
        >
          {loading
            ? days.map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl bg-fill-quaternary" />)
            : days.map((date, i) => {
                const dateStr = toDateStr(date);
                const status = entries.get(dateStr)?.status;
                const isToday = i === 0;
                const label =
                  cap(format(date, "EEEE, d 'de' MMMM", { locale: ptBR })) +
                  (isToday ? ", hoje" : "") +
                  (status === "unavailable" ? ", indisponível" : status === "available" ? ", disponível" : "");
                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => openDay(date)}
                    aria-label={label}
                    aria-current={isToday ? "date" : undefined}
                    data-status={status ?? "none"}
                    className={cn(
                      "group relative min-h-16 snap-start rounded-2xl px-px bg-clip-content flex flex-col items-center justify-center gap-1 transition-colors",
                      status === "unavailable"
                        ? "bg-ios-red/[0.13] active:bg-ios-red/20"
                        : status === "available"
                          ? "bg-ios-green/[0.14] active:bg-ios-green/20"
                          : "active:bg-fill-tertiary [@media(hover:hover)]:hover:bg-fill-quaternary",
                    )}
                  >
                    <span
                      className={cn(
                        "w-full truncate text-center text-caption2 font-semibold uppercase",
                        status === "unavailable"
                          ? "text-ios-red"
                          : status === "available"
                            ? "text-ios-green"
                            : isToday
                              ? "text-foreground"
                              : "text-muted-foreground",
                      )}
                    >
                      {WEEKDAYS_SHORT[date.getDay()]}
                    </span>
                    <span
                      className={cn(
                        "grid place-items-center min-w-[34px] h-[34px] px-1 rounded-full text-title3 tabular-nums",
                        isToday
                          ? status === "unavailable"
                            ? "bg-ios-red text-white font-semibold"
                            : status === "available"
                              ? "bg-ios-green text-white font-semibold"
                              : "bg-prominent text-prominent-foreground font-semibold"
                          : status === "unavailable"
                            ? "text-ios-red font-medium"
                            : "text-foreground font-medium",
                      )}
                    >
                      {format(date, "dd")}
                    </span>
                    {status === "unavailable" && (
                      <span aria-hidden="true" className="absolute bottom-[5px] h-[2.5px] w-2.5 rounded-sm bg-ios-red" />
                    )}
                    {status === "available" && (
                      <span aria-hidden="true" className="absolute bottom-[5px] h-[5px] w-[5px] rounded-full bg-ios-green" />
                    )}
                  </button>
                );
              })}
        </div>
      </div>
      <p className="text-footnote text-muted-foreground mt-2 mx-1">
        {availabilityMode === "available_only"
          ? "Toque nos dias em que você pode servir."
          : availabilityMode === "unavailable_only"
            ? "Marque somente os dias em que você não pode servir."
            : "Confirme disponibilidade ou registre um impedimento."}
      </p>

      <AvailabilityDayModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        date={selectedDate}
        teamMemberId={teamMemberId}
        myInstruments={myInstruments}
        availabilityMode={availabilityMode}
        existing={selectedEntry}
        onSaved={handleSaved}
      />
    </section>
  );
}
