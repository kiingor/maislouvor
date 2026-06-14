import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { splitSegments, extractChords } from "@/data/chordDictionary";
import { ChordDiagram } from "@/components/ChordDiagram";
import { KaraokeSegment } from "@/components/KaraokeSegment";
import { TrackMixer } from "@/components/TrackMixer";
import { LoopPanel } from "@/components/LoopPanel";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  Play,
  Pause,
  SkipForward,
  Sun,
  Moon,
  Music,
  X,
  LogOut,
  Circle,
  RotateCcw,
  Save,
  List,
  Pencil,
  Plus,
  Minus,
  SlidersHorizontal,
  Gauge,
  Repeat,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

type Instrument = "violao" | "guitarra" | "guitarra_worship" | "voz";

interface PresentationPrefs {
  speed: number;
  instrument: Instrument;
  countdownSeconds: number;
  theme: "dark" | "light";
  fontSize: number;
  cifraMode: "padrao" | "transicao";
}

const DEFAULT_PREFS: PresentationPrefs = {
  speed: 8,
  instrument: "violao",
  countdownSeconds: 5,
  theme: "dark",
  fontSize: 1,
  cifraMode: "padrao",
};

const SYNC_LEAD_SECONDS = 0.35;

// Font size steps
const FONT_SIZES = [
  { label: "PP", scale: 0.5 },
  { label: "P", scale: 0.7 },
  { label: "M", scale: 1 },
  { label: "G", scale: 1.3 },
  { label: "GG", scale: 1.6 },
  { label: "XG", scale: 2 },
];

function loadPrefs(): PresentationPrefs {
  try {
    const raw = localStorage.getItem("louvor-presentation-prefs");
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_PREFS };
}

function savePrefs(p: PresentationPrefs) {
  localStorage.setItem("louvor-presentation-prefs", JSON.stringify(p));
}

function getYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&\s]+)/);
  return match ? match[1] : null;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/** Strip chord-only lines from a segment, keeping section tags and lyrics */
function stripChordsFromSegment(text: string): string {
  const chordToken = /[A-G][#b]?(?:m|M|maj|min|dim|aug|sus[24]?|add\d+|[2-9]|1[0-3]|6\/9)*(?:\/[A-G][#b]?)?/;
  const chordLineRegex = new RegExp(`^\\s*(?:${chordToken.source}\\s*)+$`);
  const sectionTagRegex = /^\s*\[[^\]]+\]\s*$/;
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (sectionTagRegex.test(trimmed)) return true;
      if (chordLineRegex.test(trimmed)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Inline timestamp editor panel */
function TimestampEditor({
  segments,
  timestamps,
  activeSegIdx,
  isDark,
  onSave,
  onClose,
  onJump,
  subtleText,
  accentBg,
  borderSubtle,
  hoverBg,
}: {
  segments: string[];
  timestamps: number[];
  activeSegIdx: number;
  isDark: boolean;
  onSave: (ts: number[]) => void;
  onClose: () => void;
  onJump: (i: number, time: number) => void;
  subtleText: string;
  accentBg: string;
  borderSubtle: string;
  hoverBg: string;
}) {
  const [editableTs, setEditableTs] = useState<number[]>([...timestamps]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const hasChanges = editableTs.some((t, i) => Math.abs(t - timestamps[i]) > 0.01);

  useEffect(() => {
    setEditableTs([...timestamps]);
  }, [timestamps]);

  const parseTimeInput = (val: string): number | null => {
    const match = val.match(/^(\d+):(\d{1,2})(?:\.(\d{1,2}))?$/);
    if (match) {
      const m = parseInt(match[1]);
      const s = parseInt(match[2]);
      const ms = match[3] ? parseInt(match[3].padEnd(2, "0")) / 100 : 0;
      return m * 60 + s + ms;
    }
    const num = parseFloat(val);
    return isFinite(num) && num >= 0 ? num : null;
  };

  const startEdit = (i: number) => {
    setEditingIdx(i);
    setSaveError(null);
    const t = editableTs[i];
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    setEditValue(`${m}:${s.toString().padStart(2, "0")}`);
  };

  const commitEdit = () => {
    if (editingIdx === null) return;
    const parsed = parseTimeInput(editValue);
    if (parsed !== null) {
      const newTs = [...editableTs];
      newTs[editingIdx] = parsed;
      setEditableTs(newTs);
    }
    setEditingIdx(null);
  };

  const handleSave = () => {
    for (let i = 1; i < editableTs.length; i++) {
      if (editableTs[i] < editableTs[i - 1]) {
        setSaveError(`Parte ${i + 1} (${formatTime(editableTs[i])}) está antes da parte ${i} (${formatTime(editableTs[i - 1])}). Ajuste os tempos para ficarem em ordem crescente.`);
        return;
      }
    }
    setSaveError(null);
    onSave(editableTs);
  };

  const segmentLabel = (seg: string) => {
    const firstLine = seg.split("\n").find(l => l.trim()) || "";
    return firstLine.trim().slice(0, 50);
  };

  return (
    <div className={`border-t ${borderSubtle} ${isDark ? "bg-black/40" : "bg-white/60"} backdrop-blur-sm max-h-64 overflow-y-auto`}>
      <div className="flex items-center justify-between px-4 py-2 sticky top-0 z-10" style={{ background: "inherit" }}>
        <span className="text-sm font-semibold flex items-center gap-2">
          <List className="h-4 w-4" />
          Timestamps ({timestamps.length} partes)
        </span>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Button size="sm" className="rounded-xl gap-1.5 h-7 text-xs px-3" onClick={handleSave}>
              <Save className="h-3.5 w-3.5" /> Salvar
            </Button>
          )}
          <button onClick={onClose} className={`p-1.5 rounded-lg ${hoverBg}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {saveError && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          {saveError}
        </div>
      )}
      <div className="px-4 pb-3 space-y-1">
        {segments.map((seg, i) => {
          const isOutOfOrder = i > 0 && editableTs[i] < editableTs[i - 1];
          return (
            <div
              key={i}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors cursor-pointer ${
                i === activeSegIdx ? "bg-primary/10 border border-primary/30" : `border border-transparent`
              }`}
              onClick={() => onJump(i, editableTs[i])}
            >
              <span className={`w-7 text-center font-bold text-xs ${subtleText}`}>{i + 1}</span>
              {editingIdx === i ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitEdit();
                    if (e.key === "Escape") setEditingIdx(null);
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-20 text-center font-mono text-sm tabular-nums rounded-lg px-2 py-1.5 border border-primary bg-transparent focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); startEdit(i); }}
                  className={`w-20 text-center font-mono text-sm tabular-nums rounded-lg px-2 py-1.5 ${accentBg} transition-colors flex items-center justify-center gap-1 ${isOutOfOrder ? "ring-1 ring-amber-500/50 text-amber-500" : ""}`}
                  title="Clique para editar"
                >
                  {formatTime(editableTs[i])}
                  <Pencil className="h-3 w-3 opacity-40" />
                </button>
              )}
              <span className="flex-1 truncate text-xs">{segmentLabel(seg)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Presentation({ source = "culto" }: { source?: "culto" | "repertorio" }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Where the back button / Escape returns to, depending on the source list
  const backPath = source === "repertorio" ? `/app/repertorios/${id}` : `/app/cultos/${id}`;

  const [prefs, setPrefs] = useState<PresentationPrefs>(loadPrefs);
  const [songIdx, setSongIdx] = useState(0);
  const [segIdx, setSegIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioVolume, setAudioVolume] = useState(1);
  const [showSpeedSelector, setShowSpeedSelector] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>();
  const playTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownTimer = useRef<ReturnType<typeof setInterval>>();
  const timelineRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const segmentTimestampsRef = useRef<number[] | null>(null);
  const segmentsLengthRef = useRef(0);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSpeed, setRecordingSpeed] = useState(1.5);
  const [showTimestampEditor, setShowTimestampEditor] = useState(false);
  const [showMobileSongList, setShowMobileSongList] = useState(false);
  const [showMixer, setShowMixer] = useState(false);
  const isRecordingRef = useRef(false);
  const recordedTimestampsRef = useRef<number[]>([]);

  // Scroll speed per song (for transição mode)
  const [scrollSpeed, setScrollSpeed] = useState(30); // pixels per second
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);
  const scrollSpeedSaveTimer = useRef<ReturnType<typeof setTimeout>>();

  // Loop / Rehearsal mode
  const [showLoopPanel, setShowLoopPanel] = useState(false);
  const [activeLoop, setActiveLoop] = useState<any>(null);
  const [currentRepetition, setCurrentRepetition] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const activeLoopRef = useRef<any>(null);
  const currentRepetitionRef = useRef(0);
  const isMobile = useIsMobile();

  const isDark = prefs.theme === "dark";

  // Fullscreen for PWA standalone mode
  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    if (isStandalone && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Font size helpers
  const fontSizeIndex = useMemo(() => {
    const idx = FONT_SIZES.findIndex(f => f.scale === prefs.fontSize);
    return idx >= 0 ? idx : 1;
  }, [prefs.fontSize]);

  const increaseFontSize = useCallback(() => {
    const nextIdx = Math.min(fontSizeIndex + 1, FONT_SIZES.length - 1);
    updatePrefs({ fontSize: FONT_SIZES[nextIdx].scale });
  }, [fontSizeIndex]);

  const decreaseFontSize = useCallback(() => {
    const nextIdx = Math.max(fontSizeIndex - 1, 0);
    updatePrefs({ fontSize: FONT_SIZES[nextIdx].scale });
  }, [fontSizeIndex]);

  // Fetch songs — from the culto lineup or from the repertório, depending on source
  const { data: songs = [], isLoading } = useQuery({
    queryKey: ["presentation-songs", source, id],
    queryFn: async () => {
      if (source === "repertorio") {
        const { data } = await supabase
          .from("repertorio_songs")
          .select("sort_order, songs(*)")
          .eq("repertorio_id", id!)
          .order("sort_order");
        return (data || []).map((rs: any) => rs.songs).filter(Boolean);
      }
      const { data } = await supabase
        .from("culto_songs")
        .select("sort_order, songs(*)")
        .eq("culto_id", id!)
        .order("sort_order");
      return (data || []).map((rs: any) => rs.songs).filter(Boolean);
    },
    enabled: !!id,
  });

  // Cover signed URLs
  const [coverUrls, setCoverUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = songs.filter((s: any) => s.cover_path).map((s: any) => s.cover_path);
    if (!paths.length) return;
    Promise.all(
      paths.map(async (p: string) => {
        const { data } = await supabase.storage.from("covers").createSignedUrl(p, 3600);
        return [p, data?.signedUrl || ""] as const;
      })
    ).then((entries) => setCoverUrls(Object.fromEntries(entries)));
  }, [songs]);

  const currentSong = songs[songIdx] as any;
  const currentSongId = currentSong?.id;

  // Query all loops for current song (for timeline markers)
  const { data: allLoops = [] } = useQuery({
    queryKey: ["all-my-loops", currentSongId],
    queryFn: async () => {
      if (!currentSongId) return [];
      const { data: profileId } = await supabase.rpc("get_my_profile_id");
      if (!profileId) return [];
      const { data } = await supabase
        .from("song_loop_points" as any)
        .select("*")
        .eq("song_id", currentSongId)
        .eq("profile_id", profileId)
        .order("sort_order");
      return (data ?? []) as any[];
    },
    enabled: !!currentSongId,
  });

  useEffect(() => {
    if (!currentSong) return;
    const saved = (currentSong as any).scroll_speed;
    if (saved && typeof saved === "number" && saved > 0) {
      setScrollSpeed(saved);
    } else {
      setScrollSpeed(30); // default
    }
    setIsAutoScrolling(false);
  }, [currentSongId]);

  // Save scroll_speed to DB (debounced)
  const saveScrollSpeed = useCallback((speed: number) => {
    if (!currentSongId) return;
    clearTimeout(scrollSpeedSaveTimer.current);
    scrollSpeedSaveTimer.current = setTimeout(async () => {
      await supabase
        .from("songs")
        .update({ scroll_speed: speed } as any)
        .eq("id", currentSongId);
    }, 1000);
  }, [currentSongId]);

  const handleScrollSpeedChange = useCallback((speed: number) => {
    setScrollSpeed(speed);
    saveScrollSpeed(speed);
  }, [saveScrollSpeed]);

  // Fetch tracks for current song
  const { data: songTracks = [] } = useQuery({
    queryKey: ["presentation-tracks", currentSongId],
    queryFn: async () => {
      const { data } = await supabase
        .from("song_tracks" as any)
        .select("*")
        .eq("song_id", currentSongId)
        .order("sort_order");
      return (data ?? []) as any[];
    },
    enabled: !!currentSongId,
  });

  // Track mixer state
  const [trackStates, setTrackStates] = useState<{ id: string; track_name: string; volume: number; muted: boolean; solo: boolean }[]>([]);
  const trackAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [trackUrls, setTrackUrls] = useState<Record<string, string>>({});

  // Initialize track states when tracks change
  useEffect(() => {
    setTrackStates(
      songTracks.map((t: any) => ({
        id: t.id,
        track_name: t.track_name,
        volume: 1,
        muted: false,
        solo: false,
      }))
    );
  }, [songTracks]);

  // Get signed URLs for tracks
  useEffect(() => {
    if (!songTracks.length) { setTrackUrls({}); return; }
    Promise.all(
      songTracks.map(async (t: any) => {
        const { data } = await supabase.storage.from("audio").createSignedUrl(t.audio_path, 3600);
        return [t.id, data?.signedUrl || ""] as const;
      })
    ).then((entries) => setTrackUrls(Object.fromEntries(entries)));
  }, [songTracks]);

  // Create/destroy track Audio elements
  useEffect(() => {
    const map = trackAudiosRef.current;
    for (const [id, audio] of map) {
      if (!trackUrls[id]) {
        audio.pause();
        audio.src = "";
        map.delete(id);
      }
    }
    for (const [id, url] of Object.entries(trackUrls)) {
      if (!url) continue;
      if (!map.has(id)) {
        const audio = new Audio(url);
        audio.volume = 1;
        map.set(id, audio);
      }
    }
    return () => {
      for (const [, audio] of map) {
        audio.pause();
        audio.src = "";
      }
      map.clear();
    };
  }, [trackUrls]);

  // Sync track volumes/mute based on trackStates
  useEffect(() => {
    const map = trackAudiosRef.current;
    const hasSolo = trackStates.some((t) => t.solo);
    for (const state of trackStates) {
      const audio = map.get(state.id);
      if (!audio) continue;
      audio.volume = state.volume;
      audio.muted = state.muted || (hasSolo && !state.solo);
    }
  }, [trackStates]);

  const hasTracks = songTracks.length > 0;
  const isVoz = prefs.instrument === "voz";
  const isTransicao = !isVoz; // always transição mode for instruments

  const activeText = useMemo(() => {
    if (isVoz && currentSong?.lyrics_text) return currentSong.lyrics_text;
    return currentSong?.cifra_text || "";
  }, [isVoz, currentSong?.lyrics_text, currentSong?.cifra_text]);

  const segments = useMemo(
    () => (activeText ? splitSegments(activeText) : []),
    [activeText]
  );
  const currentSegment = segments[segIdx] || "";
  const chords = useMemo(() => extractChords(currentSegment), [currentSegment]);
  const isLastSegment = segIdx >= segments.length - 1;
  const isLastSong = songIdx >= songs.length - 1;

  const mediaUrl = currentSong?.media_url || "";
  const youtubeId = mediaUrl ? getYouTubeId(mediaUrl) : null;
  const hasMedia = !!mediaUrl;

  const hasAudioFile = !!currentSong?.audio_path;
  const rawTimestamps: number[] | null = currentSong?.segment_timestamps || null;

  const timestampKey = isVoz ? "voz" : "instruments";

  const segmentTimestamps: number[] | null = useMemo(() => {
    if (!rawTimestamps) return null;
    let tsArray: unknown[] | null = null;
    if (typeof rawTimestamps === "object" && !Array.isArray(rawTimestamps)) {
      tsArray = (rawTimestamps as Record<string, unknown>)[timestampKey] as unknown[] | null;
    } else if (Array.isArray(rawTimestamps)) {
      tsArray = timestampKey === "instruments" ? rawTimestamps : null;
    }
    if (!tsArray || !Array.isArray(tsArray)) return null;
    if (tsArray.length !== segments.length) return null;
    const ts = tsArray.map(Number).filter(Number.isFinite);
    if (ts.length !== segments.length) return null;
    for (let i = 1; i < ts.length; i++) {
      if (ts[i] <= ts[i - 1]) return null;
    }
    return ts;
  }, [rawTimestamps, segments.length, timestampKey]);

  const hasSync = hasAudioFile && segmentTimestamps && segmentTimestamps.length === segments.length;

  const showTimestampEditorRef = useRef(false);

  useEffect(() => {
    segmentTimestampsRef.current = segmentTimestamps;
    segmentsLengthRef.current = segments.length;
    isRecordingRef.current = isRecording;
    showTimestampEditorRef.current = showTimestampEditor;
    activeLoopRef.current = activeLoop;
    currentRepetitionRef.current = currentRepetition;
  }, [segmentTimestamps, segments.length, isRecording, showTimestampEditor, activeLoop, currentRepetition]);

  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!currentSong?.audio_path) { setAudioUrl(null); return; }
    supabase.storage.from("audio").createSignedUrl(currentSong.audio_path, 3600).then(({ data }) => {
      setAudioUrl(data?.signedUrl || null);
    });
  }, [currentSong?.audio_path]);

  const syncSegmentWithAudioTime = useCallback((currentTime: number) => {
    if (isRecordingRef.current) return;
    if (showTimestampEditorRef.current) return;
    const ts = segmentTimestampsRef.current;
    const len = segmentsLengthRef.current;
    if (!ts || ts.length !== len || len === 0) return;

    const effectiveTime = Math.max(0, currentTime + SYNC_LEAD_SECONDS);
    let targetIdx = 0;
    for (let i = ts.length - 1; i >= 0; i--) {
      if (effectiveTime >= ts[i]) {
        targetIdx = i;
        break;
      }
    }

    setSegIdx((prev) => (prev === targetIdx ? prev : targetIdx));
  }, []);

  // Helper to sync all track audios with main audio
  const syncTrackAudios = useCallback((action: "play" | "pause" | "seek", time?: number) => {
    const map = trackAudiosRef.current;
    for (const [, audio] of map) {
      if (action === "play") {
        if (time !== undefined) audio.currentTime = time;
        audio.play().catch(() => {});
      } else if (action === "pause") {
        audio.pause();
      } else if (action === "seek" && time !== undefined) {
        audio.currentTime = time;
      }
    }
  }, []);

  useEffect(() => {
    if (!audioUrl) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setAudioPlaying(false);
      setAudioProgress(0);
      setAudioDuration(0);
      return;
    }

    const audio = new Audio(audioUrl);
    audio.volume = hasTracks ? 0 : 1;
    audioRef.current = audio;

    const handleLoadedMetadata = () => setAudioDuration(audio.duration);
    const handleEnded = () => {
      setAudioPlaying(false);
      setAudioProgress(audio.duration);
    };
    const handleTimeUpdate = () => {
      const t = audio.currentTime;
      setAudioProgress(t);
      
      // Loop logic
      const loop = activeLoopRef.current;
      if (loop && t >= loop.end_time) {
        const rep = currentRepetitionRef.current + 1;
        if (loop.repeat_count > 0 && rep > loop.repeat_count) {
          // Finished all repetitions
          setActiveLoop(null);
          setCurrentRepetition(0);
        } else {
          setCurrentRepetition(rep);
          audio.currentTime = loop.start_time;
          // sync tracks too
          const map = trackAudiosRef.current;
          for (const [, trk] of map) {
            trk.currentTime = loop.start_time;
          }
        }
        return;
      }
      
      if (!isTransicao) syncSegmentWithAudioTime(t);
    };
    const handleSeeked = () => {
      const t = audio.currentTime;
      setAudioProgress(t);
      if (!isTransicao) syncSegmentWithAudioTime(t);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("seeked", handleSeeked);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("seeked", handleSeeked);
      audio.pause();
      audio.src = "";
    };
  }, [audioUrl, syncSegmentWithAudioTime, hasTracks, isTransicao]);

  // Sync playbackRate to audio + tracks
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    for (const [, trk] of trackAudiosRef.current) {
      trk.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const handleSelectLoop = useCallback((loop: any) => {
    setActiveLoop(loop);
    setCurrentRepetition(0);
    if (loop && audioRef.current) {
      audioRef.current.currentTime = loop.start_time;
      syncTrackAudios("seek", loop.start_time);
      setAudioProgress(loop.start_time);
    }
  }, [syncTrackAudios]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
  }, []);

  const updatePrefs = useCallback((patch: Partial<PresentationPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (isTransicao) return; // transicao uses auto-scroll, not timer
    if (isRecording) return;
    if (hasSync) return;
    if (!isPlaying || countdown !== null) return;
    playTimer.current = setTimeout(() => {
      if (isLastSegment) {
        setIsPlaying(false);
        if (!isLastSong) {
          setCountdown(prefs.countdownSeconds);
        }
      } else {
        setSegIdx((i) => i + 1);
      }
    }, prefs.speed * 1000);
    return () => clearTimeout(playTimer.current);
  }, [isTransicao, isRecording, isPlaying, segIdx, prefs.speed, isLastSegment, isLastSong, countdown, prefs.countdownSeconds, hasSync]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      goNextSong();
      return;
    }
    countdownTimer.current = setInterval(() => {
      setCountdown((c) => (c !== null ? c - 1 : null));
    }, 1000);
    return () => clearInterval(countdownTimer.current);
  }, [countdown]);

  useEffect(() => {
    if (timelineRef.current) {
      const active = timelineRef.current.querySelector('[data-active="true"]');
      if (active) {
        active.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [segIdx]);

  const goNextSong = useCallback(() => {
    setCountdown(null);
    if (!isLastSong) {
      setSongIdx((i) => i + 1);
      setSegIdx(0);
      setIsPlaying(true);
      setIsAutoScrolling(false);
    }
  }, [isLastSong]);

  const goPrevSegment = useCallback(() => {
    setCountdown(null);
    setSegIdx((i) => Math.max(0, i - 1));
  }, []);

  const goNextSegment = useCallback(() => {
    setCountdown(null);
    if (isLastSegment) {
      setIsPlaying(false);
      if (!isLastSong) setCountdown(prefs.countdownSeconds);
    } else {
      setSegIdx((i) => i + 1);
    }
  }, [isLastSegment, isLastSong, prefs.countdownSeconds]);




  const togglePlay = useCallback(() => {
    setCountdown(null);

    // Play/Pause controls ONLY audio
    if (hasAudioFile && audioRef.current) {
      if (audioPlaying) {
        audioRef.current.pause();
        syncTrackAudios("pause");
        setAudioPlaying(false);
      } else {
        audioRef.current.play();
        syncTrackAudios("play", audioRef.current.currentTime);
        setAudioPlaying(true);
      }
      setIsPlaying((p) => !p);
    } else if (hasTracks && trackAudiosRef.current.size > 0) {
      if (audioPlaying) {
        syncTrackAudios("pause");
        setAudioPlaying(false);
      } else {
        syncTrackAudios("play");
        setAudioPlaying(true);
      }
      setIsPlaying((p) => !p);
    } else {
      // No audio at all — play button toggles segment auto-advance (padrao mode only)
      setIsPlaying((p) => !p);
    }
  }, [hasAudioFile, audioPlaying, syncTrackAudios, hasTracks]);

  const handleVolumeChange = useCallback((v: number) => {
    setAudioVolume(v);
    if (audioRef.current && !hasTracks) audioRef.current.volume = v;
  }, [hasTracks]);

  const startRecording = useCallback(() => {
    if (!audioRef.current || !hasAudioFile) return;
    const audio = audioRef.current;
    audio.currentTime = 0;
    audio.playbackRate = recordingSpeed;
    audio.play();
    setAudioPlaying(true);
    setIsPlaying(true);
    setSegIdx(0);
    recordedTimestampsRef.current = [0];
    setShowSpeedSelector(false);
    requestAnimationFrame(() => setIsRecording(true));
  }, [hasAudioFile, recordingSpeed]);

  const saveRecording = useCallback(async () => {
    if (!audioRef.current || !currentSong) return;
    const timestamps = recordedTimestampsRef.current;
    setIsRecording(false);
    audioRef.current.pause();
    audioRef.current.playbackRate = 1;
    setAudioPlaying(false);
    setIsPlaying(false);

    const existing = (typeof rawTimestamps === "object" && !Array.isArray(rawTimestamps) && rawTimestamps)
      ? rawTimestamps as Record<string, unknown>
      : {};
    const merged = { ...existing, [timestampKey]: timestamps };

    const { error } = await supabase
      .from("songs")
      .update({ segment_timestamps: merged } as any)
      .eq("id", currentSong.id);

    if (error) {
      toast({ title: "Erro ao salvar timestamps", description: error.message, variant: "destructive" });
    } else {
      const label = timestampKey === "voz" ? "voz" : "instrumentos";
      toast({ title: "Gravação salva!", description: `${timestamps.length} segmentos de ${label} sincronizados` });
      queryClient.invalidateQueries({ queryKey: ["presentation-songs", source, id] });
    }
  }, [currentSong?.id, id, toast, queryClient, timestampKey, rawTimestamps]);

  const recordTimestamp = useCallback(async () => {
    if (!isRecording || !audioRef.current) return;
    const currentTime = audioRef.current.currentTime;

    if (segIdx >= segments.length - 1) {
      await saveRecording();
    } else {
      recordedTimestampsRef.current.push(currentTime);
      setSegIdx((i) => i + 1);
    }
  }, [isRecording, segIdx, segments.length, saveRecording]);

  const cancelRecording = useCallback(() => {
    setIsRecording(false);
    recordedTimestampsRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.playbackRate = 1;
      setAudioPlaying(false);
    }
    setIsPlaying(false);
    setSegIdx(0);
  }, []);

  const saveEditedTimestamps = useCallback(async (newTimestamps: number[]) => {
    if (!currentSong) return;
    const existing = (typeof rawTimestamps === "object" && !Array.isArray(rawTimestamps) && rawTimestamps)
      ? rawTimestamps as Record<string, unknown>
      : {};
    const merged = { ...existing, [timestampKey]: newTimestamps };

    const { error } = await supabase
      .from("songs")
      .update({ segment_timestamps: merged } as any)
      .eq("id", currentSong.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Timestamps atualizados!" });
      queryClient.invalidateQueries({ queryKey: ["presentation-songs", source, id] });
    }
  }, [currentSong?.id, id, toast, queryClient, timestampKey, rawTimestamps]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (!isTransicao) {
        if (e.key === "ArrowRight") goNextSegment();
        if (e.key === "ArrowLeft") goPrevSegment();
      }
      if (e.key.toLowerCase() === "n") goNextSong();
      if (e.key === "Escape") navigate(backPath);
      if (e.key === "+" || e.key === "=") increaseFontSize();
      if (e.key === "-") decreaseFontSize();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, goNextSegment, goPrevSegment, goNextSong, navigate, backPath, isRecording, recordTimestamp, cancelRecording, increaseFontSize, decreaseFontSize, isTransicao]);

  useEffect(() => {
    setControlsVisible(true);
  }, []);

  const selectSong = (i: number) => {
    setCountdown(null);
    setIsPlaying(false);
    setIsAutoScrolling(false);
    if (audioRef.current) { audioRef.current.pause(); setAudioPlaying(false); }
    setSongIdx(i);
    setSegIdx(0);
    setShowMediaPlayer(false);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!songs.length) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center gap-4">
        <p className="text-white/60">Nenhuma música neste {source === "repertorio" ? "repertório" : "culto"}.</p>
        <Button variant="outline" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    );
  }

  const themeClasses = isDark
    ? "bg-background text-foreground"
    : "bg-background text-foreground";

  const subtleText = isDark ? "text-white/50" : "text-black/50";
  const borderSubtle = isDark ? "border-white/10" : "border-black/10";
  const hoverBg = isDark ? "hover:bg-white/10" : "hover:bg-black/10";
  const accentBg = isDark ? "bg-white/10" : "bg-black/10";
  const transportBg = isDark ? "bg-black/80" : "bg-white/80";

  const fontScale = prefs.fontSize || 1;

  return (
    <div className={`fixed inset-0 ${themeClasses} ${isDark ? 'dark' : ''} flex flex-col select-none overflow-hidden`}>
      {/* Radial gradient background */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background: `radial-gradient(ellipse at 30% 40%, hsl(var(--primary) / 0.15) 0%, transparent 60%), 
                       radial-gradient(ellipse at 70% 60%, hsl(var(--primary) / 0.08) 0%, transparent 60%)`,
        }}
      />

      {/* Main Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-30 flex flex-col">
          <div className="flex items-center gap-1.5 px-3 py-3">
            <button onClick={() => navigate(backPath)} className={`p-2 rounded-xl ${accentBg} backdrop-blur-sm ${hoverBg} transition-colors`}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => updatePrefs({ theme: isDark ? "light" : "dark" })}
              className={`p-2 rounded-xl ${accentBg} backdrop-blur-sm ${hoverBg} transition-colors`}
              title={isDark ? "Modo claro" : "Modo escuro"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {/* Font size controls */}
            <div className={`flex items-center gap-0.5 rounded-xl ${accentBg} backdrop-blur-sm px-1`}>
              <button
                onClick={decreaseFontSize}
                disabled={fontSizeIndex === 0}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${hoverBg}`}
                title="Diminuir fonte"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className={`text-[10px] font-bold w-6 text-center ${subtleText}`}>{FONT_SIZES[fontSizeIndex].label}</span>
              <button
                onClick={increaseFontSize}
                disabled={fontSizeIndex === FONT_SIZES.length - 1}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${hoverBg}`}
                title="Aumentar fonte"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Cifra mode toggle removed — always transição */}

            {/* Mobile song selector toggle */}
            <button
              onClick={() => setShowMobileSongList((v) => !v)}
              className={`lg:hidden flex items-center gap-1.5 ml-auto px-3 py-1.5 rounded-xl ${accentBg} backdrop-blur-sm ${hoverBg} transition-colors max-w-[45%]`}
            >
              <Music className="h-3.5 w-3.5 shrink-0" />
              <span className="text-[11px] font-medium truncate">{currentSong?.title || "Música"}</span>
              {showMobileSongList ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
            </button>
          </div>

          {/* Mobile collapsible song list */}
          {showMobileSongList && (
            <div className={`lg:hidden mx-3 mb-2 rounded-xl ${isDark ? "bg-black/70" : "bg-white/70"} backdrop-blur-md border ${borderSubtle} max-h-72 overflow-y-auto hide-scrollbar`}>
              {/* Instrument selector — mobile */}
              <div className={`flex flex-col gap-1.5 p-2 border-b ${borderSubtle}`}>
                <div className="flex gap-1.5">
                  {([
                    { key: "violao" as const, label: "Violão" },
                    { key: "guitarra" as const, label: "Guitarra" },
                    { key: "voz" as const, label: "Voz" },
                  ]).map(({ key, label }) => {
                    const isActive = key === "violao"
                      ? prefs.instrument === "violao"
                      : key === "voz"
                      ? prefs.instrument === "voz"
                      : prefs.instrument === "guitarra" || prefs.instrument === "guitarra_worship";
                    return (
                      <button
                        key={key}
                        onClick={() => updatePrefs({ instrument: key })}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${
                          isActive ? "bg-primary text-primary-foreground" : `${accentBg} ${subtleText}`
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                {(prefs.instrument === "guitarra" || prefs.instrument === "guitarra_worship") && (
                  <div className="flex gap-1.5">
                    {([
                      { key: "guitarra" as Instrument, label: "Aberto" },
                      { key: "guitarra_worship" as Instrument, label: "Drive/Worship" },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => updatePrefs({ instrument: key })}
                        className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                          prefs.instrument === key ? "bg-primary/80 text-primary-foreground" : `${accentBg} ${subtleText}`
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Song list */}
              <div className="flex flex-col gap-0.5 p-2">
                {songs.map((s: any, i: number) => (
                  <button
                    key={s.id}
                    onClick={() => { selectSong(i); setShowMobileSongList(false); }}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all text-left ${
                      i === songIdx ? "bg-primary/15 border border-primary/30" : `border border-transparent opacity-70 hover:opacity-100 ${hoverBg}`
                    }`}
                  >
                    <div className="w-7 h-7 rounded-md overflow-hidden shrink-0">
                      {s.cover_path && coverUrls[s.cover_path] ? (
                        <img src={coverUrls[s.cover_path]} alt={s.title} className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full ${accentBg} flex items-center justify-center text-[9px] font-bold ${subtleText}`}>
                          {s.title?.[0]?.toUpperCase() || "♪"}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs font-medium truncate ${i === songIdx ? "" : subtleText}`}>
                      {s.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lateral touch zones — only in padrao mode */}
        {!isTransicao && (
          <>
            <div
              className="absolute left-0 top-0 bottom-0 w-1/4 z-10 cursor-pointer"
              onClick={goPrevSegment}
              aria-label="Segmento anterior"
            />
            <div
              className="absolute right-0 top-0 bottom-0 w-[15%] z-10 cursor-pointer"
              onClick={goNextSegment}
              aria-label="Próximo segmento"
            />
          </>
        )}

        {/* Content Viewer */}
        <div className="flex-1 flex items-center justify-center p-6 lg:p-12 overflow-hidden z-0">
          {countdown !== null ? (
            <div className="text-center space-y-4 animate-in fade-in">
              <p className={`${subtleText} text-lg`}>Próxima música em</p>
              <p className="text-6xl font-bold text-primary tabular-nums">{countdown}</p>
              <p className="text-xl font-medium">{(songs[songIdx + 1] as any)?.title}</p>
              <Button onClick={goNextSong} className="rounded-xl gap-2 mt-4">
                <SkipForward className="h-4 w-4" /> Ir agora
              </Button>
            </div>
          ) : activeText ? (
            <KaraokeSegment
              key={`scroll-${songIdx}-${prefs.cifraMode}`}
              fullText={isVoz && !isTransicao ? stripChordsFromSegment(activeText) : activeText}
              scrollSpeed={scrollSpeed}
              isScrolling={isAutoScrolling}
              onScrollSpeedChange={handleScrollSpeedChange}
              fontScale={fontScale}
              isDark={isDark}
              instrument={prefs.instrument as "violao" | "guitarra" | "guitarra_worship"}
              isVoz={isVoz}
            />
          ) : (
            <p className={subtleText}>Sem cifra disponível para esta música.</p>
          )}
        </div>

        {/* Right Sidebar — Song list (vertical) + Chord Diagrams */}
        {countdown === null && (
          <div className={`hidden lg:flex flex-col ${isVoz ? "w-44" : "w-56"} border-l ${borderSubtle} overflow-y-auto z-20`}>
            {/* Song list — vertical */}
            <div className={`flex flex-col gap-1 p-3 border-b ${borderSubtle}`}>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${subtleText} px-1 mb-1`}>Repertório</span>
              {songs.map((s: any, i: number) => (
                <button
                  key={s.id}
                  onClick={() => selectSong(i)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all text-left ${
                    i === songIdx ? "bg-primary/15 border border-primary/30" : `border border-transparent opacity-60 hover:opacity-100 ${hoverBg}`
                  }`}
                >
                  <div className="w-7 h-7 rounded-md overflow-hidden shrink-0">
                    {s.cover_path && coverUrls[s.cover_path] ? (
                      <img src={coverUrls[s.cover_path]} alt={s.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-full h-full ${accentBg} flex items-center justify-center text-[9px] font-bold ${subtleText}`}>
                        {s.title?.[0]?.toUpperCase() || "♪"}
                      </div>
                    )}
                  </div>
                  <span className={`text-[11px] font-medium truncate ${i === songIdx ? "" : subtleText}`}>
                    {s.title}
                  </span>
                </button>
              ))}
            </div>

            {/* Instrument selector + chords */}
            <div className="flex flex-col p-4 gap-3">
              <div className="flex gap-1.5">
                {([
                  { key: "violao" as const, label: "Violão" },
                  { key: "guitarra" as const, label: "Guitarra" },
                  { key: "voz" as const, label: "Voz" },
                ]).map(({ key, label }) => {
                  const isActive = key === "violao"
                    ? prefs.instrument === "violao"
                    : key === "voz"
                    ? prefs.instrument === "voz"
                    : prefs.instrument === "guitarra" || prefs.instrument === "guitarra_worship";
                  return (
                    <button
                      key={key}
                      onClick={() => updatePrefs({ instrument: key })}
                      className={`flex-1 text-xs font-medium py-1.5 rounded-lg transition-colors ${
                        isActive ? "bg-primary text-primary-foreground" : `${accentBg} ${subtleText}`
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              {(prefs.instrument === "guitarra" || prefs.instrument === "guitarra_worship") && (
                <div className="flex gap-1.5">
                  {([
                    { key: "guitarra" as Instrument, label: "Aberto" },
                    { key: "guitarra_worship" as Instrument, label: "Drive/Worship" },
                  ]).map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => updatePrefs({ instrument: key })}
                      className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                        prefs.instrument === key ? "bg-primary/80 text-primary-foreground" : `${accentBg} ${subtleText}`
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {!isVoz && !isTransicao && chords.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {chords.map((c) => (
                    <ChordDiagram key={c} chord={c} instrument={prefs.instrument as "violao" | "guitarra" | "guitarra_worship"} size={80} />
                  ))}
                </div>
              )}
              {isVoz && (
                <p className={`text-xs ${subtleText} text-center leading-relaxed`}>Modo voz: apenas letra</p>
              )}
            </div>
          </div>
        )}

        {/* Mixer Panel */}
        {showMixer && hasTracks && countdown === null && (
          <div className="order-first h-full shrink-0 pt-14" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <TrackMixer
              tracks={songTracks}
              trackStates={trackStates}
              onTrackStatesChange={setTrackStates}
              isDark={isDark}
              onClose={() => setShowMixer(false)}
            />
          </div>
        )}

        {/* Loop Panel — desktop sidebar */}
        {showLoopPanel && !isMobile && currentSongId && countdown === null && (
          <div className="order-first h-full shrink-0 w-72 pt-14 overflow-hidden" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <LoopPanel
              songId={currentSongId}
              currentTime={audioProgress}
              activeLoopId={activeLoop?.id ?? null}
              currentRepetition={currentRepetition}
              playbackRate={playbackRate}
              onSelectLoop={handleSelectLoop}
              onPlaybackRateChange={handlePlaybackRateChange}
              isDark={isDark}
              onClose={() => setShowLoopPanel(false)}
            />
          </div>
        )}
      </div>

      {/* Loop Panel — mobile drawer */}
      {isMobile && (
        <Drawer open={showLoopPanel && !!currentSongId} onOpenChange={setShowLoopPanel}>
          <DrawerContent className={`max-h-[70vh] ${isDark ? "bg-background" : "bg-background"}`}>
            {currentSongId && (
              <LoopPanel
                songId={currentSongId}
                currentTime={audioProgress}
                activeLoopId={activeLoop?.id ?? null}
                currentRepetition={currentRepetition}
                playbackRate={playbackRate}
                onSelectLoop={handleSelectLoop}
                onPlaybackRateChange={handlePlaybackRateChange}
                isDark={isDark}
                onClose={() => setShowLoopPanel(false)}
              />
            )}
          </DrawerContent>
        </Drawer>
      )}

      {/* Segment Timeline — only in padrao mode */}
      {!isTransicao && !isVoz && segments.length > 1 && countdown === null && (
        <div
          ref={timelineRef}
          className={`flex items-center gap-2 px-4 py-2 overflow-x-auto border-t ${borderSubtle}`}
        >
          {segments.map((seg, i) => {
            const lines = seg.split("\n").filter(l => l.trim()).slice(0, 3);
            const preview = lines.map(l => l.trim().slice(0, 30)).join("\n");
            const ts = segmentTimestamps?.[i];
            const recTs = isRecording && recordedTimestampsRef.current[i] !== undefined
              ? recordedTimestampsRef.current[i]
              : undefined;
            const displayTs = recTs !== undefined ? recTs : ts;
            return (
              <button
                key={i}
                data-active={i === segIdx}
                onClick={() => {
                  if (!isRecording) {
                    setSegIdx(i);
                    setIsPlaying(false);
                    setCountdown(null);
                    if (audioRef.current && displayTs !== undefined) {
                      audioRef.current.currentTime = displayTs;
                      setAudioProgress(displayTs);
                    }
                  }
                }}
                className={`shrink-0 w-36 rounded-lg px-3 py-2 text-left transition-all border ${
                  i === segIdx
                    ? "bg-primary text-primary-foreground shadow-md scale-105 border-primary"
                    : i < segIdx
                    ? `${accentBg} ${subtleText} border-transparent`
                    : `${isDark ? "bg-white/5" : "bg-black/5"} ${subtleText} border-transparent ${hoverBg}`
                }`}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] font-semibold uppercase tracking-wider opacity-60">
                    Parte {i + 1}
                  </span>
                  {displayTs !== undefined && (
                    <span className={`text-[9px] tabular-nums font-mono ${
                      i === segIdx ? "opacity-80" : "text-primary opacity-70"
                    }`}>
                      {formatTime(displayTs)}
                    </span>
                  )}
                </div>
                <pre className="font-mono text-[10px] leading-tight whitespace-pre-wrap line-clamp-3 overflow-hidden">
                  {preview}
                </pre>
              </button>
            );
          })}
        </div>
      )}

      {/* Timestamp Editor Panel — only in padrao mode */}
      {!isTransicao && showTimestampEditor && hasSync && !isRecording && (
        <TimestampEditor
          segments={segments}
          timestamps={segmentTimestamps!}
          activeSegIdx={segIdx}
          isDark={isDark}
          onSave={saveEditedTimestamps}
          onClose={() => setShowTimestampEditor(false)}
          onJump={(i, time) => {
            setSegIdx(i);
            if (audioRef.current) {
              audioRef.current.currentTime = time;
              setAudioProgress(time);
            }
          }}
          subtleText={subtleText}
          accentBg={accentBg}
          borderSubtle={borderSubtle}
          hoverBg={hoverBg}
        />
      )}

      {/* Transport Controls — 2 rows on mobile, 1 row on desktop */}
      <div
        className={`flex flex-wrap md:flex-nowrap items-center gap-x-2 gap-y-1 px-4 py-2 border-t ${borderSubtle} ${transportBg} backdrop-blur-sm transition-opacity duration-300 z-50 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Play button */}
        <Button variant="ghost" size="icon" className={`rounded-xl shrink-0 ${hoverBg}`} onClick={togglePlay}>
          {isPlaying || audioPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </Button>

        {/* Audio progress */}
        {hasAudioFile ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className={`text-[10px] ${subtleText} tabular-nums whitespace-nowrap`}>
              {formatTime(audioProgress)}
            </span>
            <div
              className={`flex-1 h-2 md:h-3 rounded-full ${accentBg} cursor-pointer relative`}
              onClick={(e) => {
                if (!audioRef.current || !audioDuration) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                const nextTime = Math.max(0, Math.min(audioDuration, pct * audioDuration));
                audioRef.current.currentTime = nextTime;
                syncTrackAudios("seek", nextTime);
                setAudioProgress(nextTime);
                if (!isTransicao) syncSegmentWithAudioTime(nextTime);
              }}
            >
              {/* Loop markers on progress bar */}
              {audioDuration > 0 && allLoops.map((loop, i) => {
                const isActive = activeLoop?.id === loop.id;
                const colors = [
                  "bg-blue-400/30",
                  "bg-green-400/30",
                  "bg-amber-400/30",
                  "bg-pink-400/30",
                  "bg-purple-400/30",
                  "bg-cyan-400/30",
                ];
                const activeColors = [
                  "bg-blue-500/50",
                  "bg-green-500/50",
                  "bg-amber-500/50",
                  "bg-pink-500/50",
                  "bg-purple-500/50",
                  "bg-cyan-500/50",
                ];
                return (
                  <div
                    key={loop.id}
                    className={`absolute top-0 bottom-0 rounded-full pointer-events-none ${
                      isActive ? activeColors[i % activeColors.length] : colors[i % colors.length]
                    } ${isActive ? "ring-1 ring-primary" : ""}`}
                    style={{
                      left: `${(loop.start_time / audioDuration) * 100}%`,
                      width: `${((loop.end_time - loop.start_time) / audioDuration) * 100}%`,
                    }}
                  />
                );
              })}
              <div
                className="h-full rounded-full bg-primary transition-all relative z-10"
                style={{ width: `${audioDuration ? (audioProgress / audioDuration) * 100 : 0}%` }}
              />
            </div>
            <span className={`text-[10px] ${subtleText} tabular-nums whitespace-nowrap`}>
              {formatTime(audioDuration)}
            </span>
            {!hasTracks && (
              <div className="hidden sm:flex items-center gap-1 ml-1">
                <Music className={`h-3.5 w-3.5 ${subtleText}`} />
                <Slider
                  value={[audioVolume]}
                  onValueChange={([v]) => handleVolumeChange(v)}
                  min={0}
                  max={1}
                  step={0.05}
                  className="w-16"
                />
              </div>
            )}
          </div>
        ) : null}

        {/* Mixer button */}
        {hasTracks && (
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl gap-1 shrink-0 ${showMixer ? "text-primary" : ""} ${hoverBg}`}
            onClick={() => setShowMixer((v) => !v)}
            title="Mixer de tracks"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[10px]">Mixer</span>
          </Button>
        )}

        {/* Ensaio / Loop button */}
        {hasAudioFile && (
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl gap-1 shrink-0 ${showLoopPanel ? "text-primary bg-primary/10" : ""} ${hoverBg}`}
            onClick={() => setShowLoopPanel((v) => !v)}
            title="Modo Ensaio"
          >
            <Repeat className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[10px]">Ensaio</span>
          </Button>
        )}

        {/* Media button */}
        {hasMedia && !hasAudioFile && (
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-xl shrink-0 ${hoverBg} ${showMediaPlayer ? "text-primary" : ""}`}
            onClick={() => {
              if (youtubeId) {
                setShowMediaPlayer((v) => !v);
              } else {
                window.open(mediaUrl, "_blank");
              }
            }}
            title="Tocar música"
          >
            <Music className="h-4 w-4" />
          </Button>
        )}

        {/* Edit timestamps */}
        {!isTransicao && hasSync && (
          <Button
            variant="ghost"
            size="sm"
            className={`rounded-xl gap-1 shrink-0 ${showTimestampEditor ? "text-primary" : ""} ${hoverBg}`}
            onClick={() => {
              setShowTimestampEditor((v) => {
                const next = !v;
                if (next) {
                  setIsPlaying(false);
                  if (audioRef.current) { audioRef.current.pause(); setAudioPlaying(false); }
                }
                return next;
              });
            }}
            title="Editar timestamps"
          >
            <List className="h-3.5 w-3.5" />
            <span className="hidden sm:inline text-[10px]">Editar</span>
          </Button>
        )}

        {/* Next song */}
        {!isLastSong && (
          <Button variant="outline" size="sm" className={`rounded-xl gap-1 shrink-0 border ${borderSubtle} ${hoverBg}`} onClick={goNextSong}>
            <SkipForward className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Próxima</span>
          </Button>
        )}

        {/* Auto-scroll + speed — wraps to row 2 on mobile only */}
        <div className="flex items-center gap-2 w-full md:w-auto md:ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-xl shrink-0 h-8 w-8 ${isAutoScrolling ? "text-primary bg-primary/10" : ""} ${hoverBg}`}
            onClick={() => setIsAutoScrolling((v) => !v)}
            title={isAutoScrolling ? "Parar rolagem" : "Iniciar rolagem"}
          >
            <ChevronsDown className={`h-4 w-4 ${isAutoScrolling ? "animate-bounce" : ""}`} />
          </Button>
          <Gauge className={`h-3.5 w-3.5 ${subtleText} shrink-0 hidden md:block`} />
          <span className={`text-[10px] ${subtleText} whitespace-nowrap`}>Lento</span>
          <Slider
            value={[scrollSpeed]}
            onValueChange={([v]) => handleScrollSpeedChange(v)}
            min={5}
            max={120}
            step={1}
            className="flex-1 md:w-32 md:flex-initial"
          />
          <span className={`text-[10px] ${subtleText} whitespace-nowrap`}>Rápido</span>
          <span className={`text-[10px] font-mono ${subtleText} w-10 text-right hidden md:inline`}>{scrollSpeed}px/s</span>
        </div>
      </div>

      {/* YouTube Mini Player */}
      {showMediaPlayer && youtubeId && (
        <div className="fixed bottom-24 right-4 z-50 rounded-xl overflow-hidden shadow-2xl border border-white/20">
          <div className="relative">
            <button
              onClick={() => setShowMediaPlayer(false)}
              className="absolute -top-2 -right-2 z-10 bg-black/80 text-white rounded-full p-1"
            >
              <X className="h-3 w-3" />
            </button>
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&controls=1`}
              width="280"
              height="158"
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="block"
            />
          </div>
        </div>
      )}

      {/* Click outside to close speed selector */}
      {showSpeedSelector && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSpeedSelector(false)} />
      )}
    </div>
  );
}
