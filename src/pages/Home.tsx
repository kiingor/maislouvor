import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { DESKTOP_QUERY, useMediaQuery } from "@/contexts/ShellContext";
import { PageHeader } from "@/components/shell/PageHeader";
import { NotificationBell } from "@/components/NotificationBell";
import { TeamSwitcher } from "@/components/TeamSwitcher";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  CalendarCheck,
  CalendarMinus,
  Music,
  Church,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Play,
  ShieldCheck,
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { instrumentIcon } from "@/data/instruments";
import { NoTeamOnboarding } from "@/components/NoTeamOnboarding";
import { HomeAlerts, HomeAlertLineup, getHomeAlerts } from "@/components/HomeAlerts";
import { HomeWeekAvailability } from "@/components/HomeWeekAvailability";
import { HomeTeamFeed } from "@/components/HomeTeamFeed";
import { StatTile } from "@/components/UserStatsCard";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AVAILABILITY_MODE,
  activeAvailabilityStatus,
  type AvailabilityStatus,
} from "@/lib/availability";

const roleLabels: Record<string, string> = {
  admin: "Líder",
  editor: "Editor",
  viewer: "Membro",
};

// Status em cápsula (spec §5): fundo da cor a 15% e texto na cor.
const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "text-ios-orange bg-ios-orange/15" },
  accepted: { label: "Aceito", className: "text-ios-green bg-ios-green/15" },
  declined: { label: "Recusado", className: "text-ios-red bg-ios-red/15" },
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fmtLong = (d: string) => cap(format(new Date(d + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR }));

/** Linha de lista agrupada (spec §5). */
const rowClass = "relative flex w-full items-center gap-3 min-h-[52px] px-4 py-2.5 text-left";
const pressableRow = "transition-colors active:bg-grouped-tertiary [@media(hover:hover)]:hover:bg-fill-quaternary";

/** Separador hairline recuado até o texto (58px = margem 16 + ícone 30 + espaço 12). */
function Separator() {
  return <span aria-hidden="true" className="absolute top-0 left-[58px] right-0 border-t border-separator" />;
}

function RowIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid place-items-center h-[30px] w-[30px] shrink-0 rounded-[8px] bg-fill-tertiary text-muted-foreground [&_svg]:h-4 [&_svg]:w-4",
        className,
      )}
    >
      {children}
    </span>
  );
}

const Chevron = () => (
  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
);

export default function Home() {
  const navigate = useNavigate();
  const { currentTeam, userRole, profileId, loading: teamLoading, can } = useTeam();
  const { toast } = useToast();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  const [profile, setProfile] = useState<any>(null);
  const [member, setMember] = useState<any>(null);
  const [upcomingLineups, setUpcomingLineups] = useState<any[]>([]);
  const [availabilityCount, setAvailabilityCount] = useState(0);
  const [songCount, setSongCount] = useState(0);
  const [cultoCount, setCultoCount] = useState(0);
  const [nextTeamCulto, setNextTeamCulto] = useState<any>(null);
  const [nextCultoHasSongs, setNextCultoHasSongs] = useState(false);
  const [nextCultoLineup, setNextCultoLineup] = useState<any>(null);
  const [myAvailabilityByDate, setMyAvailabilityByDate] = useState<Record<string, AvailabilityStatus>>({});
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const availabilityMode = currentTeam?.availability_mode ?? DEFAULT_AVAILABILITY_MODE;

  /** `silent`: atualiza sem trocar a tela pelo esqueleto (ex.: depois de salvar um dia da semana),
   *  para não perder a rolagem nem o título recolhido. As consultas são as mesmas. */
  const fetchAll = async (opts?: { silent?: boolean }) => {
    if (!profileId || !currentTeam) return;
    if (!opts?.silent) setLoading(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

    const memberRes = await supabase.from("team_members").select("id").eq("profile_id", profileId).eq("team_id", currentTeam.id).single();
    const memberId = memberRes.data?.id ?? "";
    setMemberId(memberId || null);

    const [profileRes, memberFullRes, lineupRes, availRes, availDatesRes, songsRes, cultosRes, nextCultoRes] =
      await Promise.all([
        supabase.from("profiles").select("*").eq("id", profileId).single(),
        supabase.from("team_members").select("*").eq("profile_id", profileId).eq("team_id", currentTeam.id).single(),
        supabase
          .from("culto_lineup")
          .select("id, instrument, status, culto_id, team_member_id, cultos(id, name, date)")
          .eq("team_member_id", memberId)
          .order("created_at", { ascending: true }),
        supabase
          .from("member_availability")
          .select("id", { count: "exact", head: true })
          .eq("team_member_id", memberId)
          .eq("status", availabilityMode === "unavailable_only" ? "unavailable" : "available")
          .gte("available_date", monthStart)
          .lte("available_date", monthEnd),
        supabase
          .from("member_availability")
          .select("available_date, status")
          .eq("team_member_id", memberId)
          .gte("available_date", today),
        // Só músicas que estão em ALGUM repertório (não todas as cadastradas).
        supabase.from("songs").select("id, repertorio_songs!inner(song_id)", { count: "exact", head: true }).eq("team_id", currentTeam.id),
        supabase.from("cultos").select("id", { count: "exact", head: true }).eq("team_id", currentTeam.id),
        supabase.from("cultos").select("id, name, date").eq("team_id", currentTeam.id).gte("date", today).order("date", { ascending: true }).limit(1).maybeSingle(),
      ]);

    setProfile(profileRes.data);
    setMember(memberFullRes.data);

    const futureLineups = (lineupRes.data || []).filter((l: any) => {
      const cultoDate = (l.cultos as any)?.date;
      return cultoDate && cultoDate >= today;
    }).sort((a: any, b: any) => {
      const da = (a.cultos as any)?.date ?? "";
      const db = (b.cultos as any)?.date ?? "";
      return da.localeCompare(db);
    });
    setUpcomingLineups(futureLineups);

    const availabilityByDate: Record<string, AvailabilityStatus> = {};
    (availDatesRes.data || []).forEach((a: any) => {
      const status = activeAvailabilityStatus(
        availabilityMode,
        (a.status ?? "available") as AvailabilityStatus,
      );
      if (status) availabilityByDate[a.available_date] = status;
    });
    setMyAvailabilityByDate(availabilityByDate);

    setAvailabilityCount(availRes.count ?? 0);
    setSongCount(songsRes.count ?? 0);
    setCultoCount(cultosRes.count ?? 0);

    const nextCulto = nextCultoRes.data;
    setNextTeamCulto(nextCulto);

    if (nextCulto) {
      const [nextSongsRes, nextLineupRes] = await Promise.all([
        supabase.from("culto_songs").select("id", { count: "exact", head: true }).eq("culto_id", nextCulto.id),
        memberId
          ? supabase
              .from("culto_lineup")
              .select("id, status")
              .eq("culto_id", nextCulto.id)
              .eq("team_member_id", memberId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      setNextCultoHasSongs((nextSongsRes.count ?? 0) > 0);
      setNextCultoLineup((nextLineupRes as any).data ?? null);
    } else {
      setNextCultoHasSongs(false);
      setNextCultoLineup(null);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (teamLoading || !profileId || !currentTeam) return;
    fetchAll();
  }, [teamLoading, profileId, currentTeam]);

  const updateLineupStatus = async (lineupId: string, status: "accepted" | "declined") => {
    const { error } = await supabase
      .from("culto_lineup")
      .update({ status } as any)
      .eq("id", lineupId);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      toast({ title: status === "accepted" ? "Escala aceita!" : "Escala recusada" });
      setUpcomingLineups((prev) =>
        prev.map((l) => (l.id === lineupId ? { ...l, status } : l))
      );
      setNextCultoLineup((prev: any) =>
        prev && prev.id === lineupId ? { ...prev, status } : prev
      );
    }
  };

  const confirmLineup = (lineupId: string) => updateLineupStatus(lineupId, "accepted");

  // No celular, sino e equipe vão para a barra superior; no desktop já estão na barra lateral.
  const header = (
    <PageHeader
      title="Início"
      actions={
        isDesktop ? undefined : (
          <>
            <NotificationBell variant="toolbar" />
            <TeamSwitcher variant="toolbar" />
          </>
        )
      }
    />
  );

  const skeleton = (
    <div className="mx-auto w-full max-w-2xl">
      {header}
      <div className="space-y-[26px]" aria-busy="true">
        <Skeleton className="h-[150px] w-full rounded-card bg-card" />
        <Skeleton className="h-[128px] w-full rounded-card bg-card" />
        <Skeleton className="h-[72px] w-full rounded-card bg-card" />
      </div>
    </div>
  );

  if (teamLoading) return skeleton;

  // User belongs to no team yet — onboarding: entrar por código ou criar equipe
  if (!currentTeam) {
    return (
      <div className="mx-auto w-full max-w-2xl">
        {header}
        <NoTeamOnboarding />
      </div>
    );
  }

  if (loading) return skeleton;

  const initials = profile?.full_name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() ?? "?";

  const avatarUrl = profile?.avatar_url || null;
  const pendingLineups = upcomingLineups.filter((l) => l.status === "pending");

  const alertLineups: HomeAlertLineup[] = upcomingLineups.map((l) => ({
    id: l.id,
    status: l.status,
    instrument: l.instrument,
    culto: (l.cultos as any)
      ? { id: (l.cultos as any).id, name: (l.cultos as any).name, date: (l.cultos as any).date }
      : null,
  }));
  const { hasAlerts } = getHomeAlerts(alertLineups, myAvailabilityByDate, availabilityMode);

  const myInstruments: string[] = member?.instruments ?? [];
  const displayName = profile?.full_name ?? "Usuário";
  const blockedMode = availabilityMode === "unavailable_only";
  const canSeeSongs = can("repertorios", "ver");
  const canSeeCultos = can("cultos", "ver");

  return (
    <div className="mx-auto w-full max-w-2xl xl:max-w-none">
      {header}

      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] xl:gap-x-8 xl:items-start">
        {/* Coluna principal */}
        <div className="space-y-[26px]">
          {/* Perfil */}
          <section className="rounded-card bg-card p-4" aria-label={`Perfil de ${displayName}`}>
            <div className="flex items-center gap-3.5">
              <Avatar className="h-[60px] w-[60px]">
                {avatarUrl ? <AvatarImage src={avatarUrl} alt={profile?.full_name} /> : null}
                <AvatarFallback className="bg-fill-tertiary text-title3 text-muted-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h2 className="text-title3 text-foreground truncate">{displayName}</h2>
                <p className="text-subhead text-muted-foreground truncate">
                  {roleLabels[userRole ?? "viewer"]} · {currentTeam?.name}
                </p>
              </div>
            </div>
            {myInstruments.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 mt-3.5" aria-label="Instrumentos">
                {myInstruments.map((inst: string) => {
                  const Icon = instrumentIcon(inst);
                  return (
                    <li
                      key={inst}
                      className="inline-flex items-center gap-[5px] rounded-full bg-fill-tertiary py-1 pl-2 pr-2.5 text-footnote font-medium text-foreground"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
                      {inst}
                    </li>
                  );
                })}
              </ul>
            )}
            {!hasAlerts && (
              <p className="flex items-center gap-2 mt-3.5 pt-3 border-t border-separator text-footnote text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0 text-ios-green" strokeWidth={2.25} aria-hidden="true" />
                <span>
                  <strong className="font-semibold text-foreground">Tudo certo</strong> — sem pendências ou conflitos.
                </span>
              </p>
            )}
          </section>

          {/* Alertas inteligentes: confirmar em breve + conflitos de disponibilidade (some sem alertas) */}
          <HomeAlerts
            lineups={alertLineups}
            availabilityByDate={myAvailabilityByDate}
            availabilityMode={availabilityMode}
            onConfirm={confirmLineup}
          />

          {/* Disponibilidade rápida dos próximos 7 dias */}
          <HomeWeekAvailability
            teamMemberId={memberId}
            myInstruments={myInstruments}
            availabilityMode={availabilityMode}
            onChanged={() => fetchAll({ silent: true })}
          />

          {/* Escalas pendentes (aceitar/recusar) */}
          {pendingLineups.length > 0 && (
            <section aria-labelledby="home-pending-title">
              <h2 id="home-pending-title" className="text-title3 text-foreground mx-1 mb-2">
                Escalas pendentes
              </h2>
              <div className="rounded-card bg-card overflow-hidden">
                {pendingLineups.map((lineup: any, i: number) => {
                  const culto = lineup.cultos as any;
                  return (
                    <div key={lineup.id} className="relative px-4 py-3">
                      {i > 0 && <Separator />}
                      <div className="flex items-center gap-3">
                        <RowIcon className="bg-ios-orange/15 text-ios-orange">
                          <Church strokeWidth={2.25} />
                        </RowIcon>
                        <div className="flex-1 min-w-0">
                          <p className="text-body text-foreground truncate">{culto.name}</p>
                          <p className="text-footnote text-muted-foreground">
                            {fmtLong(culto.date)} · {lineup.instrument}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2.5 ml-[42px]">
                        <Button
                          size="sm" className="flex-1"
                          onClick={() => updateLineupStatus(lineup.id, "accepted")}
                        >
                          <CheckCircle2 strokeWidth={2.25} aria-hidden="true" /> Aceitar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm" className="flex-1"
                          onClick={() => updateLineupStatus(lineup.id, "declined")}
                        >
                          <XCircle strokeWidth={2.25} aria-hidden="true" /> Recusar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Minhas escalas */}
          <section aria-labelledby="home-lineups-title">
            <h2 id="home-lineups-title" className="text-title3 text-foreground mx-1 mb-2">
              Minhas escalas
            </h2>
            {upcomingLineups.length === 0 ? (
              <div className="rounded-card bg-card flex items-center gap-3 px-4 py-3.5">
                <CalendarDays className="h-7 w-7 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
                <p className="text-body text-muted-foreground">Nenhuma escala próxima</p>
              </div>
            ) : (
              <ul className="rounded-card bg-card overflow-hidden">
                {upcomingLineups.map((lineup: any, i: number) => {
                  const culto = lineup.cultos as any;
                  const sc = statusConfig[lineup.status] || statusConfig.pending;
                  return (
                    <li key={lineup.id}>
                      <button
                        type="button"
                        className={cn(rowClass, pressableRow)}
                        onClick={() => navigate(`/app/cultos/${culto.id}`)}
                      >
                        {i > 0 && <Separator />}
                        <RowIcon>
                          <Church strokeWidth={2.25} />
                        </RowIcon>
                        <span className="flex-1 min-w-0">
                          <span className="block text-body text-foreground truncate">{culto.name}</span>
                          <span className="block text-footnote text-muted-foreground">
                            {fmtLong(culto.date)} · {lineup.instrument}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-caption1 font-semibold",
                            sc.className,
                          )}
                        >
                          {sc.label}
                        </span>
                        <Chevron />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Coluna de resumo (ao lado no desktop largo) */}
        <div className="mt-[26px] xl:mt-0">
          {/* Resumo no estilo das listas inteligentes do Lembretes */}
          <div className="grid grid-cols-2 gap-2.5" aria-label="Resumo da equipe" role="group">
            <StatTile
              icon={blockedMode ? <CalendarMinus strokeWidth={2} /> : <CalendarCheck strokeWidth={2} />}
              value={availabilityCount}
              label={blockedMode ? "Indisponibilidade" : "Disponibilidade"}
              caption={
                blockedMode
                  ? availabilityCount === 1
                    ? "dia bloqueado no mês"
                    : "dias bloqueados no mês"
                  : availabilityCount === 1
                    ? "dia este mês"
                    : "dias este mês"
              }
              onClick={() => navigate("/app/disponibilidades")}
            />
            <StatTile
              icon={<Music strokeWidth={2} />}
              value={songCount}
              label="Músicas"
              caption="no repertório"
              onClick={canSeeSongs ? () => navigate("/app/repertorios") : undefined}
            />
            <StatTile
              wide
              icon={<CalendarDays strokeWidth={2} />}
              value={cultoCount}
              label="Cultos"
              caption="do time"
              onClick={canSeeCultos ? () => navigate("/app/cultos") : undefined}
            />
          </div>

          {/* Próximo culto */}
          <section className="rounded-card bg-card overflow-hidden mt-2.5" aria-labelledby="home-next-title">
            {nextTeamCulto ? (
              <>
                <button
                  type="button"
                  className={cn(rowClass, pressableRow)}
                  onClick={() => navigate(`/app/cultos/${nextTeamCulto.id}`)}
                >
                  <RowIcon>
                    <Church strokeWidth={2.25} />
                  </RowIcon>
                  <span className="flex-1 min-w-0">
                    <span id="home-next-title" className="block text-footnote text-muted-foreground">
                      Próximo culto
                    </span>
                    <span className="block text-body text-foreground truncate">{nextTeamCulto.name}</span>
                    <span className="block text-subhead text-muted-foreground">
                      {cap(format(new Date(nextTeamCulto.date + "T12:00:00"), "EEEE, dd/MM", { locale: ptBR }))}
                    </span>
                  </span>
                  <span className="sr-only">Ver culto</span>
                  <Chevron />
                </button>
                {(nextCultoHasSongs || nextCultoLineup?.status === "pending") && (
                  <div className="flex flex-wrap gap-2 px-4 pb-3 pl-[58px]">
                    {nextCultoHasSongs && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => navigate(`/app/cultos/${nextTeamCulto.id}/present`)}
                      >
                        <Play strokeWidth={2.25} aria-hidden="true" /> Ensaiar
                      </Button>
                    )}
                    {nextCultoLineup?.status === "pending" && (
                      <Button size="sm" onClick={() => confirmLineup(nextCultoLineup.id)}>
                        <CheckCircle2 strokeWidth={2.25} aria-hidden="true" /> Confirmar
                      </Button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className={rowClass}>
                <RowIcon>
                  <Church strokeWidth={2.25} />
                </RowIcon>
                <div className="flex-1 min-w-0">
                  <h2 id="home-next-title" className="text-footnote text-muted-foreground">
                    Próximo culto
                  </h2>
                  <p className="text-body text-foreground">Nenhum</p>
                </div>
              </div>
            )}
          </section>

          {/* Atividade da equipe */}
          <div className="mt-[26px]">
            <HomeTeamFeed teamId={currentTeam.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
