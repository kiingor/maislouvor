import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MyAvailabilityCalendar, availabilityCalendarClassNames } from "@/components/MyAvailabilityCalendar";
import { INSTRUMENT_ICONS } from "@/data/instruments";
import { CalendarCheck, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const toDateStr = (d: Date) => format(d, "yyyy-MM-dd");

const instrumentChip =
  "inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[11px] font-medium";

interface TeamMemberAvailability {
  id: string;
  name: string;
  avatar?: string;
  instruments: string[];
  reason: string | null;
}

/* ---------------- Equipe ---------------- */
function TeamPanel({
  selectedDate,
  onSelectDate,
  datesWithAvailability,
  available,
  unavailable,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date | undefined) => void;
  datesWithAvailability: Set<string>;
  available: TeamMemberAvailability[];
  unavailable: TeamMemberAvailability[];
}) {
  const modifiers = {
    hasAvailability: (d: Date) => datesWithAvailability.has(toDateStr(d)),
  };
  const modifiersClassNames = {
    hasAvailability: "font-semibold ring-1 ring-inset ring-primary/40",
  };

  return (
    <div className="space-y-4">
      <GlassCard className="p-3 sm:p-5">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelectDate}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          classNames={availabilityCalendarClassNames}
          locale={ptBR}
          className="w-full"
        />
      </GlassCard>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 capitalize">
          {format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </h2>

        {available.length === 0 && unavailable.length === 0 ? (
          <GlassCard className="p-8 text-center">
            <p className="text-muted-foreground text-sm">Ninguém marcou disponibilidade nesta data.</p>
          </GlassCard>
        ) : (
          <div className="space-y-4">
            {available.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-green-600 dark:text-green-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Disponíveis ({available.length})
                </p>
                {available.map((m) => (
                  <GlassCard key={m.id} variant="subtle" className="p-3 flex items-center gap-3">
                    <Avatar className="h-9 w-9">
                      {m.avatar && <AvatarImage src={m.avatar} />}
                      <AvatarFallback className="text-sm bg-accent">{m.name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{m.name}</span>
                      {m.instruments.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {m.instruments.map((inst) => {
                            const Icon = INSTRUMENT_ICONS[inst];
                            return (
                              <span key={inst} className={instrumentChip}>
                                {Icon && <Icon className="h-3 w-3" />}
                                {inst}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}

            {unavailable.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5" /> Indisponíveis ({unavailable.length})
                </p>
                {unavailable.map((m) => (
                  <GlassCard key={m.id} variant="subtle" className="p-3 flex items-center gap-3 opacity-80">
                    <Avatar className="h-9 w-9">
                      {m.avatar && <AvatarImage src={m.avatar} />}
                      <AvatarFallback className="text-sm bg-accent">{m.name[0]?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium">{m.name}</span>
                      {m.reason && <p className="text-xs text-muted-foreground italic mt-0.5 truncate">"{m.reason}"</p>}
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Disponibilidades() {
  const { currentTeam, profileId } = useTeam();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Current user's team membership (for instruments + marking)
  const { data: myMember } = useQuery({
    queryKey: ["my-team-member", profileId, currentTeam?.id],
    queryFn: async () => {
      if (!profileId || !currentTeam) return null;
      const { data } = await supabase
        .from("team_members")
        .select("id, instruments")
        .eq("profile_id", profileId)
        .eq("team_id", currentTeam.id)
        .maybeSingle();
      return data;
    },
    enabled: !!profileId && !!currentTeam,
  });
  const myMemberId = myMember?.id ?? null;
  const myInstruments: string[] = (myMember as any)?.instruments ?? [];

  // Whole-team availability
  const { data: allAvailability = [] } = useQuery({
    queryKey: ["team-availability", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data: members } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", currentTeam.id);
      if (!members || members.length === 0) return [];
      const memberIds = members.map((m) => m.id);
      const { data } = await supabase
        .from("member_availability")
        .select("available_date, status, instruments, reason, team_member_id, team_members(id, profiles(full_name, avatar_url))")
        .in("team_member_id", memberIds);
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  const datesWithAvailability = useMemo(() => {
    const set = new Set<string>();
    allAvailability.forEach((a: any) => {
      if ((a.status ?? "available") === "available") set.add(a.available_date);
    });
    return set;
  }, [allAvailability]);

  const { available, unavailable } = useMemo(() => {
    const selStr = toDateStr(selectedDate);
    const mapped = allAvailability
      .filter((a: any) => a.available_date === selStr)
      .map((a: any): TeamMemberAvailability & { status: string } => {
        const profile = (a.team_members as any)?.profiles as any;
        return {
          id: a.team_member_id,
          name: profile?.full_name ?? "Sem nome",
          avatar: profile?.avatar_url,
          instruments: a.instruments ?? [],
          reason: a.reason ?? null,
          status: a.status ?? "available",
        };
      });
    return {
      available: mapped.filter((m) => m.status === "available"),
      unavailable: mapped.filter((m) => m.status === "unavailable"),
    };
  }, [allAvailability, selectedDate]);

  return (
    <div className="animate-in-up max-w-5xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <CalendarCheck className="h-5 w-5" /> Disponibilidades
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Marque os dias em que você pode servir e veja a disponibilidade da equipe.
        </p>
      </div>

      {/* Mobile: tabs — one view at a time */}
      <div className="lg:hidden">
        <Tabs defaultValue="mine">
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="mine">Minha disponibilidade</TabsTrigger>
            <TabsTrigger value="team">Equipe</TabsTrigger>
          </TabsList>
          <TabsContent value="mine">
            <GlassCard className="p-3 sm:p-5">
              <MyAvailabilityCalendar teamMemberId={myMemberId} myInstruments={myInstruments} />
            </GlassCard>
          </TabsContent>
          <TabsContent value="team">
            <TeamPanel
              selectedDate={selectedDate}
              onSelectDate={(d) => d && setSelectedDate(d)}
              datesWithAvailability={datesWithAvailability}
              available={available}
              unavailable={unavailable}
            />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: both side by side */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Minha disponibilidade
          </h2>
          <GlassCard className="p-5">
            <MyAvailabilityCalendar teamMemberId={myMemberId} myInstruments={myInstruments} />
          </GlassCard>
        </section>
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Equipe</h2>
          <TeamPanel
            selectedDate={selectedDate}
            onSelectDate={(d) => d && setSelectedDate(d)}
            datesWithAvailability={datesWithAvailability}
            available={available}
            unavailable={unavailable}
          />
        </section>
      </div>
    </div>
  );
}
