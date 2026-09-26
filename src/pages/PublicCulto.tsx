import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Loader2,
  Music,
  Clock,
  CalendarX2,
  Users,
  ChevronDown,
  Timer,
} from "lucide-react";
import { ScrollEdge } from "@/components/shell/ScrollEdge";

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
  // Título grande → título inline na barra quando ele passa por baixo dela (HIG > Navigation bars).
  // O tema segue o sistema (classe .dark aplicada em main.tsx); esta página não força mais o escuro.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      frame = 0;
      const title = titleRef.current;
      const bar = barRef.current;
      setScrolled(window.scrollY > 2);
      if (!title || !bar) return;
      setCollapsed(title.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom + 4);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    check();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [data]);

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <CalendarX2 className="h-[52px] w-[52px] text-label-tertiary" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-title3 text-foreground">{error || "Erro ao carregar roteiro."}</p>
      </div>
    );
  }

  const lineupEntries = Object.entries(data.lineup || {});
  const rowSeparator = "before:absolute before:right-0 before:top-0 before:border-t before:border-separator";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Barra superior: título inline quando o grande sai de vista + borda de rolagem progressiva */}
      <ScrollEdge position="top" active={scrolled} className="fixed top-0 h-[calc(env(safe-area-inset-top)+64px)]" />
      <div
        ref={barRef}
        className="fixed inset-x-0 top-0 z-40 flex h-[calc(env(safe-area-inset-top)+44px)] items-end justify-center px-12 pb-2.5"
        aria-hidden={!collapsed}
      >
        <p className={`inline-title truncate text-headline ${collapsed ? "on" : ""}`}>{data.name}</p>
      </div>

      <div className="mx-auto max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+32px)] pt-[calc(env(safe-area-inset-top)+52px)] min-[430px]:px-5">
        {/* Cabeçalho */}
        <header className="mb-7 px-0.5">
          <h1 ref={titleRef} className="text-large-title break-words">{data.name}</h1>
          {formattedDate && (
            <p className="mt-0.5 text-subhead text-muted-foreground first-letter:uppercase">{formattedDate}</p>
          )}
          {data.description && (
            <p className="mt-3 text-body text-muted-foreground">{data.description}</p>
          )}
          {totalSeconds > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-fill-tertiary py-1 pl-2 pr-2.5 text-footnote font-medium">
              <Clock className="h-[15px] w-[15px] text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
              Duração estimada: {formatDuration(totalSeconds)}
            </div>
          )}
        </header>

        {/* Roteiro */}
        <section className="mb-7">
          <h2 className="mx-1 mb-2 text-title3">Roteiro</h2>
          {data.items.length === 0 ? (
            <div className="flex items-center gap-3 rounded-card bg-card p-4">
              <Music className="h-7 w-7 shrink-0 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
              <p className="text-body text-muted-foreground">Nenhum item no roteiro.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-card bg-card">
              {data.items.map((it, idx) => {
                const separator = idx > 0 ? `${rowSeparator} before:left-[58px]` : "";
                if (it.type === "block") {
                  const detail = [it.kind && it.kind !== "moment" ? it.kind : null, it.duration_min ? `${it.duration_min} min` : null]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <div key={`block-${idx}`} className={`relative flex min-h-[52px] items-start gap-3 px-4 py-2.5 ${separator}`}>
                      <span className="mt-px grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
                        <Timer className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1 py-0.5">
                        <p className="break-words text-body">{it.title}</p>
                        {detail && <p className="text-subhead text-muted-foreground">{detail}</p>}
                        {it.notes && (
                          <p className="mt-1 whitespace-pre-wrap text-footnote text-muted-foreground">{it.notes}</p>
                        )}
                      </div>
                    </div>
                  );
                }

                const isOpen = openSong === idx;
                const hasDetail = !!(it.cifra_text || it.lyrics_text);
                return (
                  <div key={`song-${idx}`} className={`relative ${separator}`}>
                    <button
                      type="button"
                      disabled={!hasDetail}
                      aria-expanded={hasDetail ? isOpen : undefined}
                      onClick={() => setOpenSong(isOpen ? null : idx)}
                      className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left transition-colors enabled:active:bg-fill-tertiary disabled:cursor-default"
                    >
                      <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
                        <Music className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-body">{it.title}</span>
                        {it.artist && <span className="block truncate text-subhead text-muted-foreground">{it.artist}</span>}
                      </span>
                      {it.key && (
                        <span className="shrink-0 rounded-full bg-fill-tertiary px-2 py-0.5 text-footnote font-semibold tabular-nums">
                          {it.key}
                        </span>
                      )}
                      {hasDetail && (
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-label-tertiary transition-transform duration-200 motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}
                          strokeWidth={2.75}
                          aria-hidden="true"
                        />
                      )}
                    </button>

                    {it.notes && (
                      <p className="-mt-1.5 whitespace-pre-wrap pb-2.5 pl-[58px] pr-4 text-footnote text-muted-foreground">{it.notes}</p>
                    )}

                    {isOpen && hasDetail && (
                      <div className="mx-3 mb-3 overflow-x-auto rounded-[16px] bg-grouped-tertiary px-3.5 py-3">
                        <pre className={`${it.cifra_text ? "whitespace-pre" : "whitespace-pre-wrap"} font-mono text-footnote text-foreground`}>
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
          <section className="mb-7">
            <h2 className="mx-1 mb-2 flex items-center gap-2 text-title3">
              <Users className="h-5 w-5 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" /> Escala
            </h2>
            <div className="overflow-hidden rounded-card bg-card">
              {lineupEntries.map(([instrument, names], idx) => (
                <div key={instrument} className={`relative px-4 py-2.5 ${idx > 0 ? `${rowSeparator} before:left-4` : ""}`}>
                  <p className="text-footnote text-muted-foreground">{instrument}</p>
                  <p className="text-body">{names.join(", ")}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <footer className="pt-2 text-center">
          <p className="text-footnote text-muted-foreground">Feito com +Louvor</p>
        </footer>
      </div>
    </div>
  );
}
