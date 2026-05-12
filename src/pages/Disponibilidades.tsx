import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Disponibilidades() {
  const { currentTeam } = useTeam();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  // Fetch all availability for the team
  const { data: allAvailability = [] } = useQuery({
    queryKey: ["team-availability", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      // Get team member ids
      const { data: members } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", currentTeam.id);
      if (!members || members.length === 0) return [];
      const memberIds = members.map((m) => m.id);
      const { data } = await supabase
        .from("member_availability")
        .select("available_date, team_member_id, team_members(id, profiles(full_name, avatar_url))")
        .in("team_member_id", memberIds);
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  // Build a set of dates that have availability
  const datesWithAvailability = new Set<string>();
  allAvailability.forEach((a: any) => {
    datesWithAvailability.add(a.available_date);
  });

  // Get members available for the selected date
  const selectedDateStr = selectedDate?.toISOString().split("T")[0];
  const availableMembers = selectedDateStr
    ? allAvailability
        .filter((a: any) => a.available_date === selectedDateStr)
        .map((a: any) => {
          const profile = (a.team_members as any)?.profiles as any;
          return {
            id: a.team_member_id,
            name: profile?.full_name ?? "Sem nome",
            avatar: profile?.avatar_url,
          };
        })
    : [];

  // Custom day rendering to highlight days with availability
  const modifiers = {
    hasAvailability: (date: Date) => {
      const ds = date.toISOString().split("T")[0];
      return datesWithAvailability.has(ds);
    },
  };

  const modifiersClassNames = {
    hasAvailability: "!bg-primary/20 !text-primary font-semibold",
  };

  return (
    <div className="animate-in-up">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" /> Disponibilidades
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Visualize a disponibilidade dos membros da equipe.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <GlassCard className="p-4 w-fit">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            locale={ptBR}
            className={cn("p-3 pointer-events-auto")}
          />
        </GlassCard>

        <div>
          {selectedDate ? (
            <div>
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
                Disponíveis em{" "}
                {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
              </h2>
              {availableMembers.length === 0 ? (
                <GlassCard className="p-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    Nenhum membro disponível nesta data.
                  </p>
                </GlassCard>
              ) : (
                <div className="space-y-2">
                  {availableMembers.map((m) => (
                    <GlassCard key={m.id} variant="subtle" className="p-3 flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {m.avatar && <AvatarImage src={m.avatar} />}
                        <AvatarFallback className="text-sm bg-accent">
                          {m.name[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{m.name}</span>
                    </GlassCard>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <GlassCard className="p-8 text-center">
              <p className="text-muted-foreground text-sm">
                Selecione uma data no calendário para ver os membros disponíveis.
              </p>
            </GlassCard>
          )}
        </div>
      </div>
    </div>
  );
}
