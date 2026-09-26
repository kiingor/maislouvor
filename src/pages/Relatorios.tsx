import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, subDays, subMonths, startOfYear } from "date-fns";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { PageHeader } from "@/components/shell/PageHeader";
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
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { compareInstruments, instrumentIcon } from "@/data/instruments";

// Uma série por gráfico → uma cor só para todas as barras (tinta da marca; clara no modo escuro).
const chartColor = "hsl(var(--primary))";

const PRESETS = [
  { key: "30d", label: "30 dias", from: () => format(subDays(new Date(), 30), "yyyy-MM-dd") },
  { key: "90d", label: "90 dias", from: () => format(subDays(new Date(), 90), "yyyy-MM-dd") },
  { key: "12m", label: "12 meses", from: () => format(subMonths(new Date(), 12), "yyyy-MM-dd") },
  { key: "ano", label: "Este ano", from: () => format(startOfYear(new Date()), "yyyy-MM-dd") },
  { key: "tudo", label: "Tudo", from: () => "1900-01-01" },
] as const;

const todayStr = () => format(new Date(), "yyyy-MM-dd");

/** Resumo no estilo das listas inteligentes do Lembretes (protótipo `.stat`). */
function StatTile({
  icon: Icon,
  value,
  label,
  hint,
}: {
  icon: LucideIcon;
  value: string | number;
  label: string;
  hint?: string;
}) {
  return (
    <div className="rounded-card bg-card flex min-h-[92px] flex-col gap-2 px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-prominent text-prominent-foreground" aria-hidden="true">
          <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
        </span>
        <strong className="text-title1 text-foreground">{value}</strong>
      </div>
      <p className="text-subhead font-semibold text-muted-foreground">
        {label}
        {hint && <small className="block text-footnote font-normal">{hint}</small>}
      </p>
    </div>
  );
}

const axisTick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

function ChartCard({
  title,
  data,
  horizontal,
}: {
  title: string;
  data: { name: string; value: number }[];
  horizontal?: boolean;
}) {
  return (
    <section className="rounded-card bg-card p-4">
      <h3 className="mb-3 text-headline text-foreground">{title}</h3>
      {data.length === 0 ? (
        <p className="text-subhead text-muted-foreground">Nenhum dado no período.</p>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} layout={horizontal ? "vertical" : undefined} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            {/* Grade só no eixo de valor: hairline sólida, recessiva. */}
            <CartesianGrid stroke="hsl(var(--border))" horizontal={!horizontal} vertical={!!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={110} tick={axisTick} axisLine={false} tickLine={false} />
              </>
            ) : (
              <>
                <XAxis dataKey="name" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={32} />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--fill-quaternary)" }}
              separator=""
              formatter={(v: any) => [v, ""]}
              contentStyle={{
                background: "hsl(var(--card))",
                border: "none",
                borderRadius: 12,
                boxShadow: "0 8px 24px -8px rgba(0,0,0,0.25), 0 0 0 0.5px hsl(var(--border))",
                fontSize: 13,
                color: "hsl(var(--foreground))",
              }}
              labelStyle={{ color: "hsl(var(--muted-foreground))", marginBottom: 2 }}
              itemStyle={{ color: "hsl(var(--foreground))", fontWeight: 600, padding: 0 }}
            />
            <Bar dataKey="value" fill={chartColor} maxBarSize={24} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

export default function Relatorios() {
  // Voltar pelo histórico quando houver (tela aberta pelo menu ≡); senão, Início.
  const backTarget: string | true = useLocation().key !== "default" ? true : "/app/home";
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
        <PageHeader title="Relatórios" back={backTarget} />
        <div className="rounded-card bg-card px-6 py-10 flex flex-col items-center text-center gap-2">
          <BarChart3 className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          <h2 className="text-body text-muted-foreground">Sem acesso</h2>
          <p className="text-footnote text-muted-foreground max-w-xs">Só quem gerencia cultos vê os relatórios da equipe.</p>
          <Button variant="secondary" className="mt-3 rounded-full" onClick={() => navigate("/app/home")}>
            Voltar
          </Button>
        </div>
      </div>
    );
  }

  if (!currentTeam) {
    return (
      <div className="animate-in-up">
        <PageHeader title="Relatórios" back={backTarget} />
        <div className="rounded-card bg-card px-6 py-10 flex flex-col items-center text-center gap-2">
          <Users className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
          <p className="text-body text-muted-foreground">Entre em uma equipe para ver os relatórios.</p>
        </div>
      </div>
    );
  }

  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

  const dateInput =
    "h-9 rounded-[8px] border-0 bg-fill-tertiary px-2.5 text-body text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ios-blue/40";
  const rowSeparator =
    "relative before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border first:before:hidden";
  const showMoreButton =
    "flex w-full min-h-[44px] items-center justify-center border-t border-border px-4 text-subhead font-medium text-primary transition-colors active:bg-fill-tertiary";

  const visibleMembers = showAllMembers ? escalaStats.memberRows : escalaStats.memberRows.slice(0, 10);
  const visibleSongs = showAllSongs ? repertorioStats.rows : repertorioStats.rows.slice(0, 10);

  const roleChips = (roles: Map<string, number>) =>
    Array.from(roles.entries())
      .sort((a, b) => b[1] - a[1] || compareInstruments(a[0], b[0]))
      .map(([role, n]) => {
        const Icon = instrumentIcon(role);
        return (
          <span
            key={role}
            className="inline-flex items-center gap-1 rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 text-muted-foreground"
          >
            <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
            {role} · {n}
          </span>
        );
      });

  return (
    <div className="animate-in-up">
      <PageHeader title="Relatórios" subtitle="Escalas e repertório da equipe no período escolhido." back={backTarget} />

      {/* Filtro de período: atalhos em cápsula + intervalo personalizado */}
      <section aria-label="Período" className="rounded-card bg-card overflow-hidden">
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {PRESETS.map((p) => {
            const active = !customFrom && !customTo && preset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setPreset(p.key);
                  setCustomFrom("");
                  setCustomTo("");
                }}
                className={cn(
                  "relative h-9 shrink-0 whitespace-nowrap rounded-full px-4 text-subhead font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1",
                  active ? "bg-prominent text-prominent-foreground" : "bg-fill-tertiary text-foreground active:bg-fill-secondary",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <label className="relative flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border">
          <span className="text-body text-foreground">De</span>
          <input
            type="date"
            value={customFrom || (preset === "tudo" ? "" : from)}
            onChange={(e) => setCustomFrom(e.target.value)}
            className={dateInput}
          />
        </label>
        <label className="relative flex min-h-[52px] items-center justify-between gap-3 px-4 py-2 before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border">
          <span className="text-body text-foreground">Até</span>
          <input
            type="date"
            value={customTo || to}
            onChange={(e) => setCustomTo(e.target.value)}
            className={dateInput}
          />
        </label>
      </section>

      {isLoading && cultos.length === 0 && lineup.length === 0 ? (
        <div className="mt-6 grid gap-2.5 grid-cols-2 lg:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-card bg-card h-[92px] animate-pulse" />
          ))}
        </div>
      ) : (
        // Aba controlada + árvore preservada: trocar o período não pode jogar
        // o usuário de volta para "Escalas" nem piscar a página inteira.
        <Tabs value={tab} onValueChange={setTab} className={cn("mt-6", isLoading && "opacity-60 transition-opacity")}>
          <TabsList className="mb-4 grid w-full grid-cols-2 sm:max-w-sm">
            <TabsTrigger value="escalas">Escalas</TabsTrigger>
            <TabsTrigger value="repertorio">Repertório</TabsTrigger>
          </TabsList>

          {/* ===================== ESCALAS ===================== */}
          <TabsContent value="escalas" className="space-y-4 mt-0">
            <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
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

            <ChartCard title="Escalações por função" data={escalaStats.instrumentChart} horizontal />

            <section className="rounded-card bg-card overflow-hidden">
              <h3 className="px-4 pt-4 pb-2 text-headline text-foreground">Escalas por integrante</h3>
              {escalaStats.memberRows.length === 0 ? (
                <p className="px-4 pb-4 text-subhead text-muted-foreground">Nenhuma escala no período.</p>
              ) : (
                <>
                  {/* Celular: lista agrupada (nenhuma coluna escondida) */}
                  <ul className="md:hidden">
                    {visibleMembers.map((m, i) => (
                      <li key={`${m.name}-${i}`} className={cn(rowSeparator, "px-4 py-2.5")}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 truncate text-body text-foreground">{m.name}</span>
                          <span className="shrink-0 text-body tabular-nums text-foreground">
                            {m.total}
                            <span className="sr-only"> escalas</span>
                          </span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote tabular-nums text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-[13px] w-[13px] text-ios-green" strokeWidth={2.25} aria-hidden="true" />
                            {m.accepted}
                            <span className="sr-only"> confirmadas</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <XCircle className="h-[13px] w-[13px] text-ios-red" strokeWidth={2.25} aria-hidden="true" />
                            {m.declined}
                            <span className="sr-only"> recusadas</span>
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-[13px] w-[13px] text-ios-orange" strokeWidth={2.25} aria-hidden="true" />
                            {m.pending}
                            <span className="sr-only"> pendentes</span>
                          </span>
                          <span>Última {fmtDate(m.last)}</span>
                        </div>
                        {m.roles.size > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{roleChips(m.roles)}</div>}
                      </li>
                    ))}
                  </ul>

                  {/* Tablet/desktop: tabela */}
                  <div className="hidden md:block px-2 pb-1">
                    <Table className="text-subhead">
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="h-9 px-2 text-footnote">Integrante</TableHead>
                          <TableHead className="h-9 px-2 text-right text-footnote">Escalas</TableHead>
                          <TableHead className="h-9 px-2 text-right text-footnote">
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-[13px] w-[13px] text-ios-green" strokeWidth={2.25} aria-hidden="true" /> Confirmou
                            </span>
                          </TableHead>
                          <TableHead className="h-9 px-2 text-right text-footnote">
                            <span className="inline-flex items-center gap-1">
                              <XCircle className="h-[13px] w-[13px] text-ios-red" strokeWidth={2.25} aria-hidden="true" /> Recusou
                            </span>
                          </TableHead>
                          <TableHead className="h-9 px-2 text-right text-footnote">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-[13px] w-[13px] text-ios-orange" strokeWidth={2.25} aria-hidden="true" /> Pendente
                            </span>
                          </TableHead>
                          <TableHead className="h-9 px-2 text-footnote">Funções</TableHead>
                          <TableHead className="h-9 px-2 text-right text-footnote hidden lg:table-cell">Última</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleMembers.map((m, i) => (
                          <TableRow key={`${m.name}-${i}`} className="border-border hover:bg-transparent">
                            <TableCell className="px-2 py-2.5 font-medium text-foreground">{m.name}</TableCell>
                            <TableCell className="px-2 py-2.5 text-right tabular-nums">{m.total}</TableCell>
                            <TableCell className="px-2 py-2.5 text-right tabular-nums">{m.accepted}</TableCell>
                            <TableCell className="px-2 py-2.5 text-right tabular-nums">{m.declined}</TableCell>
                            <TableCell className="px-2 py-2.5 text-right tabular-nums">{m.pending}</TableCell>
                            <TableCell className="px-2 py-2.5">
                              <div className="flex flex-wrap gap-1">{roleChips(m.roles)}</div>
                            </TableCell>
                            <TableCell className="px-2 py-2.5 text-right text-muted-foreground tabular-nums hidden lg:table-cell">
                              {fmtDate(m.last)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {escalaStats.memberRows.length > 10 && (
                    <button type="button" className={showMoreButton} onClick={() => setShowAllMembers((v) => !v)}>
                      {showAllMembers ? "Mostrar menos" : `Ver todos (${escalaStats.memberRows.length})`}
                    </button>
                  )}
                </>
              )}
            </section>
          </TabsContent>

          {/* ===================== REPERTÓRIO ===================== */}
          <TabsContent value="repertorio" className="space-y-4 mt-0">
            <div className="grid gap-2.5 grid-cols-2 lg:grid-cols-4">
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
              <ChartCard title="Por tema" data={repertorioStats.themeChart} horizontal />
              <ChartCard title="Tons mais tocados" data={repertorioStats.keyChart} />
            </div>

            <section className="rounded-card bg-card overflow-hidden">
              <h3 className="px-4 pt-4 pb-2 text-headline text-foreground">Músicas mais tocadas</h3>
              {repertorioStats.rows.length === 0 ? (
                <p className="px-4 pb-4 text-subhead text-muted-foreground">Nenhuma música tocada no período.</p>
              ) : (
                <>
                  <ul className="md:hidden">
                    {visibleSongs.map((s, i) => (
                      <li key={`${s.title}-${i}`} className={cn(rowSeparator, "flex items-center gap-3 px-4 py-2.5")}>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body text-foreground">{s.title}</span>
                          <span className="block truncate text-footnote text-muted-foreground">
                            {[s.artist, s.theme].filter(Boolean).join(" · ") || "—"} · Última {fmtDate(s.last)}
                          </span>
                        </span>
                        <span className="shrink-0 text-body tabular-nums text-foreground">
                          {s.count}
                          <span className="sr-only"> vezes</span>
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden md:block px-2 pb-1">
                    <Table className="text-subhead">
                      <TableHeader>
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="h-9 px-2 text-footnote">Música</TableHead>
                          <TableHead className="h-9 px-2 text-footnote">Artista</TableHead>
                          <TableHead className="h-9 px-2 text-footnote">Tema</TableHead>
                          <TableHead className="h-9 px-2 text-right text-footnote">Vezes</TableHead>
                          <TableHead className="h-9 px-2 text-right text-footnote">Última</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleSongs.map((s, i) => (
                          <TableRow key={`${s.title}-${i}`} className="border-border hover:bg-transparent">
                            <TableCell className="px-2 py-2.5 font-medium text-foreground">{s.title}</TableCell>
                            <TableCell className="px-2 py-2.5 text-muted-foreground">{s.artist ?? "—"}</TableCell>
                            <TableCell className="px-2 py-2.5 text-muted-foreground">{s.theme ?? "—"}</TableCell>
                            <TableCell className="px-2 py-2.5 text-right tabular-nums">{s.count}</TableCell>
                            <TableCell className="px-2 py-2.5 text-right text-muted-foreground tabular-nums">{fmtDate(s.last)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {repertorioStats.rows.length > 10 && (
                    <button type="button" className={showMoreButton} onClick={() => setShowAllSongs((v) => !v)}>
                      {showAllSongs ? "Mostrar menos" : `Ver todas (${repertorioStats.rows.length})`}
                    </button>
                  )}
                </>
              )}
            </section>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
