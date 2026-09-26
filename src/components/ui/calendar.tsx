import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Calendário iOS: mês em headline, dias da semana em caption2 maiúsculo,
 * dias em círculos de 44pt; hoje = texto tintado em negrito; selecionado = círculo proeminente.
 */
const navButton = buttonVariants({ variant: "ghost", size: "icon" });

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-2", className)}
      classNames={{
        months: "flex flex-col gap-4 sm:flex-row",
        month: "space-y-2",
        caption: "relative flex h-11 items-center justify-center",
        caption_label: "text-headline capitalize",
        nav: "flex items-center",
        // O DayPicker junta nav_button + nav_button_* sem tailwind-merge: a posição fica
        // só nas classes específicas, já resolvidas com cn (absolute vence o relative do botão).
        nav_button: "disabled:opacity-30",
        nav_button_previous: cn(navButton, "absolute left-0 top-1/2 -translate-y-1/2"),
        nav_button_next: cn(navButton, "absolute right-0 top-1/2 -translate-y-1/2"),
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "w-11 pb-1 text-caption2 font-semibold uppercase text-muted-foreground",
        row: "mt-0.5 flex w-full",
        cell: cn(
          "relative h-11 w-11 p-0 text-center focus-within:relative focus-within:z-20",
          "[&:has([aria-selected].day-range-middle)]:bg-fill-tertiary",
          "[&:has([aria-selected].day-range-start)]:rounded-l-full [&:has([aria-selected].day-range-end)]:rounded-r-full",
          "[&:has([aria-selected].day-range-start)]:bg-fill-tertiary [&:has([aria-selected].day-range-end)]:bg-fill-tertiary",
          "[&:has([aria-selected].day-range-start.day-range-end)]:bg-transparent",
        ),
        day: cn(
          "inline-flex h-11 w-11 items-center justify-center rounded-full p-0 text-title3 font-normal tabular-nums text-foreground",
          "transition-colors duration-150 hover:bg-fill-tertiary active:bg-fill-secondary aria-selected:opacity-100",
          "[-webkit-tap-highlight-color:transparent]",
        ),
        day_range_start: "day-range-start",
        day_range_end: "day-range-end",
        day_selected:
          "bg-prominent font-semibold text-prominent-foreground hover:bg-prominent hover:text-prominent-foreground focus:bg-prominent focus:text-prominent-foreground",
        day_today: "font-semibold text-primary aria-selected:text-prominent-foreground",
        day_outside:
          "day-outside text-label-tertiary aria-selected:bg-fill-tertiary aria-selected:text-muted-foreground",
        day_disabled: "text-label-tertiary hover:bg-transparent",
        day_range_middle: "aria-selected:bg-transparent aria-selected:font-normal aria-selected:text-foreground",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ..._props }) => <ChevronLeft className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />,
        IconRight: ({ ..._props }) => <ChevronRight className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
