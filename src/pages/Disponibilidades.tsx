import { useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { DESKTOP_QUERY, useMediaQuery } from "@/contexts/ShellContext";
import { PageHeader } from "@/components/shell/PageHeader";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AvailabilityLegend,
  MyAvailabilityCalendar,
  availabilityCalendarClassNames,
  availabilityCalendarFormatters,
  availableMark,
  dayWithStatus,
  unavailableMark,
} from "@/components/MyAvailabilityCalendar";
import { instrumentIcon } from "@/data/instruments";
import { CalendarDays, CheckCircle2, XCircle } from "lucide-react";
import { format, isSameDay, isToday } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  DEFAULT_AVAILABILITY_MODE,
  availabilityPageDescription,
  isAvailabilityStatusAllowed,
  personalAvailabilityLabel,
  type AvailabilityMode,
  type AvailabilityStatus,
} from "@/lib/availability";

const toDateStr = (d: Date) => format(d, "yyyy-MM-dd");
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Chip de instrumento (protótipo .chip): preenchimento terciário, Footnote, símbolo secundário.
const instrumentChip =
  "inline-flex items-center gap-1 rounded-full bg-fill-tertiary px-2 py-0.5 text-footnote font-medium text-foreground";

// Marcas sob o número (como no Calendário do iOS): ponto = há disponíveis, barrinha = há indisponíveis.
// Sem fundo: a seleção é o círculo. Com os dois, ponto (after) e barrinha (before) lado a lado.
const bothMarks =
  "after:absolute after:bottom-[5px] after:left-[calc(50%-8.5px)] after:h-[5px] after:w-[5px] after:rounded-full after:bg-ios-green after:content-[''] " +
  "before:absolute before:bottom-[6px] before:left-[calc(50%-1.5px)] before:h-[2.5px] before:w-2.5 before:rounded-full before:bg-ios-red before:content-['']";

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
  datesWithAvailable,
  datesWithUnavailable,
  availabilityMode,
  available,
  unavailable,
}: {
  selectedDate: Date;
  onSelectDate: (d: Date | undefined) => void;
  datesWithAvailable: Set<string>;
  datesWithUnavailable: Set<string>;
  availabilityMode: AvailabilityMode;
  available: TeamMemberAvailability[];
  unavailable: TeamMemberAvailability[];
}) {
  // Hoje em negrito; dia escolhido (inclusive hoje) em círculo proeminente, como na aba Minha.
  // Vermelho fica só para status (indisponível); as marcas mantêm a cor sobre o círculo grafite. Estados exclusivos para nunca haver duas cores no mesmo dia.
  const isSelected = (d: Date) => isSameDay(d, selectedDate);
  const modifiers = {
    todayMark: (d: Date) => isToday(d) && !isSelected(d),
    pickedDay: (d: Date) => isSelected(d) && !isToday(d),
    pickedToday: (d: Date) => isSelected(d) && isToday(d),
    hasAvailable: (d: Date) => {
      const key = toDateStr(d);
      return datesWithAvailable.has(key) && !datesWithUnavailable.has(key);
    },
    hasUnavailable: (d: Date) => {
      const key = toDateStr(d);
      return datesWithUnavailable.has(key) && !datesWithAvailable.has(key);
    },
    hasBoth: (d: Date) => {
      const key = toDateStr(d);
      return datesWithAvailable.has(key) && datesWithUnavailable.has(key);
    },
  };
  const modifiersClassNames = {
    todayMark: "font-semibold",
    pickedDay: "!bg-prominent !text-prominent-foreground font-semibold hover:!bg-prominent",
    pickedToday: "!bg-prominent !text-prominent-foreground font-semibold hover:!bg-prominent",
    hasAvailable: `${availableMark} after:bg-ios-green`,
    hasUnavailable: `${unavailableMark} after:bg-ios-red`,
    hasBoth: bothMarks,
  };
  // Estado do dia também para leitores de tela (as marcas são só visuais).
  const formatters = {
    ...availabilityCalendarFormatters,
    formatDay: (d: Date) => {
      const key = toDateStr(d);
      const statuses: string[] = [];
      if (datesWithAvailable.has(key)) statuses.push("com disponíveis");
      if (datesWithUnavailable.has(key)) statuses.push("com indisponíveis");
      return dayWithStatus(d, statuses);
    },
  };

  const empty = available.length === 0 && unavailable.length === 0;

  return (
    <div>
      <div className="rounded-card bg-card p-2 sm:p-3">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={onSelectDate}
          modifiers={modifiers}
          modifiersClassNames={modifiersClassNames}
          classNames={availabilityCalendarClassNames}
          formatters={formatters}
          locale={ptBR}
          className="w-full p-0"
        />
        <AvailabilityLegend availabilityMode={availabilityMode} />
      </div>

      <section className="mt-7" aria-labelledby="team-day-title">
        <h2 id="team-day-title" className="mx-1 mb-2 text-title3 text-foreground">
          {sentenceCase(format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR }))}
        </h2>

        {empty ? (
          <div className="flex items-center gap-3 rounded-card bg-card p-4">
            <CalendarDays className="h-7 w-7 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
            <p className="text-body text-muted-foreground">
              {availabilityMode === "available_only"
                ? "Ninguém confirmou disponibilidade nesta data."
                : availabilityMode === "unavailable_only"
                  ? "Ninguém registrou indisponibilidade nesta data."
                  : "Ninguém respondeu sobre esta data."}
            </p>
          </div>
        ) : (
          <div className="space-y-[22px]">
            {availabilityMode !== "unavailable_only" && available.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-4 text-footnote text-muted-foreground">
                  <CheckCircle2 className="h-[15px] w-[15px] text-ios-green" strokeWidth={2.25} aria-hidden="true" />
                  Disponíveis ({available.length})
                </p>
                <MemberList>
                  {available.map((m) => (
                    <MemberRow key={m.id} member={m}>
                      {m.instruments.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.instruments.map((inst) => {
                            const Icon = instrumentIcon(inst);
                            return (
                              <span key={inst} className={instrumentChip}>
                                {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />}
                                {inst}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </MemberRow>
                  ))}
                </MemberList>
              </div>
            )}

            {availabilityMode !== "available_only" && unavailable.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 px-4 text-footnote text-muted-foreground">
                  <XCircle className="h-[15px] w-[15px] text-ios-red" strokeWidth={2.25} aria-hidden="true" />
                  Indisponíveis ({unavailable.length})
                </p>
                <MemberList>
                  {unavailable.map((m) => (
                    <MemberRow key={m.id} member={m}>
                      {m.reason && <p className="mt-0.5 text-subhead text-muted-foreground break-words">{m.reason}</p>}
                    </MemberRow>
                  ))}
                </MemberList>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Lista agrupada (inset grouped) com separador recuado até o texto. */
function MemberList({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-card bg-card">{children}</div>;
}

function MemberRow({ member, children }: { member: TeamMemberAvailability; children?: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[52px] items-center gap-3 px-4 py-2.5 [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:left-[64px] [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:border-t [&:not(:first-child)]:before:border-separator [&:not(:first-child)]:before:content-['']">
      <Avatar className="h-9 w-9 shrink-0">
        {member.avatar && <AvatarImage src={member.avatar} alt="" />}
        <AvatarFallback className="bg-fill-secondary text-subhead font-semibold text-muted-foreground">
          {member.name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-body text-foreground truncate">{member.name}</p>
        {children}
      </div>
    </div>
  );
}

export default function Disponibilidades() {
  // Voltar pelo histórico quando houver (tela aberta pelo menu ≡); senão, Início.
  const backTarget: string | true = useLocation().key !== "default" ? true : "/app/home";
  const { currentTeam, profileId } = useTeam();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const availabilityMode = currentTeam?.availability_mode ?? DEFAULT_AVAILABILITY_MODE;

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

  const { datesWithAvailable, datesWithUnavailable } = useMemo(() => {
    const availableDates = new Set<string>();
    const unavailableDates = new Set<string>();
    allAvailability.forEach((a: any) => {
      const status = (a.status ?? "available") as AvailabilityStatus;
      if (!isAvailabilityStatusAllowed(availabilityMode, status)) return;
      if (status === "available") availableDates.add(a.available_date);
      if (status === "unavailable") unavailableDates.add(a.available_date);
    });
    return { datesWithAvailable: availableDates, datesWithUnavailable: unavailableDates };
  }, [allAvailability, availabilityMode]);

  const { available, unavailable } = useMemo(() => {
    const selStr = toDateStr(selectedDate);
    const mapped = allAvailability
      .filter((a: any) => a.available_date === selStr)
      .filter((a: any) =>
        isAvailabilityStatusAllowed(
          availabilityMode,
          (a.status ?? "available") as AvailabilityStatus,
        ),
      )
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
  }, [allAvailability, selectedDate, availabilityMode]);

  const myCalendar = (
    <div className="rounded-card bg-card p-2 sm:p-3">
      <MyAvailabilityCalendar
        teamMemberId={myMemberId}
        myInstruments={myInstruments}
        availabilityMode={availabilityMode}
      />
    </div>
  );

  const teamPanel = (
    <TeamPanel
      selectedDate={selectedDate}
      onSelectDate={(d) => d && setSelectedDate(d)}
      datesWithAvailable={datesWithAvailable}
      datesWithUnavailable={datesWithUnavailable}
      availabilityMode={availabilityMode}
      available={available}
      unavailable={unavailable}
    />
  );

  const header = (children?: React.ReactNode) => (
    <PageHeader title="Disponibilidades" subtitle={availabilityPageDescription(availabilityMode)} back={backTarget}>
      {children}
    </PageHeader>
  );

  // Desktop: as duas colunas lado a lado. Celular: controle segmentado, uma vista por vez.
  // Só uma árvore é montada (antes as duas existiam ao mesmo tempo, com dois calendários e dois modais).
  if (isDesktop) {
    return (
      <div className="max-w-5xl">
        {header()}
        <div className="grid grid-cols-2 items-start gap-8">
          <section aria-labelledby="mine-title">
            <h2 id="mine-title" className="mx-1 mb-2 text-title3 text-foreground">
              {personalAvailabilityLabel(availabilityMode)}
            </h2>
            {myCalendar}
          </section>
          <section aria-labelledby="team-title">
            <h2 id="team-title" className="mx-1 mb-2 text-title3 text-foreground">Equipe</h2>
            {teamPanel}
          </section>
        </div>
      </div>
    );
  }

  return (
    <Tabs defaultValue="mine">
      {header(
        // Larguras proporcionais ao rótulo (UISegmentedControl.apportionsSegmentWidthsByContent):
        // "Minha indisponibilidade" cabe inteiro até 320pt; ainda trunca com reticências se preciso.
        <TabsList className="grid w-full grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <TabsTrigger value="mine" className="min-w-0 px-2">
            <span className="min-w-0 truncate">{personalAvailabilityLabel(availabilityMode)}</span>
          </TabsTrigger>
          <TabsTrigger value="team">Equipe</TabsTrigger>
        </TabsList>,
      )}
      <TabsContent value="mine" className="mt-0">
        {myCalendar}
      </TabsContent>
      <TabsContent value="team" className="mt-0">
        {teamPanel}
      </TabsContent>
    </Tabs>
  );
}
