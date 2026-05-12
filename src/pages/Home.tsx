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
import { CalendarDays, Music, Church, CalendarCheck, ChevronRight, Guitar, CheckCircle2, XCircle, Clock } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!profileId || !currentTeam) return;
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

    const memberRes = await supabase.from("team_members").select("id").eq("profile_id", profileId).eq("team_id", currentTeam.id).single();
    const memberId = memberRes.data?.id ?? "";

    const [profileRes, memberFullRes, lineupRes, availRes, songsRes, cultosRes, nextCultoRes] =
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
          .gte("available_date", monthStart)
          .lte("available_date", monthEnd),
        supabase.from("songs").select("id", { count: "exact", head: true }).eq("team_id", currentTeam.id),
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

    setAvailabilityCount(availRes.count ?? 0);
    setSongCount(songsRes.count ?? 0);
    setCultoCount(cultosRes.count ?? 0);
    setNextTeamCulto(nextCultoRes.data);
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
    }
  };

  if (teamLoading || loading) {
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
                {member.instruments.map((inst: string) => (
                  <Badge key={inst} variant="secondary" className="text-xs gap-1">
                    <Guitar className="h-3 w-3" />
                    {inst}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassCard>

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
      <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
        <GlassCard
          variant="subtle"
          className="p-4 cursor-pointer hover-lift"
          onClick={() => navigate("/app/disponibilidades")}
        >
          <div className="flex items-center gap-2 mb-1">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Disponibilidade</span>
          </div>
          <p className="text-2xl font-semibold">{availabilityCount}</p>
          <p className="text-xs text-muted-foreground">dias este mês</p>
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

        <GlassCard variant="subtle" className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Church className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Próximo Culto</span>
          </div>
          {nextTeamCulto ? (
            <>
              <p className="text-sm font-medium truncate">{nextTeamCulto.name}</p>
              <p className="text-xs text-muted-foreground capitalize">
                {format(new Date(nextTeamCulto.date + "T12:00:00"), "dd/MM", { locale: ptBR })}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum</p>
          )}
        </GlassCard>
      </div>{/* end right column */}
      </div>{/* end grid */}
    </div>
  );
}
