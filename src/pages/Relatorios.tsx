import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, subDays, subMonths, startOfYear } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { GlassCard } from "@/components/GlassCard";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock,
  Music,
  Repeat,
  TrendingUp,
  Users,
} from "lucide-react";
import { compareInstruments, instrumentIcon } from "@/data/instruments";

const chartColors = ["hsl(var(--primary))", "hsl(var(--muted-foreground))"];

const PRESETS = [
  { key: "30d", label: "30 dias", from: () => format(subDays(new Date(), 30), "yyyy-MM-dd") },
  { key: "90d", label: "90 dias", from: () => format(subDays(new Date(), 90), "yyyy-MM-dd") },
  { key: "12m", label: "12 meses", from: () => format(subMonths(new Date(), 12), "yyyy-MM-dd") },
  { key: "ano", label: "Este ano", from: () => format(startOfYear(new Date()), "yyyy-MM-dd") },
  { key: "tudo", label: "Tudo", from: () => "1900-01-01" },
] as const;

const todayStr = () => format(new Date(), "yyyy-MM-dd");

function StatTile({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  hint?: string;
}) {
  return (
    <GlassCard className="p-5">
      <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="text-xs text-muted-foreground mt-1.5">{label}</p>
      {hint && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{hint}</p>}
    </GlassCard>
  );
}

function ChartCard({
  title,
  icon: Icon,
  data,
  horizontal,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  data: { name: string; value: number }[];
  horizontal?: boolean;
}) {
  return (
    <GlassCard className="p-5">
      <h3 className="font-medium mb-4 flex items-center gap-2 text-sm">
        <Icon className="h-4 w-4 text-muted-foreground" /> {title}
      </h3>
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} layout={horizontal ? "vertical" : undefined}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            {horizontal ? (
              <>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                />
              </>
            ) : (
              <>
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
              </>
            )}
            <Tooltip
              cursor={{ fill: "hsl(var(--accent))", fillOpacity: 0.4 }}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 8,
                fontSize: 13,
              }}
            />
            <Bar dataKey="value" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} fillOpacity={0.8}>
              {data.map((_, i) => (
                <Cell key={i} fill={i === 0 ? chartColors[0] : chartColors[1]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </GlassCard>
  );
}

export default function Relatorios() {
  const { currentTeam, can, loading: teamLoading } = useTeam();
  const navigate = useNavigate();
  const canSee = can("cultos", "editar");

  const [preset, setPreset] = useState<string>("90d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const from = customFrom || PRESETS.find((p) => p.key === preset)!.from();
  const to = customTo || todayStr();

  const { data: cultos = [], isLoading: l1 } = useQuery({
    queryKey: ["rel-cultos", currentTeam?.id, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("cultos")
        .select("id, name, date")
        .eq("team_id", currentTeam!.id)
        .gte("date", from)
        .lte("date", to)
        .order("date", { ascending: false });
      return data ?? [];
    },
    enabled: !!currentTeam && canSee,
    placeholderData: keepPreviousData,
  });

  const { data: lineup = [], isLoading: l2 } = useQuery({
    queryKey: ["rel-lineup", currentTeam?.id, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_lineup")
        .select("instrument, status, team_member_id, cultos!inner(id, date, team_id)")
        .eq("cultos.team_id", currentTeam!.id)
        .gte("cultos.date", from)
        .lte("cultos.date", to);
      return (data ?? []) as any[];
    },
    enabled: !!currentTeam && canSee,
    placeholderData: keepPreviousData,
  });

  const { data: playedSongs = [], isLoading: l3 } = useQuery({
    queryKey: ["rel-culto-songs", currentTeam?.id, from, to],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_songs")
        .select(
          "song_id, key_override, cultos!inner(id, date, team_id), songs(id, title, artist, theme, tags, key_current, key_original)" as any,
        )
        .eq("cultos.team_id", currentTeam!.id)
        .gte("cultos.date", from)
        .lte("cultos.date", to);
      return (data ?? []) as any[];
    },
    enabled: !!currentTeam && canSee,
    placeholderData: keepPreviousData,
  });

  const { data: members = [], isLoading: l4 } = useQuery({
    queryKey: ["rel-members", currentTeam?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("id, profile_id, profiles(full_name)")
        .eq("team_id", currentTeam!.id);
      return (data ?? []) as any[];
    },
    enabled: !!currentTeam && canSee,
    placeholderData: keepPreviousData,
  });

  const { data: totalSongs = 0 } = useQuery({
    queryKey: ["rel-total-songs", currentTeam?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("songs")
        .select("id", { count: "exact", head: true })
        .eq("team_id", currentTeam!.id);
      return count ?? 0;
    },
    enabled: !!currentTeam && canSee,
    placeholderData: keepPreviousData,
  });

  const isLoading = l1 || l2 || l3 || l4;

  const escalaStats = useMemo(() => {
    const memberName = new Map<string, string>();
    members.forEach((m: any) => memberName.set(m.id, (m.profiles as any)?.full_name ?? "Sem nome"));

    const byInstrument = new Map<string, number>();
    const byMember = new Map<
      string,
      { name: string; total: number; accepted: number; declined: number; pending: number; roles: Map<string, number>; last: string | null }
    >();

    lineup.forEach((l: any) => {
      const date = l.cultos?.date ?? null;
      byInstrument.set(l.instrument, (byInstrument.get(l.instrument) ?? 0) + 1);

      const entry =
        byMember.get(l.team_member_id) ?? {
          name: memberName.get(l.team_member_id) ?? "Removido da equipe",
          total: 0,
          accepted: 0,
          declined: 0,
          pending: 0,
          roles: new Map<string, number>(),
          last: null,
        };
      entry.total += 1;
      const status = l.status ?? "pending";
      if (status === "accepted") entry.accepted += 1;
      else if (status === "declined") entry.declined += 1;
      else entry.pending += 1;
      entry.roles.set(l.instrument, (entry.roles.get(l.instrument) ?? 0) + 1);
      if (date && (!entry.last || date > entry.last)) entry.last = date;
      byMember.set(l.team_member_id, entry);
    });

    const accepted = lineup.filter((l: any) => l.status === "accepted").length;
    const declined = lineup.filter((l: any) => l.status === "declined").length;

    // Pessoas distintas por culto: a mesma pessoa pode ocupar duas funções no
    // mesmo culto (canta e toca), o que geraria duas linhas em culto_lineup.
    const distinctPairs = new Set(
      lineup.map((l: any) => `${l.cultos?.id ?? ""}|${l.team_member_id}`),
    ).size;

    return {
      totalCultos: cultos.length,
      totalSlots: lineup.length,
      accepted,
      declined,
      confirmRate: lineup.length > 0 ? Math.round((accepted / lineup.length) * 100) : 0,
      peopleCount: byMember.size,
      distinctPairs,
      instrumentChart: Array.from(byInstrument.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value })),
      memberRows: Array.from(byMember.values()).sort((a, b) => b.total - a.total),
    };
  }, [lineup, cultos, members]);

  const repertorioStats = useMemo(() => {
    const play = new Map<
      string,
      { title: string; artist: string | null; theme: string | null; count: number; last: string | null }
    >();
    const byTheme = new Map<string, number>();
    const byKey = new Map<string, number>();

    playedSongs.forEach((cs: any) => {
      const song = cs.songs as any;
      if (!song) return;
      const date = cs.cultos?.date ?? null;
      const entry =
        play.get(song.id) ?? { title: song.title, artist: song.artist, theme: song.theme, count: 0, last: null };
      entry.count += 1;
      if (date && (!entry.last || date > entry.last)) entry.last = date;
      play.set(song.id, entry);

      const theme = song.theme || "Sem tema";
      byTheme.set(theme, (byTheme.get(theme) ?? 0) + 1);

      const key = cs.key_override || song.key_current || song.key_original;
      if (key) byKey.set(key, (byKey.get(key) ?? 0) + 1);
    });

    const rows = Array.from(play.values()).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, "pt-BR"));

    return {
      distinct: play.size,
      executions: playedSongs.length,
      avgPerCulto: cultos.length > 0 ? (playedSongs.length / cultos.length).toFixed(1) : "0",
      unused: Math.max(0, totalSongs - play.size),
      rows,
      themeChart: Array.from(byTheme.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })),
      keyChart: Array.from(byKey.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value })),
    };
  }, [playedSongs, cultos, totalSongs]);

  const [tab, setTab] = useState("escalas");
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showAllSongs, setShowAllSongs] = useState(false);

  if (teamLoading) return null;

  if (!canSee) {
    return (
      <div className="animate-in-up">
        <GlassCard className="p-12 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-medium mb-1">Sem acesso</h3>
          <p className="text-muted-foreground text-sm">Só quem gerencia cultos vê os relatórios da equipe.</p>
          <Button variant="outline" className="mt-5 rounded-xl" onClick={() => navigate("/app/home")}>
            Voltar
          </Button>
        </GlassCard>
      </div>
    );
  }

  if (!currentTeam) {
    return (
      <div className="animate-in-up">
        <GlassCard className="p-12 text-center">
          <p className="text-muted-foreground text-sm">Entre em uma equipe para ver os relatórios.</p>
        </GlassCard>
      </div>
    );
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  return (
    <div className="max-w-6xl mx-auto animate-in-up">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Escalas e repertório da equipe no período escolhido.
        </p>
      </div>

      {/* Filtro de período */}
      <GlassCard variant="subtle" className="p-3 mb-6 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex rounded-xl glass-subtle p-1 gap-0.5 overflow-x-auto hide-scrollbar">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => {
                setPreset(p.key);
                setCustomFrom("");
                setCustomTo("");
              }}
              className={`text-xs px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                !customFrom && !customTo && preset === p.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <input
            type="date"
            value={customFrom || (preset === "tudo" ? "" : from)}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="h-9 rounded-lg glass-input border-0 px-2.5 text-xs"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="date"
            value={customTo || to}
            onChange={(e) => setCustomTo(e.target.value)}
            className="h-9 rounded-lg glass-input border-0 px-2.5 text-xs"
          />
        </div>
      </GlassCard>

      {isLoading && cultos.length === 0 && lineup.length === 0 ? (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <GlassCard key={i} className="p-6 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        // Aba controlada + árvore preservada: trocar o período não pode jogar
        // o usuário de volta para "Escalas" nem piscar a página inteira.
        <Tabs value={tab} onValueChange={setTab} className={isLoading ? "opacity-60 transition-opacity" : ""}>
          <TabsList className="mb-4">
            <TabsTrigger value="escalas" className="gap-1.5">
              <Users className="h-3.5 w-3.5" /> Escalas
            </TabsTrigger>
            <TabsTrigger value="repertorio" className="gap-1.5">
              <Music className="h-3.5 w-3.5" /> Repertório
            </TabsTrigger>
          </TabsList>

          {/* ===================== ESCALAS ===================== */}
          <TabsContent value="escalas" className="space-y-4 mt-0">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <StatTile icon={CalendarDays} value={escalaStats.totalCultos} label="Cultos no período" />
              <StatTile icon={Users} value={escalaStats.totalSlots} label="Escalações" hint={`${escalaStats.peopleCount} integrantes`} />
              <StatTile
                icon={CheckCircle2}
                value={`${escalaStats.confirmRate}%`}
                label="Taxa de confirmação"
                hint={`${escalaStats.accepted} confirmadas · ${escalaStats.declined} recusadas`}
              />
              <StatTile
                icon={TrendingUp}
                value={escalaStats.totalCultos > 0 ? (escalaStats.distinctPairs / escalaStats.totalCultos).toFixed(1) : "0"}
                label="Pessoas por culto"
                hint={
                  escalaStats.totalCultos > 0
                    ? `${(escalaStats.totalSlots / escalaStats.totalCultos).toFixed(1)} funções por culto`
                    : undefined
                }
              />
            </div>

            <ChartCard title="Escalações por função" icon={Users} data={escalaStats.instrumentChart} horizontal />

            <GlassCard className="p-5">
              <h3 className="font-medium mb-4 flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" /> Escalas por integrante
              </h3>
              {escalaStats.memberRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma escala no período.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="text-xs sm:text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Integrante</TableHead>
                          <TableHead className="text-right">Escalas</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Confirmou</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Recusou</TableHead>
                          <TableHead className="text-right hidden md:table-cell">Pendente</TableHead>
                          <TableHead className="hidden md:table-cell">Funções</TableHead>
                          <TableHead className="text-right hidden lg:table-cell">Última</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(showAllMembers ? escalaStats.memberRows : escalaStats.memberRows.slice(0, 10)).map((m, i) => (
                          <TableRow key={`${m.name}-${i}`}>
                            <TableCell className="font-medium">{m.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{m.total}</TableCell>
                            <TableCell className="text-right tabular-nums hidden sm:table-cell text-green-600 dark:text-green-400">
                              {m.accepted}
                            </TableCell>
                            <TableCell className="text-right tabular-nums hidden sm:table-cell text-red-600 dark:text-red-400">
                              {m.declined}
                            </TableCell>
                            <TableCell className="text-right tabular-nums hidden md:table-cell text-yellow-600 dark:text-yellow-400">
                              {m.pending}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <div className="flex flex-wrap gap-1">
                                {Array.from(m.roles.entries())
                                  .sort((a, b) => b[1] - a[1] || compareInstruments(a[0], b[0]))
                                  .map(([role, n]) => {
                                    const Icon = instrumentIcon(role);
                                    return (
                                      <span
                                        key={role}
                                        className="text-[10px] bg-accent text-muted-foreground px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                                      >
                                        <Icon className="h-2.5 w-2.5" />
                                        {role} · {n}
                                      </span>
                                    );
                                  })}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground hidden lg:table-cell">
                              {fmtDate(m.last)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {escalaStats.memberRows.length > 10 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs"
                      onClick={() => setShowAllMembers((v) => !v)}
                    >
                      {showAllMembers ? "Mostrar menos" : `Ver todos (${escalaStats.memberRows.length})`}
                    </Button>
                  )}
                </>
              )}
            </GlassCard>
          </TabsContent>

          {/* ===================== REPERTÓRIO ===================== */}
          <TabsContent value="repertorio" className="space-y-4 mt-0">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <StatTile icon={Music} value={repertorioStats.distinct} label="Músicas tocadas" />
              <StatTile icon={Repeat} value={repertorioStats.executions} label="Execuções" />
              <StatTile icon={TrendingUp} value={repertorioStats.avgPerCulto} label="Músicas por culto" />
              <StatTile
                icon={Clock}
                value={repertorioStats.unused}
                label="Sem uso no período"
                hint={`de ${totalSongs} no acervo`}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Por tema" icon={Music} data={repertorioStats.themeChart} horizontal />
              <ChartCard title="Tons mais tocados" icon={BarChart3} data={repertorioStats.keyChart} />
            </div>

            <GlassCard className="p-5">
              <h3 className="font-medium mb-4 flex items-center gap-2 text-sm">
                <Repeat className="h-4 w-4 text-muted-foreground" /> Músicas mais tocadas
              </h3>
              {repertorioStats.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma música tocada no período.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table className="text-xs sm:text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Música</TableHead>
                          <TableHead className="hidden sm:table-cell">Artista</TableHead>
                          <TableHead className="hidden md:table-cell">Tema</TableHead>
                          <TableHead className="text-right">Vezes</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">Última</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(showAllSongs ? repertorioStats.rows : repertorioStats.rows.slice(0, 10)).map((s, i) => (
                          <TableRow key={`${s.title}-${i}`}>
                            <TableCell className="font-medium">{s.title}</TableCell>
                            <TableCell className="hidden sm:table-cell text-muted-foreground">{s.artist ?? "—"}</TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground">{s.theme ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                            <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                              {fmtDate(s.last)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {repertorioStats.rows.length > 10 && (
                    <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setShowAllSongs((v) => !v)}>
                      {showAllSongs ? "Mostrar menos" : `Ver todas (${repertorioStats.rows.length})`}
                    </Button>
                  )}
                </>
              )}
            </GlassCard>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
