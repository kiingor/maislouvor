import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Loader2,
  Music,
  Clock,
  CalendarDays,
  Users,
  ChevronDown,
} from "lucide-react";

interface SongItem {
  type: "song";
  sort_order: number;
  title: string;
  artist: string | null;
  key: string | null;
  notes: string | null;
  cifra_text: string | null;
  lyrics_text: string | null;
}

interface BlockItem {
  type: "block";
  sort_order: number;
  title: string;
  kind: string | null;
  duration_min: number | null;
  notes: string | null;
}

type RoteiroItem = SongItem | BlockItem;

interface CultoData {
  name: string;
  date: string; // YYYY-MM-DD
  description: string | null;
  items: RoteiroItem[];
  lineup: Record<string, string[]>;
}

const SONG_FALLBACK_SECONDS = 240;

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.round((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h${m.toString().padStart(2, "0")}`;
  return `${m} min`;
}

export default function PublicCulto() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<CultoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSong, setOpenSong] = useState<number | null>(null);

  // Tema escuro nesta página pública.
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-culto?token=${token}`;
    fetch(url, {
      headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Roteiro não encontrado.");
        setLoading(false);
      });
  }, [token]);

  const totalSeconds = useMemo(() => {
    if (!data) return 0;
    return data.items.reduce((acc, it) => {
      if (it.type === "block") return acc + (it.duration_min || 0) * 60;
      return acc + SONG_FALLBACK_SECONDS;
    }, 0);
  }, [data]);

  const formattedDate = useMemo(() => {
    if (!data?.date) return "";
    return new Date(data.date + "T00:00:00").toLocaleDateString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }, [data?.date]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{error || "Erro ao carregar roteiro."}</p>
      </div>
    );
  }

  const lineupEntries = Object.entries(data.lineup || {});

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* Gradiente de fundo */}
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(ellipse at 25% 20%, hsl(var(--primary) / 0.18) 0%, transparent 55%),
                       radial-gradient(ellipse at 80% 70%, hsl(var(--primary) / 0.08) 0%, transparent 55%)`,
        }}
      />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8 sm:py-12">
        {/* Cabeçalho */}
        <header className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-primary/15 items-center justify-center mb-4">
            <CalendarDays className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{data.name}</h1>
          {formattedDate && (
            <p className="text-sm text-muted-foreground mt-1 capitalize">{formattedDate}</p>
          )}
          {data.description && (
            <p className="text-sm text-muted-foreground mt-3 max-w-md mx-auto">{data.description}</p>
          )}
          {totalSeconds > 0 && (
            <div className="inline-flex items-center gap-1.5 mt-4 text-xs font-medium text-muted-foreground bg-accent/40 px-3 py-1.5 rounded-full">
              <Clock className="h-3.5 w-3.5" />
              Duração estimada: {formatDuration(totalSeconds)}
            </div>
          )}
        </header>

        {/* Roteiro */}
        <section className="mb-10">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Roteiro</h2>
          {data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum item no roteiro.</p>
          ) : (
            <div className="space-y-2">
              {data.items.map((it, idx) => {
                if (it.type === "block") {
                  return (
                    <div
                      key={`block-${idx}`}
                      className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium text-sm">{it.title}</p>
                          {it.kind && it.kind !== "moment" && (
                            <span className="text-[10px] font-medium uppercase tracking-wider text-primary/80">{it.kind}</span>
                          )}
                        </div>
                        {!!it.duration_min && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                            <Clock className="h-3 w-3" /> {it.duration_min} min
                          </span>
                        )}
                      </div>
                      {it.notes && (
                        <p className="text-xs text-muted-foreground mt-2 italic whitespace-pre-wrap">{it.notes}</p>
                      )}
                    </div>
                  );
                }

                const isOpen = openSong === idx;
                const hasDetail = !!(it.cifra_text || it.lyrics_text);
                return (
                  <div
                    key={`song-${idx}`}
                    className="rounded-2xl border border-border/50 bg-card/60 backdrop-blur overflow-hidden"
                  >
                    <button
                      type="button"
                      disabled={!hasDetail}
                      onClick={() => setOpenSong(isOpen ? null : idx)}
                      className="w-full flex items-center gap-3 p-4 text-left"
                    >
                      <div className="h-9 w-9 rounded-lg bg-accent/60 flex items-center justify-center shrink-0">
                        <Music className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{it.title}</p>
                        {it.artist && <p className="text-xs text-muted-foreground truncate">{it.artist}</p>}
                      </div>
                      {it.key && (
                        <span className="text-[11px] font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-md shrink-0">
                          {it.key}
                        </span>
                      )}
                      {hasDetail && (
                        <ChevronDown
                          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      )}
                    </button>

                    {it.notes && (
                      <p className="text-xs text-muted-foreground px-4 pb-3 -mt-1 italic whitespace-pre-wrap">{it.notes}</p>
                    )}

                    {isOpen && hasDetail && (
                      <div className="border-t border-border/50 px-4 py-3 bg-background/40">
                        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-foreground/90 overflow-x-auto max-w-full">
                          {it.cifra_text || it.lyrics_text}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Escala */}
        {lineupEntries.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Escala
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {lineupEntries.map(([instrument, names]) => (
                <div key={instrument} className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur p-3">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{instrument}</p>
                  <div className="space-y-0.5">
                    {names.map((n, i) => (
                      <p key={i} className="text-sm font-medium truncate">{n}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="text-center pt-4">
          <p className="text-xs text-muted-foreground/60">Feito com +Louvor</p>
        </footer>
      </div>
    </div>
  );
}
