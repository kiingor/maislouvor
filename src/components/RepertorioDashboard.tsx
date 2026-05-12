import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeam } from "@/contexts/TeamContext";
import { useNavigate } from "react-router-dom";
import { GlassCard } from "@/components/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Music, TrendingUp, EyeOff, AlertTriangle, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState, useMemo } from "react";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function RepertorioDashboard() {
  const { currentTeam } = useTeam();
  const navigate = useNavigate();
  const [showAllTop, setShowAllTop] = useState(false);
  const [showAllForgotten, setShowAllForgotten] = useState(false);

  // Fetch all songs
  const { data: songs = [], isLoading: loadingSongs } = useQuery({
    queryKey: ["dashboard-songs", currentTeam?.id],
    queryFn: async () => {
      if (!currentTeam) return [];
      const { data } = await supabase
        .from("songs")
        .select("id, title, artist, key_current, theme, audio_path, cifra_text, tags")
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <GlassCard key={i} className="p-6 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  const chartColors = [
    "hsl(var(--primary))",
    "hsl(var(--muted-foreground))",
  ];

  const topList = showAllTop ? metrics.topPlayed : metrics.topPlayed.slice(0, 10);
  const forgottenList = showAllForgotten ? metrics.forgotten : metrics.forgotten.slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <Music className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{metrics.totalSongs}</p>
              <p className="text-xs text-muted-foreground">Total de músicas</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{metrics.playedCount}</p>
              <p className="text-xs text-muted-foreground">Já tocadas</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{metrics.neverPlayedCount}</p>
              <p className="text-xs text-muted-foreground">Nunca tocadas</p>
            </div>
          </div>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold">{metrics.incompleteCount}</p>
              <p className="text-xs text-muted-foreground">Incompletas</p>
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Top played */}
      {metrics.topPlayed.length > 0 && (
        <GlassCard className="p-5">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Músicas mais tocadas
          </h3>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead className="hidden sm:table-cell">Artista</TableHead>
                  <TableHead className="text-center">Vezes</TableHead>
                  <TableHead className="hidden sm:table-cell">Última vez</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topList.map((s, i) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/songs/${s.id}`)}
                  >
                    <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{s.artist || "—"}</TableCell>
                    <TableCell className="text-center">{s.count}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {format(new Date(s.lastDate), "dd/MM/yyyy", { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {metrics.topPlayed.length > 10 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full gap-1"
              onClick={() => setShowAllTop(!showAllTop)}
            >
              {showAllTop ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAllTop ? "Mostrar menos" : `Ver todas (${metrics.topPlayed.length})`}
            </Button>
          )}
        </GlassCard>
      )}

      {/* Forgotten songs */}
      {metrics.forgotten.length > 0 && (
        <GlassCard className="p-5">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <EyeOff className="h-4 w-4" /> Músicas esquecidas
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Nunca tocadas ou há mais de 60 dias sem tocar
          </p>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead className="hidden sm:table-cell">Artista</TableHead>
                  <TableHead>Tom</TableHead>
                  <TableHead>Última vez</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forgottenList.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/app/songs/${s.id}`)}
                  >
                    <TableCell className="font-medium">{s.title}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{s.artist || "—"}</TableCell>
                    <TableCell>{s.key_current || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.lastDate
                        ? format(new Date(s.lastDate), "dd/MM/yyyy", { locale: ptBR })
                        : "Nunca"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {metrics.forgotten.length > 10 && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full gap-1"
              onClick={() => setShowAllForgotten(!showAllForgotten)}
            >
              {showAllForgotten ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showAllForgotten ? "Mostrar menos" : `Ver todas (${metrics.forgotten.length})`}
            </Button>
          )}
        </GlassCard>
      )}

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Key distribution */}
        <GlassCard className="p-5">
          <h3 className="font-medium mb-4">Distribuição por tom</h3>
          {metrics.keyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.keyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="value" name="Músicas" radius={[4, 4, 0, 0]}>
                  {metrics.keyChartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? chartColors[0] : chartColors[1]} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
          )}
        </GlassCard>

        {/* Theme distribution */}
        <GlassCard className="p-5">
          <h3 className="font-medium mb-4">Distribuição por tema</h3>
          {metrics.themeChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={metrics.themeChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={100}
                  tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                />
                <Bar dataKey="value" name="Músicas" radius={[0, 4, 4, 0]}>
                  {metrics.themeChartData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? chartColors[0] : chartColors[1]} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum dado disponível</p>
          )}
        </GlassCard>
      </div>

      {/* Incomplete songs */}
      {metrics.incomplete.length > 0 && (
        <GlassCard className="p-5">
          <h3 className="font-medium mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Cadastro incompleto
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            Músicas com dados faltando — clique para completar
          </p>
          <div className="space-y-2">
            {metrics.incomplete.map((s) => {
              const missing: string[] = [];
              if (!s.key_current) missing.push("Tom");
              if (!s.theme) missing.push("Tema");
              if (!s.audio_path) missing.push("Áudio");
              if (!s.cifra_text) missing.push("Cifra");
              return (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-accent/50 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => navigate(`/app/songs/${s.id}`)}
                >
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="text-xs text-muted-foreground">{s.artist || "Sem artista"}</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end">
                    {missing.map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {m}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      )}
    </div>
  );
}
