import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Type,
  Shuffle,
  Download,
  X,
  Sun,
  Moon,
} from "lucide-react";
import { usePWAInstall } from "@/hooks/usePWAInstall";

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
  songs: PlaylistSong[];
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export default function PublicPlaylist() {
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
  const hasBothOptions = hasVideoOption && hasAudioOption;
  const isVideoMode = showVideo && hasVideoOption;
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
    if (!hasVideoOption) return;
    if ((window as any).YT) return;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }, [hasVideoOption]);

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
  }, [isVideoMode, isPlaying, currentSong?.audio_url]);

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

  const [isDark, setIsDark] = useState(true);

  // Theme mode
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    return () => {
      document.documentElement.classList.remove("dark");
    };
  }, [isDark]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{error || "Erro ao carregar playlist."}</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-screen flex flex-col bg-background text-foreground overflow-hidden relative"
    >
      {/* Radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(ellipse at 30% 40%, hsl(var(--primary) / 0.15) 0%, transparent 60%), 
                       radial-gradient(ellipse at 70% 60%, hsl(var(--primary) / 0.08) 0%, transparent 60%)`,
        }}
      />

      {/* Header - minimal */}
      <header className="relative z-10 flex items-center justify-between px-4 py-3">
        <h1 className="text-sm font-medium text-muted-foreground truncate">{data.name}</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => setIsDark(!isDark)}
            title={isDark ? "Tema claro" : "Tema escuro"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearchQuery("");
              setShowSearchDialog(true);
            }}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content - centered cover/video */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center overflow-hidden px-6">
        {isVideoMode && videoId ? (
          <div className="relative w-full" style={{ maxWidth: 640 }}>
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <div
                id="yt-player"
                className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl"
              />
              <div className="absolute inset-0 z-10" />
            </div>
          </div>
        ) : currentSong?.cover_url ? (
          <img
            src={currentSong.cover_url}
            alt={currentSong.title}
            className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-2xl object-cover"
            style={{
              boxShadow: "0 25px 80px -12px hsl(var(--primary) / 0.35), 0 10px 40px -8px rgba(0,0,0,0.5)",
            }}
          />
        ) : (
          <div
            className="w-64 h-64 md:w-80 md:h-80 lg:w-96 lg:h-96 rounded-2xl bg-accent/50 flex items-center justify-center"
            style={{
              boxShadow: "0 25px 80px -12px hsl(var(--primary) / 0.35), 0 10px 40px -8px rgba(0,0,0,0.5)",
            }}
          >
            <Music className="h-20 w-20 text-muted-foreground/40" />
          </div>
        )}

        {/* Song info */}
        <div className="mt-8 text-center w-full max-w-md">
          <p className="text-xl md:text-2xl font-bold truncate">
            {currentSong?.title ?? "—"}
          </p>
          {currentSong?.artist && (
            <p className="text-base text-muted-foreground truncate mt-1">
              {currentSong.artist}
            </p>
          )}
        </div>
      </div>

      {/* Transport bar - Spotify style */}
      <footer className="relative z-10 px-4 pb-4 pt-2 md:px-8">
        <div className="max-w-2xl mx-auto space-y-3">
          {/* Row 1: Action buttons */}
          <div className="flex items-center justify-between">
            {/* Left: shuffle + song counter */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-full transition-colors ${isShuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setIsShuffle(!isShuffle)}
                title="Ordem aleatória"
              >
                <Shuffle className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground">
                {currentIndex + 1} / {data.songs.length}
              </span>
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-1">
              {hasBothOptions && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => {
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
                  title={showVideo ? "Ver Áudio" : "Ver Vídeo"}
                >
                  {showVideo ? <Music className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className={`h-8 w-8 rounded-full ${hasLyrics ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/30"}`}
                disabled={!hasLyrics}
                onClick={() => setShowLyricsDialog(true)}
                title="Letra"
              >
                <Type className="h-4 w-4" />
              </Button>

              {/* Volume group */}
              <div className="hidden md:flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() => setIsMuted(!isMuted)}
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  onValueChange={(v) => {
                    setVolume(v[0]);
                    if (v[0] > 0) setIsMuted(false);
                  }}
                  max={1}
                  step={0.01}
                  className="w-20"
                />
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                onClick={toggleFullscreen}
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4" />
                ) : (
                  <Maximize className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Row 2: Playback controls */}
          <div className="flex items-center justify-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-foreground hover:text-foreground hover:scale-105 transition-transform"
              onClick={prev}
              disabled={currentIndex === 0}
            >
              <SkipBack className="h-5 w-5" fill="currentColor" />
            </Button>
            <Button
              size="icon"
              className="h-12 w-12 rounded-full bg-foreground text-background hover:bg-foreground/90 hover:scale-105 transition-transform"
              onClick={togglePlay}
            >
              {isPlaying ? (
                <Pause className="h-6 w-6" fill="currentColor" />
              ) : (
                <Play className="h-6 w-6 ml-0.5" fill="currentColor" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-foreground hover:text-foreground hover:scale-105 transition-transform"
              onClick={next}
              disabled={!data || currentIndex >= data.songs.length - 1}
            >
              <SkipForward className="h-5 w-5" fill="currentColor" />
            </Button>
          </div>

          {/* Row 3: Progress bar */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground w-10 text-right font-mono tabular-nums">
              {formatTime(progress)}
            </span>
            <Slider
              value={[progress]}
              onValueChange={seek}
              max={duration || 1}
              step={0.5}
              className="flex-1"
            />
            <span className="text-[11px] text-muted-foreground w-10 font-mono tabular-nums">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </footer>

      {/* Search dialog */}
      <Dialog open={showSearchDialog} onOpenChange={setShowSearchDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Buscar música</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nome da música ou artista..."
                className="pl-10"
                autoFocus
              />
            </div>
            <ScrollArea className="max-h-72">
              <div className="space-y-0.5">
                {filteredSongs.map((song) => {
                  const originalIndex = data.songs.findIndex((s) => s.id === song.id);
                  return (
                    <button
                      key={song.id}
                      onClick={() => {
                        setCurrentIndex(originalIndex);
                        setSearchQuery("");
                        setShowSearchDialog(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                        originalIndex === currentIndex
                          ? "bg-primary/15 text-primary font-medium"
                          : "hover:bg-accent text-foreground"
                      }`}
                    >
                      <span className="w-6 text-center text-muted-foreground shrink-0 text-xs">
                        {originalIndex === currentIndex && isPlaying ? (
                          <Music className="h-3.5 w-3.5 inline" />
                        ) : (
                          originalIndex + 1
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium">{song.title}</p>
                        {song.artist && (
                          <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
                {filteredSongs.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhuma música encontrada
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lyrics dialog */}
      <Dialog open={showLyricsDialog} onOpenChange={setShowLyricsDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Type className="h-4 w-4" />
              {currentSong?.title ?? "Letra"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-2">
            {currentSong?.lyrics_text ? (
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90 pb-4">
                {currentSong.lyrics_text}
              </pre>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                Letra não disponível
              </p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* PWA Install Banner */}
      {canInstall && !installDismissed && (
        <div className="fixed bottom-24 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 duration-300">
          <div className="rounded-2xl bg-card/90 backdrop-blur-lg p-4 flex items-center gap-3 max-w-sm mx-auto shadow-lg border border-border/50">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Music className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Instalar +Louvor</p>
              <p className="text-xs text-muted-foreground">Abra direto nesta playlist</p>
            </div>
            <Button
              size="sm"
              className="rounded-xl gap-1.5 shrink-0"
              onClick={handleInstall}
            >
              <Download className="h-3.5 w-3.5" />
              Instalar
            </Button>
            <button
              onClick={() => setInstallDismissed(true)}
              className="p-1 rounded-lg hover:bg-accent transition-colors shrink-0"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden audio element */}
      <audio ref={audioRef} preload="metadata" />
    </div>
  );
}
