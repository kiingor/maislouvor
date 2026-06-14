import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { AvailabilityDayModal, MyAvailabilityEntry } from "@/components/AvailabilityDayModal";
import { Hand } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const toDateStr = (d: Date) => format(d, "yyyy-MM-dd");

// Shared sizing: cells fill the container width (flex-1 + aspect-square),
// so the calendar grows naturally on wider/web layouts while staying compact on mobile.
export const availabilityCalendarClassNames = {
  months: "flex flex-col w-full",
  month: "space-y-4 w-full",
  caption: "flex justify-center pt-1 relative items-center",
  caption_label: "text-sm sm:text-base font-medium capitalize",
  table: "w-full border-collapse",
  head_row: "flex w-full",
  head_cell: "text-muted-foreground rounded-md flex-1 font-normal text-[0.7rem] sm:text-sm",
  row: "flex w-full mt-1.5",
  cell: "flex-1 aspect-square text-center text-sm p-0 relative focus-within:relative focus-within:z-20",
  day: "h-full w-full p-0 font-normal rounded-lg inline-flex items-center justify-center transition-colors hover:bg-accent cursor-pointer text-sm sm:text-base",
  day_selected: "!bg-primary !text-primary-foreground hover:!bg-primary",
  day_outside: "text-muted-foreground opacity-40",
  day_disabled: "text-muted-foreground opacity-40",
  day_hidden: "invisible",
};

interface MyAvailabilityCalendarProps {
  teamMemberId: string | null;
  myInstruments: string[];
}

/**
 * Interactive "Minha disponibilidade" calendar.
 * Clicking a day opens a confirmation dialog where the member marks themselves
 * available (choosing instruments) or unavailable (with a reason).
 * Self-contained: fetches its own data and invalidates the relevant caches on save.
 */
export function MyAvailabilityCalendar({ teamMemberId, myInstruments }: MyAvailabilityCalendarProps) {
  const queryClient = useQueryClient();
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const { data: myAvailability = [] } = useQuery({
    queryKey: ["my-availability", teamMemberId],
    queryFn: async () => {
      if (!teamMemberId) return [];
      const { data } = await supabase
        .from("member_availability")
        .select("available_date, status, instruments, reason")
        .eq("team_member_id", teamMemberId);
      return data ?? [];
    },
    enabled: !!teamMemberId,
  });

  const myMap = useMemo(() => {
    const map: Record<string, MyAvailabilityEntry> = {};
    myAvailability.forEach((a: any) => {
      map[a.available_date] = {
        status: (a.status ?? "available") as "available" | "unavailable",
        instruments: a.instruments ?? [],
        reason: a.reason ?? null,
      };
    });
    return map;
  }, [myAvailability]);

  const modifiers = {
    myAvailable: (d: Date) => myMap[toDateStr(d)]?.status === "available",
    myUnavailable: (d: Date) => myMap[toDateStr(d)]?.status === "unavailable",
  };
  const modifiersClassNames = {
    myAvailable: "!bg-green-500/20 !text-green-700 dark:!text-green-400 font-semibold",
    myUnavailable: "!bg-red-500/20 !text-red-600 dark:!text-red-400 font-semibold",
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["my-availability", teamMemberId] });
    queryClient.invalidateQueries({ queryKey: ["team-availability"] });
  };

  return (
    <div className="space-y-4">
      <Calendar
        mode="default"
        onDayClick={(day) => {
          setModalDate(day);
          setModalOpen(true);
        }}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        classNames={availabilityCalendarClassNames}
        locale={ptBR}
        className="w-full"
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-green-500/40 ring-1 ring-green-500/60" /> Disponível
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500/40 ring-1 ring-red-500/60" /> Indisponível
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Hand className="h-3.5 w-3.5" /> Toque em um dia para marcar
        </span>
      </div>

      <AvailabilityDayModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        date={modalDate}
        teamMemberId={teamMemberId}
        myInstruments={myInstruments}
        existing={modalDate ? myMap[toDateStr(modalDate)] ?? null : null}
        onSaved={handleSaved}
      />
    </div>
  );
}
