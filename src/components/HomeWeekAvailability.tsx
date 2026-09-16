import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GlassCard } from "@/components/GlassCard";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { addDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AvailabilityDayModal, MyAvailabilityEntry } from "@/components/AvailabilityDayModal";
import {
  DEFAULT_AVAILABILITY_MODE,
  isAvailabilityStatusAllowed,
  type AvailabilityMode,
  type AvailabilityStatus,
} from "@/lib/availability";

const toDateStr = (d: Date) => format(d, "yyyy-MM-dd");

interface HomeWeekAvailabilityProps {
  teamMemberId: string | null;
  myInstruments: string[];
  availabilityMode?: AvailabilityMode;
  /** Called after a successful save/remove so the parent can refresh dependent data (alerts etc.). */
  onChanged?: () => void;
}

/**
 * Quick "próximos 7 dias" availability shortcut.
 * Each day is a chip whose color reflects the saved status:
 * available = green, unavailable = red, unmarked = neutral.
 * Tapping a chip opens the same AvailabilityDayModal used on the
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

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <CalendarCheck className="h-3.5 w-3.5" />
          {availabilityMode === "available_only"
            ? "Disponibilidade da semana"
            : availabilityMode === "unavailable_only"
              ? "Indisponibilidades da semana"
              : "Agenda da semana"}
        </h2>
        <button
          onClick={() => navigate("/app/disponibilidades")}
          className="flex items-center gap-0.5 text-xs font-medium text-primary hover:opacity-80 transition-opacity shrink-0"
        >
          Ver mais <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <GlassCard variant="subtle" className="p-3">
        {loading ? (
          <div className="flex gap-1 sm:gap-2">
            {days.map((_, i) => (
              <Skeleton key={i} className="h-16 flex-1 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex gap-1 sm:gap-2">
            {days.map((date) => {
              const dateStr = toDateStr(date);
              const entry = entries.get(dateStr);
              const status = entry?.status;
              return (
                <button
                  key={dateStr}
                  onClick={() => openDay(date)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2 transition-colors ${
                    status === "available"
                      ? "bg-green-500/15 border-green-500/50 text-green-600 dark:text-green-400"
                      : status === "unavailable"
                      ? "bg-red-500/15 border-red-500/50 text-red-600 dark:text-red-400"
                      : "bg-accent/40 border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <span className="w-full text-center text-[10px] uppercase font-medium leading-none truncate">
                    {format(date, "EEEEEE", { locale: ptBR })}
                  </span>
                  <span className="text-base font-semibold leading-none">
                    {format(date, "dd")}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>
      <p className="text-[11px] text-muted-foreground mt-1.5 px-1">
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
    </div>
  );
}
