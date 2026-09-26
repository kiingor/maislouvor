import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import {
  Music, TrendingUp, EyeOff, AlertTriangle, ChevronDown, ChevronUp, ChevronRight, Wand2, Loader2, Pencil,
  type LucideIcon,
} from "lucide-react";
import { useState, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { detectKeyFromUrl } from "@/lib/detectKey";

/* ---------- Peças visuais (HIG > Lists, estilo das listas inteligentes do Lembretes) ---------- */

/** Cabeçalho de seção: Title3 + qualificador Subhead secundário + ação "Ver todas" à direita. */
function Section({ title, qualifier, action, children, className }: { title: string; qualifier?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="mx-1 mb-2 flex items-start justify-between gap-x-3">
        <h2 className="min-w-0 flex-1 text-title3 text-foreground">
          {title}
          {qualifier && <span className="block text-subhead font-normal text-muted-foreground">{qualifier}</span>}
        </h2>
        {action && <div className="mt-0.5 flex shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function ShowAllButton({ expanded, total, onClick }: { expanded: boolean; total: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="-my-2.5 -mr-1.5 inline-flex min-h-11 items-center gap-0.5 whitespace-nowrap rounded-[10px] px-1.5 text-subhead font-medium text-primary"
    >
      {expanded ? "Mostrar menos" : `Ver todas (${total})`}
      {expanded ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />}
    </button>
  );
}

function StatTile({ icon: Icon, value, label, tone = "tint" }: { icon: LucideIcon; value: number; label: string; tone?: "tint" | "warning" }) {
  return (
    <div className="flex min-h-[92px] flex-col gap-2 rounded-card bg-card px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full",
            tone === "warning" ? "bg-ios-orange text-white" : "bg-prominent text-prominent-foreground",
          )}
        >
          <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <span className="text-title1 text-foreground">{value}</span>
      </div>
      <span className="text-subhead font-semibold text-muted-foreground">{label}</span>
    </div>
  );
}

/** Separador hairline recuado (a primeira linha não tem). */
function RowSep({ inset }: { inset: string }) {
  return <span aria-hidden="true" className={cn("pointer-events-none absolute right-0 top-0 border-t border-separator", inset)} />;
}

/** Dica do gráfico: vidro espesso como os menus; valor em destaque, categoria secundária. */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; payload?: { name?: string } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const value = Number(payload[0].value ?? 0);
  const name = label ?? payload[0].payload?.name;
  return (
    <div className="liquid-glass-thick rounded-[14px] px-3 py-2">
      <p className="relative z-[4] text-headline tabular-nums text-foreground">
        {value} {value === 1 ? "música" : "músicas"}
      </p>
      <p className="relative z-[4] text-footnote text-muted-foreground">{name}</p>
    </div>
  );
}

/** Rótulo do eixo de categorias com corte em reticências (nomes de tema longos). */
function CategoryTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
  const full = String(payload?.value ?? "");
  const text = full.length > 14 ? `${full.slice(0, 13)}…` : full;
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={13} fill="hsl(var(--foreground))">
      <title>{full}</title>
      {text}
    </text>
  );
}

const CHART_BAR = "hsl(var(--prominent))";
const CHART_TEXT = "hsl(var(--muted-foreground))";

export default function RepertorioDashboard() {
  const { currentTeam } = useTeam();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAllTop, setShowAllTop] = useState(false);
  const [showAllForgotten, setShowAllForgotten] = useState(false);
  const [detectingId, setDetectingId] = useState<string | null>(null);

  const handleDetectKey = async (song: { id: string; audio_path?: string | null }) => {
    if (!song.audio_path || detectingId) return;
    setDetectingId(song.id);
    try {
      const { data } = await supabase.storage.from("audio").createSignedUrl(song.audio_path, 3600);
      if (!data?.signedUrl) throw new Error("Áudio indisponível");
      const key = await detectKeyFromUrl(data.signedUrl);
      if (!key) throw new Error("Não foi possível detectar o tom");
      const { error } = await supabase
        .from("songs")
        .update({ key_original: key.name, key_current: key.name } as any)
        .eq("id", song.id);
      if (error) throw error;
      toast({ title: "Tom detectado", description: `${key.label} aplicado.` });
      qc.invalidateQueries({ queryKey: ["dashboard-songs", currentTeam?.id] });
    } catch (e: any) {
      toast({ title: "Falha ao detectar tom", description: e?.message, variant: "destructive" });
    } finally {
      setDetectingId(null);
    }
  };

  // Fetch all songs
  const { data: songs = [], isLoading: loadingSongs } = useQuery({
    queryKey: ["dashboard-songs", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("songs")
        .select("id, title, artist, key_current, theme, audio_path, cifra_text, lyrics_text, tags")
        .eq("team_id", currentTeam.id);
      return data ?? [];
    },
    enabled: !!currentTeam,
  });

  // Fetch culto_songs with culto date
  const { data: cultoSongs = [], isLoading: loadingCultoSongs } = useQuery({
    queryKey: ["dashboard-culto-songs", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("culto_songs")
        .select("song_id, cultos!inner(date, team_id)")
        .eq("cultos.team_id", currentTeam.id);
      return (data ?? []) as Array<{ song_id: string; cultos: { date: string; team_id: string } }>;
    },
    enabled: !!currentTeam,
  });

  const isLoading = loadingSongs || loadingCultoSongs;

  // Compute metrics
  const metrics = useMemo(() => {
    // Play count per song
    const playCount = new Map<string, { count: number; lastDate: string }>();
    for (const cs of cultoSongs) {
      const existing = playCount.get(cs.song_id);
      if (!existing) {
        playCount.set(cs.song_id, { count: 1, lastDate: cs.cultos.date });
      } else {
        existing.count++;
        if (cs.cultos.date > existing.lastDate) existing.lastDate = cs.cultos.date;
      }
    }

    const totalSongs = songs.length;
    const playedSongs = songs.filter((s) => playCount.has(s.id));
    const neverPlayed = songs.filter((s) => !playCount.has(s.id));
    const incomplete = songs.filter(
      (s) => !s.key_current || !s.theme || !s.audio_path || !s.cifra_text
    );

    // Top played
    const topPlayed = songs
      .filter((s) => playCount.has(s.id))
      .map((s) => ({
        ...s,
        count: playCount.get(s.id)!.count,
        lastDate: playCount.get(s.id)!.lastDate,
      }))
      .sort((a, b) => b.count - a.count);

    // Forgotten: never played OR last played > 60 days ago
    const now = new Date();
    const forgotten = songs
      .map((s) => {
        const pc = playCount.get(s.id);
        return { ...s, lastDate: pc?.lastDate ?? null, count: pc?.count ?? 0 };
      })
      .filter((s) => {
        if (!s.lastDate) return true;
        return differenceInDays(now, new Date(s.lastDate)) > 60;
      })
      .sort((a, b) => {
        if (!a.lastDate && !b.lastDate) return 0;
        if (!a.lastDate) return -1;
        if (!b.lastDate) return 1;
        return new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime();
      });

    // Key distribution
    const keyDist = new Map<string, number>();
    for (const s of songs) {
      const key = s.key_current || "Sem tom";
      keyDist.set(key, (keyDist.get(key) || 0) + 1);
    }
    const keyChartData = Array.from(keyDist.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Theme distribution
    const themeDist = new Map<string, number>();
    for (const s of songs) {
      const theme = s.theme || "Sem tema";
      themeDist.set(theme, (themeDist.get(theme) || 0) + 1);
    }
    const themeChartData = Array.from(themeDist.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      totalSongs,
      playedCount: playedSongs.length,
      neverPlayedCount: neverPlayed.length,
      incompleteCount: incomplete.length,
      topPlayed,
      forgotten,
      keyChartData,
      themeChartData,
      incomplete,
    };
  }, [songs, cultoSongs]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-card bg-card" />
        ))}
      </div>
    );
  }

  const reduceMotion = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const fmt = (d: string) => format(new Date(d), "dd/MM/yyyy", { locale: ptBR });

  const topList = showAllTop ? metrics.topPlayed : metrics.topPlayed.slice(0, 10);
  const forgottenList = showAllForgotten ? metrics.forgotten : metrics.forgotten.slice(0, 10);
  const themeChartHeight = Math.max(110, metrics.themeChartData.length * 30 + 8);

  return (
    <div className="space-y-7">
      {/* Resumo */}
      <div role="group" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Resumo do repertório">
        <StatTile icon={Music} value={metrics.totalSongs} label="Total de músicas" />
        <StatTile icon={TrendingUp} value={metrics.playedCount} label="Já tocadas" />
        <StatTile icon={EyeOff} value={metrics.neverPlayedCount} label="Nunca tocadas" />
        <StatTile icon={AlertTriangle} value={metrics.incompleteCount} label="Incompletas" tone={metrics.incompleteCount > 0 ? "warning" : "tint"} />
      </div>

      {(metrics.topPlayed.length > 0 || metrics.forgotten.length > 0) && (
        <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
          {/* Top played */}
          {metrics.topPlayed.length > 0 && (
            <Section
              title="Músicas mais tocadas"
              action={metrics.topPlayed.length > 10 && (
                <ShowAllButton expanded={showAllTop} total={metrics.topPlayed.length} onClick={() => setShowAllTop(!showAllTop)} />
              )}
            >
              <ul className="overflow-hidden rounded-card bg-card">
                {topList.map((s, i) => (
                  <li key={s.id} className="relative">
                    {i > 0 && <RowSep inset="left-[52px]" />}
                    <button
                      type="button"
                      onClick={() => navigate(`/app/songs/${s.id}`)}
                      className="flex min-h-[56px] w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left transition-colors active:bg-fill-tertiary focus-visible:outline-offset-[-3px]"
                    >
                      <span className="w-6 shrink-0 text-center text-footnote tabular-nums text-muted-foreground">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-foreground">{s.title}</span>
                        <span className="block truncate text-footnote text-muted-foreground">
                          {s.artist || "—"} · Última vez {fmt(s.lastDate)}
                        </span>
                      </span>
                      <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
                        {s.count} {s.count === 1 ? "vez" : "vezes"}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* Forgotten songs */}
          {metrics.forgotten.length > 0 && (
            <Section
              title="Músicas esquecidas"
              qualifier="Nunca tocadas ou há mais de 60 dias sem tocar"
              action={metrics.forgotten.length > 10 && (
                <ShowAllButton expanded={showAllForgotten} total={metrics.forgotten.length} onClick={() => setShowAllForgotten(!showAllForgotten)} />
              )}
            >
              <ul className="overflow-hidden rounded-card bg-card">
                {forgottenList.map((s, i) => (
                  <li key={s.id} className="relative">
                    {i > 0 && <RowSep inset="left-4" />}
                    <button
                      type="button"
                      onClick={() => navigate(`/app/songs/${s.id}`)}
                      className="flex min-h-[56px] w-full items-center gap-3 py-2.5 pl-4 pr-3 text-left transition-colors active:bg-fill-tertiary focus-visible:outline-offset-[-3px]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body text-foreground">{s.title}</span>
                        <span className="block truncate text-footnote text-muted-foreground">
                          {s.artist || "—"} · {s.lastDate ? `Última vez ${fmt(s.lastDate)}` : "Nunca"}
                        </span>
                      </span>
                      <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
                        {s.key_current ? (
                          <>
                            <span className="sr-only">Tom </span>
                            {s.key_current}
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">—</span>
                            <span className="sr-only">Sem tom</span>
                          </>
                        )}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}

      {/* Charts row */}
      <div className="grid gap-7 lg:grid-cols-2 lg:items-start">
        {/* Key distribution */}
        <Section title="Distribuição por tom">
          <div className="rounded-card bg-card px-3 pb-2 pt-3">
            {metrics.keyChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={metrics.keyChartData} margin={{ top: 20, right: 4, bottom: 0, left: 4 }}>
                  <XAxis
                    dataKey="name"
                    interval={0}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))" }}
                    tick={{ fontSize: 12, fill: CHART_TEXT }}
                  />
                  <YAxis hide allowDecimals={false} domain={[0, "dataMax"]} />
                  <Tooltip cursor={{ fill: "var(--fill-quaternary)" }} content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Músicas" fill={CHART_BAR} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={!reduceMotion}>
                    <LabelList dataKey="value" position="top" offset={6} fontSize={12} fill={CHART_TEXT} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="px-1 py-6 text-center text-subhead text-muted-foreground">Nenhum dado disponível</p>
            )}
          </div>
        </Section>

        {/* Theme distribution */}
        <Section title="Distribuição por tema">
          <div className="rounded-card bg-card px-3 py-3">
            {metrics.themeChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={themeChartHeight}>
                <BarChart data={metrics.themeChartData} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }} barCategoryGap={6}>
                  <XAxis type="number" hide allowDecimals={false} domain={[0, "dataMax"]} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    width={112}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                    tick={<CategoryTick />}
                  />
                  <Tooltip cursor={{ fill: "var(--fill-quaternary)" }} content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Músicas" fill={CHART_BAR} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={!reduceMotion}>
                    <LabelList dataKey="value" position="right" offset={6} fontSize={12} fill={CHART_TEXT} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="px-1 py-6 text-center text-subhead text-muted-foreground">Nenhum dado disponível</p>
            )}
          </div>
        </Section>
      </div>

      {/* Incomplete songs */}
      {metrics.incomplete.length > 0 && (
        <Section title="Cadastro incompleto" qualifier="Músicas com dados faltando — use as ações para completar">
          <ul className="overflow-hidden rounded-card bg-card">
            {metrics.incomplete.map((s: any, i: number) => {
              const missing: string[] = [];
              if (!s.key_current) missing.push("Tom");
              if (!s.theme) missing.push("Tema");
              if (!s.audio_path) missing.push("Áudio");
              if (!s.cifra_text) missing.push("Cifra");
              if (!s.lyrics_text) missing.push("Letra");
              const canDetectKey = !s.key_current && !!s.audio_path;
              const needsContent = !s.cifra_text || !s.lyrics_text;
              const smallButton =
                "relative inline-flex h-9 items-center gap-1.5 rounded-full bg-fill-secondary px-3.5 text-footnote font-semibold text-foreground transition-colors active:bg-fill disabled:opacity-50 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] [&_svg]:h-[15px] [&_svg]:w-[15px]";
              return (
                <li key={s.id} className="relative px-4 py-3">
                  {i > 0 && <RowSep inset="left-4" />}
                  <button
                    type="button"
                    className="block w-full min-w-0 rounded-[8px] text-left transition-opacity active:opacity-60"
                    onClick={() => navigate(`/app/songs/${s.id}`)}
                  >
                    <span className="block truncate text-body text-foreground">{s.title}</span>
                    <span className="block truncate text-footnote text-muted-foreground">{s.artist || "Sem artista"}</span>
                  </button>
                  <div role="group" className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Dados faltando">
                    {missing.map((m) => (
                      <span key={m} className="rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 font-medium text-muted-foreground">
                        {m}
                      </span>
                    ))}
                  </div>
                  {(canDetectKey || needsContent) && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {canDetectKey && (
                        <button
                          type="button"
                          className={smallButton}
                          disabled={detectingId === s.id}
                          onClick={() => handleDetectKey(s)}
                        >
                          {detectingId === s.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Wand2 aria-hidden="true" />}
                          Detectar tom
                        </button>
                      )}
                      {needsContent && (
                        <button type="button" className={smallButton} onClick={() => navigate(`/app/songs/${s.id}`)}>
                          <Pencil aria-hidden="true" /> Editar
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
