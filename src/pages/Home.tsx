import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Music, Church, CalendarCheck, ChevronRight, Guitar, CheckCircle2, XCircle, Clock, Users, Plus, Mail, Play, Eye } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { instrumentIcon } from "@/data/instruments";
import { CreateTeamModal } from "@/components/CreateTeamModal";
import { NoTeamOnboarding } from "@/components/NoTeamOnboarding";
import { HomeAlerts, HomeAlertLineup } from "@/components/HomeAlerts";
import { HomeWeekAvailability } from "@/components/HomeWeekAvailability";
import { HomeTeamFeed } from "@/components/HomeTeamFeed";
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

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "Pendente", icon: Clock, className: "text-yellow-500 bg-yellow-500/10 border-yellow-500/30" },
  accepted: { label: "Aceito", icon: CheckCircle2, className: "text-green-500 bg-green-500/10 border-green-500/30" },
  declined: { label: "Recusado", icon: XCircle, className: "text-red-500 bg-red-500/10 border-red-500/30" },
};

export default function Home() {
  const navigate = useNavigate();
  const { currentTeam, userRole, profileId, loading: teamLoading } = useTeam();
  const { toast } = useToast();

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
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const availabilityMode = currentTeam?.availability_mode ?? DEFAULT_AVAILABILITY_MODE;

  const fetchAll = async () => {
    if (!profileId || !currentTeam) return;
    setLoading(true);
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

  if (teamLoading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  // User belongs to no team yet — onboarding: entrar por código ou criar equipe
  if (!currentTeam) {
    return <NoTeamOnboarding />;
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

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

  const myInstruments: string[] = member?.instruments ?? [];

  return (
    <div className="max-w-6xl mx-auto animate-in-up">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-4">
      {/* Profile Card */}
      <GlassCard className="p-5">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-border">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={profile?.full_name} />
            ) : null}
            <AvatarFallback className="text-lg font-semibold bg-accent text-accent-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{profile?.full_name ?? "Usuário"}</h1>
            <p className="text-sm text-muted-foreground">
              {roleLabels[userRole ?? "viewer"]} · {currentTeam?.name}
            </p>
            {member?.instruments && member.instruments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {member.instruments.map((inst: string) => {
                  const Icon = instrumentIcon(inst);
                  return (
                    <Badge key={inst} variant="secondary" className="text-xs gap-1">
                      <Icon className="h-3 w-3" />
                      {inst}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Smart alerts: confirm-soon + availability conflicts */}
      <HomeAlerts
        lineups={alertLineups}
        availabilityByDate={myAvailabilityByDate}
        availabilityMode={availabilityMode}
        onConfirm={confirmLineup}
      />

      {/* Quick availability for the next 7 days */}
      <HomeWeekAvailability
        teamMemberId={memberId}
        myInstruments={myInstruments}
        availabilityMode={availabilityMode}
        onChanged={fetchAll}
      />

      {/* Pending Lineups (accept/decline) */}
      {pendingLineups.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-2 px-1 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Escalas Pendentes
          </h2>
          <div className="space-y-2">
            {pendingLineups.map((lineup: any) => {
              const culto = lineup.cultos as any;
              return (
                <GlassCard key={lineup.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
                      <Church className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{culto.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {format(new Date(culto.date + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })} · {lineup.instrument}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl gap-1.5"
                      onClick={() => updateLineupStatus(lineup.id, "accepted")}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Aceitar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-xl gap-1.5"
                      onClick={() => updateLineupStatus(lineup.id, "declined")}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Recusar
                    </Button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming Lineups */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-2 px-1">Minhas Escalas</h2>
        {upcomingLineups.length === 0 ? (
          <GlassCard variant="subtle" className="p-4 text-center text-sm text-muted-foreground">
            Nenhuma escala próxima
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {upcomingLineups.map((lineup: any) => {
              const culto = lineup.cultos as any;
              const sc = statusConfig[lineup.status] || statusConfig.pending;
              const StatusIcon = sc.icon;
              return (
                <GlassCard
                  key={lineup.id}
                  className="p-4 flex items-center gap-3 cursor-pointer hover-lift"
                  onClick={() => navigate(`/app/cultos/${culto.id}`)}
                >
                  <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                    <Church className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{culto.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {format(new Date(culto.date + "T12:00:00"), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {lineup.instrument}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] shrink-0 gap-1 border ${sc.className}`}>
                    <StatusIcon className="h-3 w-3" />
                    {sc.label}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>
      </div>{/* end left column */}

      {/* Right column - Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
        <GlassCard
          variant="subtle"
          className="p-4 cursor-pointer hover-lift"
          onClick={() => navigate("/app/disponibilidades")}
        >
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {availabilityMode === "unavailable_only" ? "Indisponibilidade" : "Disponibilidade"}
            </span>
          </div>
          <p className="text-2xl font-semibold">{availabilityCount}</p>
          <p className="text-xs text-muted-foreground">
            {availabilityMode === "unavailable_only" ? "dias bloqueados no mês" : "dias este mês"}
          </p>
        </GlassCard>

        <GlassCard variant="subtle" className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Music className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Músicas</span>
          </div>
          <p className="text-2xl font-semibold">{songCount}</p>
          <p className="text-xs text-muted-foreground">no repertório</p>
        </GlassCard>

        <GlassCard variant="subtle" className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Cultos</span>
          </div>
          <p className="text-2xl font-semibold">{cultoCount}</p>
          <p className="text-xs text-muted-foreground">do time</p>
        </GlassCard>

        <GlassCard variant="subtle" className="p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-2 mb-1">
            <Church className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Próximo Culto</span>
          </div>
          {nextTeamCulto ? (
            <>
              <p className="text-sm font-medium truncate">{nextTeamCulto.name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {format(new Date(nextTeamCulto.date + "T12:00:00"), "EEEE, dd/MM", { locale: ptBR })}
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl gap-1.5 h-8"
                  onClick={() => navigate(`/app/cultos/${nextTeamCulto.id}`)}
                >
                  <Eye className="h-3.5 w-3.5" /> Ver culto
                </Button>
                {nextCultoHasSongs && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl gap-1.5 h-8"
                    onClick={() => navigate(`/app/cultos/${nextTeamCulto.id}/present`)}
                  >
                    <Play className="h-3.5 w-3.5" /> Ensaiar
                  </Button>
                )}
                {nextCultoLineup?.status === "pending" && (
                  <Button
                    size="sm"
                    className="rounded-xl gap-1.5 h-8"
                    onClick={() => confirmLineup(nextCultoLineup.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum</p>
          )}
        </GlassCard>

        {/* Team activity feed */}
        <div className="col-span-2 lg:col-span-1">
          <HomeTeamFeed teamId={currentTeam.id} />
        </div>
      </div>{/* end right column */}
      </div>{/* end grid */}
    </div>
  );
}
