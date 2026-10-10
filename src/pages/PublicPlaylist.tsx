import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogToolbar } from "@/components/ui/dialog";
import { ToolbarButton } from "@/components/shell/ToolbarButton";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize,
  Minimize,
  Music,
  Video,
  Loader2,
  Search,
  Volume2,
  VolumeX,
  MessageSquareQuote,
  Shuffle,
  Download,
  X,
  Sun,
  Moon,
  ListMusic,
} from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { applyAppearance, isAppearanceDark, paintTheme } from "@/lib/appearance";
import { openYouTubeExternally, usesExternalYouTube } from "@/lib/youtubePlayback";

interface PlaylistSong {
  id: string;
  title: string;
  artist: string | null;
  cover_url: string | null;
  audio_url: string | null;
  media_url: string | null;
  lyrics_text: string | null;
  key_current: string | null;
}

interface PlaylistData {
  name: string;
  audio_access?: "team_only";
  songs: PlaylistSong[];
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export default function PublicPlaylist() {
  const externalVideo = usesExternalYouTube();
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PlaylistData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showLyricsDialog, setShowLyricsDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isShuffle, setIsShuffle] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const { canInstall, install } = usePWAInstall();
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ytPlayerRef = useRef<any>(null);
  const ytIntervalRef = useRef<number | null>(null);

  // Save playlist URL so PWA opens here
  const handleInstall = async () => {
    localStorage.setItem("pwa_start_url", `/playlist/${token}`);
    const accepted = await install();
    if (!accepted) {
      localStorage.removeItem("pwa_start_url");
    }
  };

  const currentSong = data?.songs[currentIndex] ?? null;

  const filteredSongs = useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.songs;
    const q = searchQuery.toLowerCase();
    return data.songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artist && s.artist.toLowerCase().includes(q))
    );
  }, [data, searchQuery]);

  const videoId = currentSong?.media_url
    ? extractYouTubeId(currentSong.media_url)
    : null;
  const hasVideoOption = !!videoId;
  const hasAudioOption = !!currentSong?.audio_url;
  const isVideoMode = !externalVideo && showVideo && hasVideoOption;
  const hasLyrics = !!currentSong?.lyrics_text;

  // Fetch playlist data
  useEffect(() => {
    if (!token) return;
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-playlist?token=${token}`;
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
        setError("Playlist não encontrada.");
        setLoading(false);
      });
  }, [token]);

  // Audio time updates
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };
    const onEnded = () => {
      if (!data) return;
      if (isShuffle) {
        const r = Math.floor(Math.random() * data.songs.length);
        setCurrentIndex(r !== currentIndex ? r : (r + 1) % data.songs.length);
      } else if (currentIndex < data.songs.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        setIsPlaying(false);
      }
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onTime);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onTime);
      audio.removeEventListener("ended", onEnded);
    };
  }, [currentIndex, data, isShuffle]);

  // Volume sync
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Load YouTube IFrame API
  useEffect(() => {
    if (externalVideo || !hasVideoOption) return;
    if ((window as any).YT) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, [externalVideo, hasVideoOption]);

  // Create/update YT player
  useEffect(() => {
    if (!isVideoMode || !videoId) {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      return;
    }

    const createPlayer = () => {
      if (ytPlayerRef.current) {
        try { ytPlayerRef.current.destroy(); } catch {}
        ytPlayerRef.current = null;
      }
      ytPlayerRef.current = new (window as any).YT.Player("yt-player", {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          enablejsapi: 1,
          playsinline: 1,
        },
        events: {
          onReady: (e: any) => {
            e.target.setVolume((isMuted ? 0 : volume) * 100);
            e.target.playVideo();
            setIsPlaying(true);
          },
          onStateChange: (e: any) => {
            const YT = (window as any).YT;
            if (e.data === YT.PlayerState.ENDED) {
              if (data && isShuffle) {
                const r = Math.floor(Math.random() * data.songs.length);
                setCurrentIndex(r !== currentIndex ? r : (r + 1) % data.songs.length);
              } else if (data && currentIndex < data.songs.length - 1) {
                setCurrentIndex((i) => i + 1);
              } else {
                setIsPlaying(false);
              }
            }
            if (e.data === YT.PlayerState.PLAYING) setIsPlaying(true);
            if (e.data === YT.PlayerState.PAUSED) setIsPlaying(false);
          },
        },
      });
    };

    if ((window as any).YT && (window as any).YT.Player) {
      createPlayer();
    } else {
      (window as any).onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {
      if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
    };
  }, [videoId, isVideoMode, currentIndex, data]);

  // YT volume sync
  useEffect(() => {
    const p = ytPlayerRef.current;
    if (p && typeof p.setVolume === "function") {
      p.setVolume((isMuted ? 0 : volume) * 100);
    }
  }, [volume, isMuted]);

  // YT progress polling
  useEffect(() => {
    if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
    if (!isVideoMode || !isPlaying) return;
    ytIntervalRef.current = window.setInterval(() => {
      const p = ytPlayerRef.current;
      if (p && typeof p.getCurrentTime === "function") {
        setProgress(p.getCurrentTime());
        setDuration(p.getDuration() || 0);
      }
    }, 500);
    return () => {
      if (ytIntervalRef.current) clearInterval(ytIntervalRef.current);
    };
  }, [isVideoMode, isPlaying]);

  // Reset showVideo on song change
  useEffect(() => {
    setShowVideo(false);
  }, [currentIndex]);

  // Auto-play on song change — always autoplay
  useEffect(() => {
    if (!currentSong) return;
    setProgress(0);
    setDuration(0);

    if (isVideoMode) {
      const p = ytPlayerRef.current;
      if (p && videoId && typeof p.loadVideoById === "function") {
        p.loadVideoById(videoId);
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (!currentSong.audio_url) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setIsPlaying(false);
      return;
    }

    audio.src = currentSong.audio_url;
    audio.load();
    audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
  }, [currentSong?.id, currentSong?.audio_url, isVideoMode, videoId]);

  const togglePlay = useCallback(() => {
    if (externalVideo && videoId && !currentSong?.audio_url) {
      openYouTubeExternally(videoId);
      return;
    }
    if (videoId && !currentSong?.audio_url && !isVideoMode) {
      setShowVideo(true);
      return;
    }
    if (!isVideoMode && !currentSong?.audio_url) return;
    if (isVideoMode) {
      const p = ytPlayerRef.current;
      if (!p) return;
      if (isPlaying) {
        p.pauseVideo();
      } else {
        p.playVideo();
      }
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        if (!audio.src && currentSong?.audio_url) {
          audio.src = currentSong.audio_url;
          audio.load();
        }
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
    }
  }, [externalVideo, videoId, isVideoMode, isPlaying, currentSong?.audio_url]);

  const seek = useCallback(
    (val: number[]) => {
      const t = val[0];
      if (isVideoMode) {
        ytPlayerRef.current?.seekTo(t, true);
      } else if (audioRef.current) {
        audioRef.current.currentTime = t;
      }
      setProgress(t);
    },
    [isVideoMode]
  );

  const prev = () => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  };
  const next = () => {
    if (!data) return;
    if (isShuffle) {
      const randomIndex = Math.floor(Math.random() * data.songs.length);
      setCurrentIndex(randomIndex !== currentIndex ? randomIndex : (randomIndex + 1) % data.songs.length);
    } else if (currentIndex < data.songs.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Tema: começa no do sistema (classe .dark aplicada em main.tsx); o botão troca só nesta página.
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  // Depois que o usuário escolhe o tema no botão, a escolha vale até sair da página.
  const userPickedTheme = useRef(false);
  const isDarkRef = useRef(isDark);
  isDarkRef.current = isDark;

  useEffect(() => {
    const scheme = window.matchMedia?.("(prefers-color-scheme: dark)");
    const follow = () => {
      if (userPickedTheme.current) {
        // main.tsx já reaplicou o tema do sistema no <html>; mantém a escolha manual.
        paintTheme(isDarkRef.current);
        return;
      }
      setIsDark(isAppearanceDark());
    };
    scheme?.addEventListener?.("change", follow);
    return () => scheme?.removeEventListener?.("change", follow);
  }, []);

  // Theme mode — ao sair, devolve a Aparência escolhida pelo usuário (lib/appearance).
  useEffect(() => {
    paintTheme(isDark);
    return () => {
      applyAppearance();
    };
  }, [isDark]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" aria-label="Carregando" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <ListMusic className="h-[52px] w-[52px] text-label-tertiary" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-title3 text-foreground">{error || "Erro ao carregar playlist."}</p>
      </div>
    );
  }

  const openSongList = () => {
    setSearchQuery("");
    setShowSearchDialog(true);
  };
  // Botões da barra inferior (estilo Música): só o símbolo; ligado = preenchimento cinza.
  const toolButton =
    "grid h-11 w-11 place-items-center rounded-full text-muted-foreground transition-colors duration-200 hover:text-foreground disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none";
  const transportButton =
    "grid h-14 w-14 place-items-center rounded-full text-foreground transition-transform duration-200 active:scale-90 active:bg-fill-tertiary disabled:pointer-events-none disabled:opacity-30 motion-reduce:transition-none";
  const artworkSize = "w-[min(100%,22rem,calc(100dvh-23rem))] md:w-[min(100%,26rem,calc(100dvh-24rem))]";

  return (
    <div
      ref={containerRef}
      className="relative flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground"
    >
      {/* Barra: nome da playlist + ações em vidro */}
      <header className="relative z-10 flex items-center gap-2 px-4 pb-2 pt-[max(env(safe-area-inset-top),12px)] min-[430px]:px-5">
        <div className="min-w-0 flex-1 px-0.5">
          <p className="text-footnote text-muted-foreground">Playlist</p>
          <h1 className="truncate text-headline">{data.name}</h1>
        </div>
        <ToolbarButton
          icon={<Search />}
          onClick={openSongList}
          aria-label="Buscar músicas"
          title="Buscar músicas"
        />
        <ToolbarButton
          icon={isDark ? <Sun /> : <Moon />}
          onClick={() => { userPickedTheme.current = true; setIsDark(!isDark); }}
          aria-label={isDark ? "Tema claro" : "Tema escuro"}
          title={isDark ? "Tema claro" : "Tema escuro"}
        />
      </header>

      {/* Main content - centered cover/video */}
      <div className="relative z-0 flex min-h-0 flex-1 flex-col items-center justify-center px-6 min-[430px]:px-8">
        {isVideoMode && videoId ? (
          <div className="relative w-full max-w-3xl">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <div
                id="yt-player"
                className="absolute inset-0 overflow-hidden rounded-[20px] shadow-[0_24px_60px_-18px_var(--lg-shadow)]"
              />
              <div className="absolute inset-0 z-10" />
            </div>
          </div>
        ) : currentSong?.cover_url ? (
          <img
            src={currentSong.cover_url}
            alt={currentSong.title}
            className={`${artworkSize} aspect-square rounded-[20px] object-cover shadow-[0_24px_60px_-18px_var(--lg-shadow)] transition-transform duration-500 [transition-timing-function:cubic-bezier(0.3,1.25,0.45,1)] motion-reduce:transition-none ${
              isPlaying ? "scale-100" : "scale-[0.88]"
            }`}
          />
        ) : (
          <div
            className={`${artworkSize} grid aspect-square place-items-center rounded-[20px] bg-fill-tertiary transition-transform duration-500 [transition-timing-function:cubic-bezier(0.3,1.25,0.45,1)] motion-reduce:transition-none ${
              isPlaying ? "scale-100" : "scale-[0.88]"
            }`}
          >
            <Music className="h-20 w-20 text-label-tertiary" strokeWidth={1.75} aria-hidden="true" />
          </div>
        )}
      </div>

      {/* Transport — estilo "Tocando agora" do Música */}
      <footer className="relative z-10 px-6 pb-[max(env(safe-area-inset-bottom),12px)] pt-4 min-[430px]:px-8">
        <div className="mx-auto max-w-md">
          {/* Song info */}
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-title3">{currentSong?.title ?? "—"}</p>
              {currentSong?.artist && (
                <p className="truncate text-body text-muted-foreground">{currentSong.artist}</p>
              )}
            </div>
            <span className="shrink-0 pb-0.5 text-footnote tabular-nums text-muted-foreground">
              {currentIndex + 1} / {data.songs.length}
            </span>
          </div>

          {data.audio_access === "team_only" && (
            <p className="mt-3 text-footnote text-muted-foreground">
              Áudios restritos aos integrantes da equipe.{' '}
              <Link to="/" className="underline underline-offset-2">Acessar o +Louvor</Link>
            </p>
          )}

          {/* Progress bar — cápsula fina que engrossa ao arrastar */}
          <SliderPrimitive.Root
            value={[progress]}
            onValueChange={seek}
            max={duration || 1}
            step={0.5}
            disabled={!hasAudioOption && !isVideoMode}
            aria-label="Posição da música"
            className="group relative -mb-2.5 mt-2.5 flex h-11 w-full touch-none select-none items-center"
          >
            <SliderPrimitive.Track className="relative h-[7px] grow overflow-hidden rounded-full bg-fill transition-[height] duration-200 group-active:h-3 motion-reduce:transition-none">
              <SliderPrimitive.Range className="absolute h-full bg-foreground/70" />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              aria-label="Posição da música"
              className="relative block h-4 w-4 rounded-full bg-foreground opacity-0 shadow-[0_1px_4px_var(--lg-shadow)] transition-opacity group-active:opacity-100 focus-visible:opacity-100 before:absolute before:-inset-3.5"
            />
          </SliderPrimitive.Root>
          <div className="mt-1 flex justify-between text-caption2 tabular-nums text-muted-foreground">
            <span>{formatTime(progress)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Playback controls */}
          <div className="mt-3 flex items-center justify-center gap-8">
            <button
              type="button"
              className={transportButton}
              onClick={prev}
              disabled={currentIndex === 0}
              aria-label="Música anterior"
            >
              <SkipBack className="h-8 w-8" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="grid h-[68px] w-[68px] place-items-center rounded-full bg-prominent text-prominent-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_8px_20px_-8px_var(--lg-shadow)] transition-transform duration-200 active:scale-95 motion-reduce:transition-none"
              onClick={togglePlay}
              disabled={!hasAudioOption && !hasVideoOption}
              aria-label={externalVideo && videoId && !hasAudioOption ? "Abrir no YouTube" : isPlaying ? "Pausar" : "Reproduzir"}
            >
              {isPlaying ? (
                <Pause className="h-8 w-8" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
              ) : (
                <Play className="ml-1 h-8 w-8" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className={transportButton}
              onClick={next}
              disabled={!data || currentIndex >= data.songs.length - 1}
              aria-label="Próxima música"
            >
              <SkipForward className="h-8 w-8" fill="currentColor" strokeWidth={1.5} aria-hidden="true" />
            </button>
          </div>

          {/* Volume group */}
          <div className="mt-3 hidden items-center gap-2 md:flex">
            <button
              type="button"
              className={toolButton}
              onClick={() => setIsMuted(!isMuted)}
              aria-label={isMuted || volume === 0 ? "Ativar som" : "Silenciar"}
              title={isMuted || volume === 0 ? "Ativar som" : "Silenciar"}
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
              ) : (
                <Volume2 className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
              )}
            </button>
            <Slider
              value={[isMuted ? 0 : volume]}
              onValueChange={(v) => {
                setVolume(v[0]);
                if (v[0] > 0) setIsMuted(false);
              }}
              max={1}
              step={0.01}
              className="flex-1"
              aria-label="Volume"
            />
            <Volume2 className="mx-3 h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
          </div>

          {/* Barra inferior: letra, vídeo/áudio, aleatório, tela cheia, lista */}
          <div className="mt-3 flex items-center justify-around">
            <button
              type="button"
              className={toolButton}
              disabled={!hasLyrics}
              onClick={() => setShowLyricsDialog(true)}
              title="Letra"
              aria-label="Letra"
            >
              <MessageSquareQuote className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
            </button>

            {hasVideoOption && (
              <button
                type="button"
                className={toolButton}
                onClick={() => {
                  if (externalVideo && videoId) {
                    audioRef.current?.pause();
                    setIsPlaying(false);
                    openYouTubeExternally(videoId);
                    return;
                  }
                  // Stop current playback
                  if (isVideoMode) {
                    try { ytPlayerRef.current?.pauseVideo(); } catch {}
                  } else {
                    audioRef.current?.pause();
                  }
                  setProgress(0);
                  setDuration(0);
                  // Toggle mode — autoplay effect will handle starting playback
                  setIsPlaying(true);
                  setShowVideo(!showVideo);
                }}
                title={externalVideo ? "Ver vídeo no YouTube" : showVideo ? "Ver áudio" : "Ver vídeo"}
                aria-label={externalVideo ? "Ver vídeo no YouTube" : showVideo ? "Ver áudio" : "Ver vídeo"}
              >
                {showVideo ? <Music className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" /> : <Video className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />}
              </button>
            )}

            <button
              type="button"
              className={`${toolButton} ${isShuffle ? "bg-fill-secondary !text-foreground" : ""}`}
              onClick={() => setIsShuffle(!isShuffle)}
              title="Ordem aleatória"
              aria-label="Ordem aleatória"
              aria-pressed={isShuffle}
            >
              <Shuffle className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
            </button>

            <button
              type="button"
              className={toolButton}
              onClick={toggleFullscreen}
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              aria-label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
              {isFullscreen ? (
                <Minimize className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
              ) : (
                <Maximize className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              className={toolButton}
              onClick={openSongList}
              title="Lista de músicas"
              aria-label="Lista de músicas"
            >
              <ListMusic className="h-[22px] w-[22px]" strokeWidth={2} aria-hidden="true" />
            </button>
          </div>
        </div>
      </footer>

      {/* Search dialog — folha com busca e lista agrupada */}
      <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
        <DialogContent className="max-h-[85dvh] sm:max-w-md">
          <DialogToolbar title="Músicas" />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nome da música ou artista..."
              aria-label="Buscar música"
              className="h-10 rounded-full pl-9"
              autoFocus
            />
          </div>
          <div className="-mx-1 max-h-[55dvh] overflow-y-auto overscroll-contain px-1">
            {filteredSongs.length > 0 ? (
              <div className="overflow-hidden rounded-card bg-card">
                {filteredSongs.map((song, idx) => {
                  const originalIndex = data.songs.findIndex((s) => s.id === song.id);
                  const isCurrent = originalIndex === currentIndex;
                  return (
                    <button
                      key={song.id}
                      onClick={() => {
                        setCurrentIndex(originalIndex);
                        setSearchQuery("");
                        setShowSearchDialog(false);
                      }}
                      aria-current={isCurrent ? "true" : undefined}
                      className={`relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left transition-colors active:bg-fill-tertiary ${
                        idx > 0 ? "before:absolute before:left-[52px] before:right-0 before:top-0 before:border-t before:border-separator" : ""
                      }`}
                    >
                      <span className="w-6 shrink-0 text-center text-subhead tabular-nums text-muted-foreground">
                        {isCurrent && isPlaying ? (
                          <Volume2 className="inline h-4 w-4 text-primary" strokeWidth={2.25} aria-label="Tocando" />
                        ) : (
                          originalIndex + 1
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-body ${isCurrent ? "font-semibold" : ""}`}>{song.title}</span>
                        {song.artist && (
                          <span className="block truncate text-subhead text-muted-foreground">{song.artist}</span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 py-8 text-center">
                <Search className="h-7 w-7 text-label-tertiary" strokeWidth={2} aria-hidden="true" />
                <p className="text-body text-muted-foreground">Nenhuma música encontrada</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lyrics dialog */}
      <Dialog open={showLyricsDialog} onOpenChange={setShowLyricsDialog}>
        <DialogContent className="max-h-[88dvh] sm:max-w-lg">
          <DialogToolbar title={currentSong?.title ?? "Letra"} />
          <div className="max-h-[70dvh] overflow-y-auto overscroll-contain px-1">
            {currentSong?.lyrics_text ? (
              <pre className="whitespace-pre-wrap pb-4 font-sans text-body text-foreground">
                {currentSong.lyrics_text}
              </pre>
            ) : (
              <p className="py-8 text-center text-body text-muted-foreground">
                Letra não disponível
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* PWA Install Banner — cartão flutuante no topo (estilo notificação) */}
      {canInstall && !installDismissed && (
        <div className="fixed inset-x-2 top-[calc(max(env(safe-area-inset-top),12px)+56px)] z-50 animate-in fade-in slide-in-from-top-2 duration-300 sm:inset-x-4">
          <div className="mx-auto flex max-w-sm items-center gap-3 rounded-card bg-card p-3 pl-3.5 shadow-[0_18px_40px_-12px_var(--lg-shadow)] ring-1 ring-separator">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-prominent">
              <Music className="h-5 w-5 text-prominent-foreground" strokeWidth={2.25} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-headline">Instalar +Louvor</p>
              <p className="text-footnote text-muted-foreground">Abra direto nesta playlist</p>
            </div>
            <Button size="sm" className="shrink-0 gap-1.5" onClick={handleInstall}>
              <Download aria-hidden="true" />
              Instalar
            </Button>
            <button
              onClick={() => setInstallDismissed(true)}
              aria-label="Dispensar"
              className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fill-tertiary text-muted-foreground before:absolute before:-inset-2"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2.75} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}
