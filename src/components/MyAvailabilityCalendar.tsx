import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import { AvailabilityDayModal, MyAvailabilityEntry } from "@/components/AvailabilityDayModal";
import { Hand } from "lucide-react";
import { format, isToday } from "date-fns";
import { cn } from "@/lib/utils";
import { ptBR } from "date-fns/locale";
import {
  DEFAULT_AVAILABILITY_MODE,
  isAvailabilityStatusAllowed,
  type AvailabilityMode,
  type AvailabilityStatus,
} from "@/lib/availability";

const toDateStr = (d: Date) => format(d, "yyyy-MM-dd");

// Grade mensal no estilo do Calendário do iOS, dentro do card do chamador:
// mês em Headline à esquerda, setas tintadas à direita (alvo 44pt), dias da semana em Caption 2
// e números em círculos de 44pt. As colunas acompanham a largura do card.
// Hoje/seleção/estados ficam a cargo de quem usa (modifiers), para nunca haver dois fundos no mesmo dia.
export const availabilityCalendarClassNames = {
  months: "flex flex-col w-full",
  month: "w-full space-y-2",
  caption: "relative flex h-11 items-center pl-2 pr-[92px]",
  caption_label: "text-headline text-foreground capitalize",
  nav: "absolute right-0 top-0 flex items-center",
  nav_button:
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-primary transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary disabled:opacity-30 [&_svg]:h-5 [&_svg]:w-5",
  nav_button_previous: "",
  nav_button_next: "",
  table: "w-full border-collapse",
  head_row: "flex w-full",
  head_cell: "flex-1 pb-1 text-caption2 font-semibold uppercase text-muted-foreground",
  row: "flex w-full mt-0.5",
  cell: "relative flex h-12 flex-1 items-center justify-center p-0 text-center focus-within:z-20",
  day: "relative inline-flex h-11 w-11 max-w-full items-center justify-center rounded-full p-0 text-body font-normal tabular-nums text-foreground transition-colors hover:bg-fill-quaternary active:bg-fill-tertiary cursor-pointer",
  day_today: "font-semibold",
  day_selected: "",
  day_outside: "text-label-tertiary",
  day_disabled: "text-label-tertiary opacity-50",
  day_hidden: "invisible",
};

/** Dias da semana abreviados ("SEG", "TER"...), como no protótipo. O "EEE" do ptBR vem por extenso. */
const WEEKDAYS_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const availabilityCalendarFormatters = {
  formatWeekdayName: (d: Date) => WEEKDAYS_SHORT[d.getDay()],
};

// Marcas sob o número (after:), forma + cor para nunca depender só da cor (spec §2):
// disponível = ponto; indisponível = barrinha (protótipo .day[data-blocked]::after).
const markBase = "after:absolute after:left-1/2 after:-translate-x-1/2 after:rounded-full after:content-['']";
export const availableMark = `${markBase} after:bottom-[5px] after:h-[5px] after:w-[5px]`;
export const unavailableMark = `${markBase} after:bottom-[6px] after:h-[2.5px] after:w-2.5`;

/** Número do dia + estado lido por leitores de tela (as marcas visuais não têm texto). */
export function dayWithStatus(date: Date, statuses: string[]) {
  return (
    <>
      {date.getDate()}
      {statuses.length > 0 && <span className="sr-only">, {statuses.join(", ")}</span>}
    </>
  );
}

/** Legenda das marcas, em Footnote, conforme o modo da equipe. */
export function AvailabilityLegend({
  availabilityMode,
  children,
  className,
}: {
  availabilityMode: AvailabilityMode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-separator px-2 pt-3 text-footnote text-muted-foreground",
        className,
      )}
    >
      {availabilityMode !== "unavailable_only" && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[5px] w-[5px] rounded-full bg-ios-green" aria-hidden="true" /> Disponível
        </span>
      )}
      {availabilityMode !== "available_only" && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[2.5px] w-2.5 rounded-full bg-ios-red" aria-hidden="true" /> Indisponível
        </span>
      )}
      {children}
    </div>
  );
}

interface MyAvailabilityCalendarProps {
  teamMemberId: string | null;
  myInstruments: string[];
  availabilityMode?: AvailabilityMode;
}

/**
 * Interactive "Minha disponibilidade" calendar.
 * Clicking a day opens a confirmation dialog where the member marks themselves
 * available (choosing instruments) or unavailable (with a reason).
 * Self-contained: fetches its own data and invalidates the relevant caches on save.
 */
export function MyAvailabilityCalendar({
  teamMemberId,
  myInstruments,
  availabilityMode = DEFAULT_AVAILABILITY_MODE,
}: MyAvailabilityCalendarProps) {
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
      const status = (a.status ?? "available") as AvailabilityStatus;
      if (!isAvailabilityStatusAllowed(availabilityMode, status)) return;
      map[a.available_date] = {
        status,
        instruments: a.instruments ?? [],
        reason: a.reason ?? null,
      };
    });
    return map;
  }, [myAvailability, availabilityMode]);

  // Estados mutuamente exclusivos: cada dia recebe no máximo um fundo.
  const statusOf = (d: Date) => myMap[toDateStr(d)]?.status;
  const modifiers = {
    myAvailable: (d: Date) => statusOf(d) === "available" && !isToday(d),
    myUnavailable: (d: Date) => statusOf(d) === "unavailable" && !isToday(d),
    myAvailableToday: (d: Date) => statusOf(d) === "available" && isToday(d),
    myUnavailableToday: (d: Date) => statusOf(d) === "unavailable" && isToday(d),
    plainToday: (d: Date) => !statusOf(d) && isToday(d),
  };
  const modifiersClassNames = {
    myAvailable: `!bg-ios-green/15 !text-foreground font-semibold hover:!bg-ios-green/25 ${availableMark} after:bg-ios-green`,
    myUnavailable: `!bg-ios-red/15 !text-ios-red font-semibold hover:!bg-ios-red/25 ${unavailableMark} after:bg-ios-red`,
    myAvailableToday: `!bg-ios-green !text-white font-semibold hover:!bg-ios-green ${availableMark} after:bg-white`,
    myUnavailableToday: `!bg-ios-red !text-white font-semibold hover:!bg-ios-red ${unavailableMark} after:bg-white`,
    plainToday: "!bg-prominent !text-prominent-foreground font-semibold hover:!bg-prominent",
  };
  const formatters = {
    ...availabilityCalendarFormatters,
    formatDay: (d: Date) => {
      const status = statusOf(d);
      return dayWithStatus(d, status ? [status === "available" ? "disponível" : "indisponível"] : []);
    },
  };

  const handleSaved = () => {
    queryClient.invalidateQueries({ queryKey: ["my-availability", teamMemberId] });
    queryClient.invalidateQueries({ queryKey: ["team-availability"] });
  };

  return (
    <div>
      <Calendar
        mode="default"
        onDayClick={(day) => {
          setModalDate(day);
          setModalOpen(true);
        }}
        modifiers={modifiers}
        modifiersClassNames={modifiersClassNames}
        classNames={availabilityCalendarClassNames}
        formatters={formatters}
        locale={ptBR}
        className="w-full p-0"
      />
      <AvailabilityLegend availabilityMode={availabilityMode}>
        <span className="inline-flex items-center gap-1.5">
          <Hand className="h-[15px] w-[15px]" strokeWidth={2} aria-hidden="true" />
          {availabilityMode === "available_only"
            ? "Toque para confirmar"
            : availabilityMode === "unavailable_only"
              ? "Toque para bloquear"
              : "Toque em um dia para marcar"}
        </span>
      </AvailabilityLegend>

      <AvailabilityDayModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        date={modalDate}
        teamMemberId={teamMemberId}
        myInstruments={myInstruments}
        availabilityMode={availabilityMode}
        existing={modalDate ? myMap[toDateStr(modalDate)] ?? null : null}
        onSaved={handleSaved}
      />
    </div>
  );
}
