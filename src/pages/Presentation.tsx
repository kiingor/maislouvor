import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { splitSegments, extractChords } from "@/data/chordDictionary";
import { ChordDiagram } from "@/components/ChordDiagram";
import { KaraokeSegment } from "@/components/KaraokeSegment";
import { TrackMixer } from "@/components/TrackMixer";
import * as Tone from "tone";
import { detectKeyFromUrl, parseKeyName, DetectedKey } from "@/lib/detectKey";
import { LoopPanel } from "@/components/LoopPanel";
import { LoopDrawer } from "@/components/LoopDrawer";
import type { LoopRange } from "@/lib/loopTime";
import type { Database } from "@/integrations/supabase/types";
import { Metronome } from "@/components/Metronome";
import { transposeCifra, capoSuggestion, transposeKeyName as transposeKeyLabel, semitonesBetweenKeys } from "@/lib/chordpro";
import { useTeam } from "@/contexts/TeamContext";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { isVocalRole } from "@/data/instruments";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  Play,
  Pause,
  Loader2,
  SkipForward,
  SkipBack,
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
  Timer,
  Mic,
  Guitar,
} from "lucide-react";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

type LoopPoint = Database["public"]["Tables"]["song_loop_points"]["Row"];

type Instrument = "violao" | "guitarra" | "guitarra_worship" | "voz";

interface PresentationPrefs {
  speed: number;
  instrument: Instrument;
  countdownSeconds: number;
  theme: "dark" | "light";
  fontSize: number;
  /** Extra scale factor applied to chord lines, relative to the lyric font size. */
  chordFontScale: number;
  cifraMode: "padrao" | "transicao";
}

const DEFAULT_PREFS: PresentationPrefs = {
  speed: 8,
  instrument: "violao",
  countdownSeconds: 5,
  theme: "dark",
  fontSize: 1,
  chordFontScale: 1,
  cifraMode: "padrao",
};

// Independent chord-size steps (multiplied into the chord line font size)
const CHORD_FONT_SCALES = [
  { label: "P", scale: 0.75 },
  { label: "M", scale: 1 },
  { label: "G", scale: 1.3 },
  { label: "GG", scale: 1.7 },
];

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

// Signed URLs viram parte da chave de cache HTTP do navegador: regenerar a URL a
// cada visita re-baixa o MP3 inteiro. Reaproveitar a mesma URL (válida por 1h)
// deixa o navegador servir o áudio do cache de disco.
const signedUrlCache = new Map<string, { url: string; expires: number }>();
async function getSignedAudioUrl(path: string): Promise<string | null> {
  const hit = signedUrlCache.get(path);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data } = await supabase.storage.from("audio").createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  signedUrlCache.set(path, { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
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

// Polished Cifra/Voz segmented control (used in the top bar on mobile/tablet and the sidebar on desktop)
function ModeToggle({
  instrument,
  onChange,
  isDark,
  className = "",
}: {
  instrument: string;
  onChange: (key: "violao" | "voz") => void;
  isDark: boolean;
  className?: string;
}) {
  const track = isDark ? "bg-white/10" : "bg-black/[0.06]";
  const inactive = isDark ? "text-white/55" : "text-black/50";
  const opts: { key: "violao" | "voz"; label: string }[] = [
    { key: "violao", label: "Cifra" },
    { key: "voz", label: "Voz" },
  ];
  return (
    <div className={`inline-flex items-center rounded-full p-0.5 ${track} backdrop-blur-sm ${className}`}>
      {opts.map((o) => {
        const active = o.key === "voz" ? instrument === "voz" : instrument !== "voz";
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex-1 px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
              active ? "bg-primary text-primary-foreground shadow-sm" : `${inactive} hover:opacity-80`
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// Função (Cantor / Instrumentista) segmented control. Cantor = letra grande (Voz),
// Instrumentista = cifra + diagramas.
function RoleToggle({
  role,
  onChange,
  isDark,
  className = "",
}: {
  role: "cantor" | "instrumentista" | null;
  onChange: (role: "cantor" | "instrumentista") => void;
  isDark: boolean;
  className?: string;
}) {
  const track = isDark ? "bg-white/10" : "bg-black/[0.06]";
  const inactive = isDark ? "text-white/55" : "text-black/50";
  const opts: { key: "cantor" | "instrumentista"; label: string; Icon: typeof Mic }[] = [
    { key: "cantor", label: "Cantor", Icon: Mic },
    { key: "instrumentista", label: "Instr.", Icon: Guitar },
  ];
  return (
    <div className={`inline-flex items-center rounded-full p-0.5 ${track} backdrop-blur-sm ${className}`} title="Visão por função">
      {opts.map((o) => {
        const active = role === o.key;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
              active ? "bg-primary text-primary-foreground shadow-sm" : `${inactive} hover:opacity-80`
            }`}
          >
            <o.Icon className="h-3 w-3" />
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
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
  const updatePrefs = useCallback((patch: Partial<PresentationPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);
  const [songIdx, setSongIdx] = useState(0);
  const [segIdx, setSegIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showMediaPlayer, setShowMediaPlayer] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  // Mostra spinner no play enquanto as faixas/áudio ainda estão bufferizando.
  const [buffering, setBuffering] = useState(false);
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
  // Minimizar a barra de transporte (esconde funções + scroll, deixa só play/timeline)
  const [transportMinimized, setTransportMinimized] = useState(false);

  // Loop / Rehearsal mode
  const [showLoopPanel, setShowLoopPanel] = useState(false);
  const [activeLoop, setActiveLoop] = useState<LoopPoint | null>(null);
  const [currentRepetition, setCurrentRepetition] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const activeLoopRef = useRef<LoopPoint | null>(null);
  const previewRangeRef = useRef<LoopRange | null>(null);
  const [isPreviewingLoop, setIsPreviewingLoop] = useState(false);
  const currentRepetitionRef = useRef(0);
  const isMobile = useIsMobile();

  // Metronome / click panel
  const [showMetronome, setShowMetronome] = useState(false);
  // When armed, the click track starts/stops together with the song's audio.
  const [clickArmed, setClickArmed] = useState(false);
  // Measured height of the (absolute) top bar, so content can clear it.
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarH, setTopBarH] = useState(0);

  // Roteiro (culto) — unified list of songs + blocks. blockIdx !== null means a
  // "momento" (non-song) is showing in the center. autoRoteiro advances by item duration.
  const [blockIdx, setBlockIdx] = useState<number | null>(null);
  const [autoRoteiro, setAutoRoteiro] = useState(false);
  const [blockRemaining, setBlockRemaining] = useState(0);
  const itemTimer = useRef<ReturnType<typeof setTimeout>>();
  const blockTickTimer = useRef<ReturnType<typeof setInterval>>();

  // Function-based view (Cantor / Instrumentista) — null until resolved from member instruments
  const { profileId, currentTeam } = useTeam();
  const [roleView, setRoleView] = useState<"cantor" | "instrumentista" | null>(null);

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

  // Independent chord-size helpers
  const chordFontIndex = useMemo(() => {
    const idx = CHORD_FONT_SCALES.findIndex(f => f.scale === (prefs.chordFontScale ?? 1));
    return idx >= 0 ? idx : 1;
  }, [prefs.chordFontScale]);

  const increaseChordFont = useCallback(() => {
    const nextIdx = Math.min(chordFontIndex + 1, CHORD_FONT_SCALES.length - 1);
    updatePrefs({ chordFontScale: CHORD_FONT_SCALES[nextIdx].scale });
  }, [chordFontIndex]);

  const decreaseChordFont = useCallback(() => {
    const nextIdx = Math.max(chordFontIndex - 1, 0);
    updatePrefs({ chordFontScale: CHORD_FONT_SCALES[nextIdx].scale });
  }, [chordFontIndex]);

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
        // Preserve the lineup sort_order on each song so the roteiro can merge with blocks.
        return (data || [])
          .filter((rs: any) => rs.songs)
          .map((rs: any) => ({ ...rs.songs, __sort_order: rs.sort_order ?? 0 }));
      }
      const { data } = await supabase
        .from("culto_songs")
        .select("sort_order, songs(*)")
        .eq("culto_id", id!)
        .order("sort_order");
      return (data || [])
        .filter((rs: any) => rs.songs)
        .map((rs: any) => ({ ...rs.songs, __sort_order: rs.sort_order ?? 0 }));
    },
    enabled: !!id,
  });

  // Per-culto key overrides: songId -> key_override (the tom chosen for THIS culto).
  const { data: keyOverrides = {} } = useQuery({
    queryKey: ["culto-key-overrides", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_songs")
        .select("song_id, key_override")
        .eq("culto_id", id!);
      const map: Record<string, string> = {};
      for (const row of (data || []) as any[]) {
        if (row.song_id && row.key_override) map[row.song_id] = row.key_override;
      }
      return map;
    },
    enabled: !!id && source === "culto",
  });

  // Roteiro blocks (momentos do culto: oração, palavra, etc.) — só existem para cultos.
  const { data: cultoBlocks = [] } = useQuery({
    queryKey: ["presentation-culto-blocks", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("culto_blocks" as any)
        .select("*")
        .eq("culto_id", id!)
        .order("sort_order", { ascending: true });
      return (data ?? []) as any[];
    },
    enabled: !!id && source === "culto",
  });

  // Current member's instruments — used to pre-select the function view (Cantor/Instrumentista).
  const { data: myInstruments = [] } = useQuery({
    queryKey: ["presentation-my-instruments", profileId, currentTeam?.id],
    queryFn: async () => {
      if (!profileId || !currentTeam) return [];
      const { data } = await supabase
        .from("team_members")
        .select("instruments")
        .eq("profile_id", profileId)
        .eq("team_id", currentTeam.id)
        .maybeSingle();
      return ((data as any)?.instruments ?? []) as string[];
    },
    enabled: !!profileId && !!currentTeam,
  });

  // Pre-select the role-view highlight (once). The persisted mode (Voz/Cifra) is the
  // source of truth, so we don't override it — we only reflect it, using the member's
  // instruments as a hint when there's no saved mode signal.
  const rolePreselectedRef = useRef(false);
  useEffect(() => {
    if (rolePreselectedRef.current || roleView !== null) return;
    // If the saved mode is Voz, that's clearly "Cantor". Otherwise derive from instruments.
    if (prefs.instrument === "voz") {
      rolePreselectedRef.current = true;
      setRoleView("cantor");
      return;
    }
    if (!myInstruments.length) return;
    // Naipes/ministrante (inclusive os "Back N" legados) contam como cantor.
    // "Baixo (voz)" é naipe; "Baixo" sozinho é o contrabaixo — isVocalRole separa os dois.
    const EXTRA_SINGER = ["vocal", "voz"];
    const isVocal = (i: string) => isVocalRole(i) || EXTRA_SINGER.includes(i.toLowerCase());
    const hasInstrument = myInstruments.some((i) => !isVocal(i));
    const isSinger = myInstruments.some((i) => isVocal(i));
    rolePreselectedRef.current = true;
    setRoleView(hasInstrument ? "instrumentista" : isSinger ? "cantor" : "instrumentista");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myInstruments, roleView, prefs.instrument]);

  // Apply a role view selection: set the mode (Voz/Cifra) and bump lyric size for singers.
  const applyRoleView = useCallback((role: "cantor" | "instrumentista") => {
    setRoleView(role);
    rolePreselectedRef.current = true;
    if (role === "cantor") {
      updatePrefs({ instrument: "voz", fontSize: Math.max(prefs.fontSize, FONT_SIZES[3].scale) });
    } else {
      updatePrefs({ instrument: "violao" });
    }
  }, [prefs.fontSize, updatePrefs]);

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

  const SONG_FALLBACK_SECONDS = 240;

  // Unified roteiro: songs + blocks merged by sort_order. Each item keeps a pointer
  // back to its songIdx (for songs) so navigation never desestabiliza songIdx/segIdx.
  type RoteiroItem =
    | { kind: "song"; sort_order: number; songIdx: number; data: any }
    | { kind: "block"; sort_order: number; data: any };

  const roteiro: RoteiroItem[] = useMemo(() => {
    const songItems: RoteiroItem[] = (songs as any[]).map((s: any, i: number) => ({
      kind: "song" as const,
      sort_order: s.__sort_order ?? i,
      songIdx: i,
      data: s,
    }));
    if (source !== "culto" || !cultoBlocks.length) return songItems;
    const blockItems: RoteiroItem[] = (cultoBlocks as any[]).map((b: any) => ({
      kind: "block" as const,
      sort_order: b.sort_order ?? 0,
      data: b,
    }));
    return [...songItems, ...blockItems].sort((a, b) => a.sort_order - b.sort_order);
  }, [songs, cultoBlocks, source]);

  const hasBlocks = source === "culto" && cultoBlocks.length > 0;

  // The currently active item index in the unified roteiro.
  const currentItemIdx = useMemo(() => {
    if (blockIdx !== null) {
      const idx = roteiro.findIndex((it) => it.kind === "block" && it.data === cultoBlocks[blockIdx]);
      if (idx >= 0) return idx;
    }
    return roteiro.findIndex((it) => it.kind === "song" && it.songIdx === songIdx);
  }, [roteiro, blockIdx, cultoBlocks, songIdx]);

  const activeBlock = blockIdx !== null ? (cultoBlocks[blockIdx] as any) : null;

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

  // Persist the metronome BPM to the song (best-effort, debounced).
  const bpmSaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const persistBpm = useCallback((bpm: number) => {
    if (!currentSongId) return;
    clearTimeout(bpmSaveTimer.current);
    bpmSaveTimer.current = setTimeout(() => {
      supabase.from("songs").update({ bpm } as any).eq("id", currentSongId).then(() => {});
    }, 800);
  }, [currentSongId]);

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
  // Stems são pesados (6 MP3s por música) — só carregam quando o mixer é aberto.
  // Até lá o MP3 original toca sozinho (mesmo som: os stems no volume 1 somam o mix).
  const [stemsWanted, setStemsWanted] = useState(false);
  // Stems prontos de verdade (elementos criados) — só então o master é silenciado.
  const [stemsLoaded, setStemsLoaded] = useState(false);
  const stemsLoadedRef = useRef(false);
  // Intenção de tocar: sobrevive à troca de música/carregamento — quando o áudio novo
  // fica pronto (canplay), ele toca sozinho se a intenção estiver de pé.
  const playIntentRef = useRef(false);
  // Pausa interna (troca de música) não é o usuário pausando: o evento 'pause'
  // dela chega assíncrono e não pode derrubar a intenção recém-preservada.
  const suppressPauseIntentRef = useRef(false);
  const playbackRateRef = useRef(1);
  const isTransicaoRef = useRef(false);
  // Roteia o master pelo mesmo grafo dos stems (gain -> PitchShift): o Tom passa a
  // valer também quando só o original está tocando (antes exigia stems ativos).
  const masterSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const audioVolumeRef = useRef(1);

  // Real-time pitch (tom) for the stems, controlled from the mixer
  const [transpose, setTranspose] = useState(0);
  const transposeRef = useRef(0); // espelho p/ effects que criam o pitch node sob demanda
  const pitchRef = useRef<Tone.PitchShift | null>(null);
  const trackSourcesRef = useRef<Map<string, MediaElementAudioSourceNode>>(new Map());
  // Um GainNode por faixa: o iOS ignora `.volume`/`.muted` do elemento quando ele
  // está roteado pelo Web Audio, mas o ganho do grafo funciona. É por aqui que o
  // mixer controla volume/mute/solo (cross-platform).
  const trackGainsRef = useRef<Map<string, GainNode>>(new Map());
  const [detectedKey, setDetectedKey] = useState<DetectedKey | null>(null);
  const [detectingKey, setDetectingKey] = useState(false);
  const keyResolvedRef = useRef<string | null>(null);

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

  // Get signed URLs for tracks — only once the user actually wants the stems.
  useEffect(() => {
    if (!songTracks.length || !stemsWanted) { setTrackUrls({}); return; }
    let cancelled = false;
    Promise.all(
      songTracks.map(async (t: any) => {
        const url = await getSignedAudioUrl(t.audio_path);
        return [t.id, url || ""] as const;
      })
    ).then((entries) => { if (!cancelled) setTrackUrls(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [songTracks, stemsWanted]);

  // Create/destroy track Audio elements (routed through Web Audio so the mixer can pitch-shift)
  useEffect(() => {
    const map = trackAudiosRef.current;
    const sources = trackSourcesRef.current;
    for (const [id, audio] of map) {
      if (!trackUrls[id]) {
        audio.pause();
        audio.src = "";
        const s = sources.get(id);
        if (s) { try { s.disconnect(); } catch { /* noop */ } sources.delete(id); }
        const g = trackGainsRef.current.get(id);
        if (g) { try { g.disconnect(); } catch { /* noop */ } trackGainsRef.current.delete(id); }
        map.delete(id);
      }
    }
    for (const [id, url] of Object.entries(trackUrls)) {
      if (!url) continue;
      if (!map.has(id)) {
        const audio = new Audio();
        audio.crossOrigin = "anonymous";
        audio.preload = "auto";
        audio.src = url;
        audio.load();
        audio.volume = 1;
        audio.playbackRate = playbackRateRef.current; // nasce na velocidade atual
        map.set(id, audio);
        // Route element -> per-track gain -> shared pitch-shift -> speakers.
        // At transpose 0, wet=0 (dry, no latency).
        try {
          if (!pitchRef.current) {
            const ps = new Tone.PitchShift({ pitch: transposeRef.current, windowSize: 0.1 });
            ps.wet.value = transposeRef.current === 0 ? 0 : 1;
            ps.toDestination();
            pitchRef.current = ps;
          }
          const rawCtx = Tone.getContext().rawContext as unknown as AudioContext;
          const src = rawCtx.createMediaElementSource(audio);
          const gain = rawCtx.createGain();
          src.connect(gain);
          Tone.connect(gain as any, pitchRef.current as any);
          sources.set(id, src);
          trackGainsRef.current.set(id, gain);
        } catch { /* fall back to the element's own output */ }
      }
    }
    // Só ativa os stems (mute do master + play sincronizado) quando TODOS tiverem
    // dados bufferizados (canplay) — mutar na criação abria um buraco de silêncio
    // no meio da música em rede lenta.
    let cancelled = false;
    const cleanups: Array<() => void> = [];
    if (map.size > 0) {
      const els = Array.from(map.values());
      let pending = 0;
      const activate = () => {
        if (cancelled) return;
        stemsLoadedRef.current = true;
        setStemsLoaded(true);
        const master = audioRef.current;
        if (master) {
          master.muted = true;
          for (const [, trk] of map) {
            trk.playbackRate = playbackRateRef.current;
            trk.currentTime = master.currentTime;
            if (!master.paused) trk.play().catch(() => {});
          }
        } else if (!hasAudioFile && playIntentRef.current) {
          // Música que SÓ tem faixas: honra a intenção de play pendente. (Se o
          // master existe mas ainda carrega, quem inicia tudo é o canplay dele.)
          for (const [, trk] of map) {
            trk.playbackRate = playbackRateRef.current;
            trk.play().catch(() => {});
          }
          setAudioPlaying(true);
          setBuffering(false);
        }
      };
      const onOneReady = () => { pending -= 1; if (pending === 0) activate(); };
      for (const el of els) {
        if (el.readyState >= 3) continue; // HAVE_FUTURE_DATA — já dá pra tocar
        pending += 1;
        const h = () => onOneReady();
        el.addEventListener("canplay", h, { once: true });
        cleanups.push(() => el.removeEventListener("canplay", h));
      }
      if (pending === 0) activate();
    }
    return () => {
      cancelled = true;
      for (const fn of cleanups) fn();
      for (const [, audio] of map) { audio.pause(); audio.src = ""; }
      for (const [, s] of sources) { try { s.disconnect(); } catch { /* noop */ } }
      for (const [, g] of trackGainsRef.current) { try { g.disconnect(); } catch { /* noop */ } }
      sources.clear();
      trackGainsRef.current.clear();
      map.clear();
      stemsLoadedRef.current = false;
      setStemsLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackUrls]);

  // Sync track volumes/mute based on trackStates.
  // Preferimos o GainNode (funciona no iOS); o elemento fica em volume cheio e nunca
  // é mutado — no iOS, mexer em `.muted`/`.volume` de um elemento roteado pelo Web
  // Audio não silencia (e às vezes faz o elemento travar/derivar).
  useEffect(() => {
    const map = trackAudiosRef.current;
    const gains = trackGainsRef.current;
    const hasSolo = trackStates.some((t) => t.solo);
    for (const state of trackStates) {
      const silenced = state.muted || (hasSolo && !state.solo);
      const target = silenced ? 0 : state.volume;
      const gain = gains.get(state.id);
      if (gain) {
        try {
          gain.gain.setTargetAtTime(target, gain.context.currentTime, 0.01);
        } catch {
          gain.gain.value = target;
        }
        const audio = map.get(state.id);
        if (audio) { audio.volume = 1; audio.muted = false; }
      } else {
        // Fallback sem Web Audio (raro): controla direto no elemento.
        const audio = map.get(state.id);
        if (!audio) continue;
        audio.volume = state.volume;
        audio.muted = silenced;
      }
    }
    // trackUrls: reaplica os ganhos quando os GainNodes são (re)criados.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackStates, trackUrls]);

  // Apply pitch-shift (tom). wet=0 keeps the original tom latency-free and in sync.
  useEffect(() => {
    transposeRef.current = transpose;
    if (pitchRef.current) {
      pitchRef.current.pitch = transpose;
      pitchRef.current.wet.value = transpose === 0 ? 0 : 1;
    }
  }, [transpose]);

  // Dispose the pitch node on unmount
  useEffect(() => () => { try { pitchRef.current?.dispose(); } catch { /* noop */ } pitchRef.current = null; }, []);

  const hasTracks = songTracks.length > 0;
  const isVoz = prefs.instrument === "voz";
  const isTransicao = !isVoz; // always transição mode for instruments

  // ORIGINAL text (never transposed). Always re-derive the displayed text from
  // this + the current delta so transposition never accumulates rounding errors.
  const rawActiveText = useMemo(() => {
    if (isVoz && currentSong?.lyrics_text) return currentSong.lyrics_text;
    return currentSong?.cifra_text || "";
  }, [isVoz, currentSong?.lyrics_text, currentSong?.cifra_text]);

  // In cifra mode, transpose the displayed chord text by the current tom delta.
  // (Lyrics in voz mode have no chord lines, so transposeCifra leaves them intact.)
  const activeText = useMemo(() => {
    if (isVoz || !transpose) return rawActiveText;
    return transposeCifra(rawActiveText, transpose);
  }, [rawActiveText, transpose, isVoz]);

  const segments = useMemo(
    () => (activeText ? splitSegments(activeText) : []),
    [activeText]
  );
  const currentSegment = segments[segIdx] || "";
  const chords = useMemo(() => extractChords(currentSegment), [currentSegment]);
  const isLastSegment = segIdx >= segments.length - 1;
  const isLastSong = songIdx >= songs.length - 1;
  const isFirstSong = songIdx <= 0;

  // The key the stored cifra/lyrics are written in (the "zero delta" reference).
  const writtenKeyName: string | null = useMemo(
    () => (currentSong as any)?.key_current || (currentSong as any)?.key_original || null,
    [currentSong]
  );

  // Per-culto key chosen for THIS culto (overrides the song's own key for display + pitch).
  const overrideKeyName: string | null = useMemo(
    () => (source === "culto" ? keyOverrides[currentSongId] || null : null),
    [source, keyOverrides, currentSongId]
  );

  // Effective tom shown to the player = the written key shifted by the current delta.
  // The initial delta is set so this lands on the override key (see reset effect below).
  const effectiveKeyLabel: string | null = useMemo(() => {
    if (!writtenKeyName) return overrideKeyName ? transposeKeyLabel(overrideKeyName, 0) : null;
    return transposeKeyLabel(writtenKeyName, transpose);
  }, [writtenKeyName, overrideKeyName, transpose]);

  // What we seed the Tom label / capo with when no analysis has run.
  const effectiveBaseKeyName = writtenKeyName || overrideKeyName;

  // Transpose "base" desta tela (0, ou o shift do override de tom do culto). O
  // botão de reset do Tom volta pra cá.
  const baseTranspose = useMemo(() => {
    if (overrideKeyName && writtenKeyName) return semitonesBetweenKeys(writtenKeyName, overrideKeyName);
    return 0;
  }, [overrideKeyName, writtenKeyName]);

  // Capo suggestion for the effective tom (cifra mode only).
  const capoHint = useMemo(
    () => (effectiveKeyLabel ? capoSuggestion(effectiveKeyLabel) : null),
    [effectiveKeyLabel]
  );

  const mediaUrl = currentSong?.media_url || "";
  const youtubeId = mediaUrl ? getYouTubeId(mediaUrl) : null;
  const hasMedia = !!mediaUrl;

  const hasAudioFile = !!currentSong?.audio_path;
  // "Publicada" = tem áudio pra tocar (MP3 original ou faixas separadas). Sem nada
  // disso não há o que tocar no ensaio: o play fica desativado e avisa o usuário.
  // (durante um "momento" do roteiro não há música, então não conta como não publicada.)
  const notPublished = !activeBlock && !hasAudioFile && !hasTracks;
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
    setAudioUrl(null); // clear immediately so nothing analyzes a stale URL on song change
    if (!currentSong?.audio_path) return;
    let cancelled = false;
    getSignedAudioUrl(currentSong.audio_path).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => { cancelled = true; };
  }, [currentSong?.audio_path]);

  // Pré-carrega o master da PRÓXIMA música do repertório: assina a URL (fica no
  // cache) e deixa o navegador bufferizar — o skip vira quase instantâneo.
  const nextSongAudioPath: string | null = songs[songIdx + 1]?.audio_path || null;
  useEffect(() => {
    if (!nextSongAudioPath) return;
    let cancelled = false;
    let el: HTMLAudioElement | null = null;
    getSignedAudioUrl(nextSongAudioPath).then((url) => {
      if (!url || cancelled) return;
      el = new Audio();
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      el.src = url;
      el.load();
    });
    return () => { cancelled = true; if (el) { try { el.src = ""; } catch { /* noop */ } } };
  }, [nextSongAudioPath]);

  // Reset tom + key resolution when the song changes. If this culto picked a
  // key_override, start with the pitch/cifra shifted from the written key to it.
  useEffect(() => {
    setTranspose(baseTranspose);
    setDetectedKey(null);
    keyResolvedRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSongId, baseTranspose]);

  // Música nova: volta a tocar só o master (leve) e descarta o loop A-B da música
  // anterior — sem isso o loop antigo "sequestrava" a música nova, rebobinando ela
  // para um trecho definido em outra música. (Só em [currentSongId]: mudança tardia
  // de baseTranspose não pode derrubar os stems.)
  useEffect(() => {
    setStemsWanted(false);
    setActiveLoop(null);
    setCurrentRepetition(0);
    activeLoopRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSongId]);

  // Mixer aberto = usuário quer os stems desta música. `!stemsWanted` nas deps
  // garante o rearme mesmo quando stemsWanted cai sem a música mudar (ex.:
  // re-selecionar a música atual na lista com o mixer aberto).
  useEffect(() => {
    if (showMixer && hasTracks && !stemsWanted) setStemsWanted(true);
  }, [showMixer, hasTracks, currentSongId, stemsWanted]);

  // Música SÓ com faixas (sem MP3 master): um skip com intenção de tocar precisa
  // armar os stems — não existe canplay de master para disparar o autoplay.
  useEffect(() => {
    if (!hasAudioFile && hasTracks && playIntentRef.current) setStemsWanted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAudioFile, hasTracks, currentSongId]);

  // Pre-seed the displayed key from the written/effective key so the Tom label +
  // capo hint are correct even before the audio is analyzed.
  useEffect(() => {
    if (!effectiveBaseKeyName) return;
    const parsed = parseKeyName(effectiveBaseKeyName);
    if (parsed) {
      setDetectedKey(parsed);
      keyResolvedRef.current = currentSongId; // skip audio analysis — we already know the key
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveBaseKeyName, currentSongId]);

  // Resolve the song key when the mixer opens: use the saved key, else analyze the audio ONCE and save it.
  useEffect(() => {
    if (!showMixer || !currentSongId) return;
    if (keyResolvedRef.current === currentSongId) return;

    const existing = parseKeyName((currentSong as any)?.key_original);
    if (existing) {
      keyResolvedRef.current = currentSongId;
      setDetectedKey(existing);
      return;
    }
    if (!audioUrl) return; // wait for the signed URL of the current song

    keyResolvedRef.current = currentSongId; // mark attempted — prevents re-runs/loops
    let cancelled = false;
    setDetectingKey(true);
    (async () => {
      try {
        const key = await detectKeyFromUrl(audioUrl);
        if (cancelled) return;
        setDetectedKey(key);
        if (key) {
          // Persist so it's never analyzed again (best-effort; viewers may lack permission)
          supabase.from("songs").update({ key_original: key.name } as any).eq("id", currentSongId).then(() => {});
        }
      } catch { /* best-effort */ }
      finally { if (!cancelled) setDetectingKey(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMixer, currentSongId, audioUrl]);

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
        // Stems criados mas ainda NÃO ativados (bufferizando): não dá play — o
        // master está audível e eles entrariam POR CIMA dele conforme bufferizam
        // (som dobrado). Quem inicia esses é o activate() quando todos ficam prontos.
        if (!stemsLoadedRef.current) continue;
        audio.playbackRate = playbackRateRef.current; // garante a velocidade atual
        if (time !== undefined) audio.currentTime = time;
        audio.play().catch(() => {});
      } else if (action === "pause") {
        audio.pause();
      } else if (action === "seek" && time !== undefined) {
        audio.currentTime = time;
      }
    }
  }, []);

  // Derruba os stems AGORA (síncrono). Sem isso, ao trocar de música os stems da
  // anterior continuam na memória até as URLs novas chegarem — e um play nesse
  // intervalo tocava a música errada.
  const teardownStems = useCallback(() => {
    for (const [, audio] of trackAudiosRef.current) { audio.pause(); audio.src = ""; }
    for (const [, s] of trackSourcesRef.current) { try { s.disconnect(); } catch { /* noop */ } }
    for (const [, g] of trackGainsRef.current) { try { g.disconnect(); } catch { /* noop */ } }
    trackAudiosRef.current.clear();
    trackSourcesRef.current.clear();
    trackGainsRef.current.clear();
    stemsLoadedRef.current = false;
    setStemsLoaded(false);
    setTrackUrls({});
  }, []);

  // Para tudo imediatamente ao navegar entre itens. A intenção de tocar é decidida
  // pelo chamador (skip mantém tocando; selecionar na lista para).
  const stopCurrentAudio = useCallback(() => {
    const master = audioRef.current;
    // O 'pause' desta pausa interna chega assíncrono — não pode derrubar a
    // intenção que o chamador preservar logo em seguida. (Só quando estava
    // tocando: pause() de elemento já pausado não dispara evento.)
    if (master && !master.paused) suppressPauseIntentRef.current = true;
    master?.pause();
    teardownStems();
    setStemsWanted(false);
    setAudioPlaying(false);
    setBuffering(false);
    setAudioProgress(0);
  }, [teardownStems]);

  useEffect(() => {
    if (!audioUrl) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setAudioPlaying(false);
      setAudioProgress(0);
      setAudioDuration(0);
      setBuffering(false); // música sem áudio: não deixa o spinner do skip preso
      return;
    }

    const audio = new Audio();
    audio.preload = "auto";
    // CORS liberado para rotear pelo Web Audio (pitch). Sem isso o grafo emudece.
    audio.crossOrigin = "anonymous";
    audio.src = audioUrl;
    audio.load();
    audio.playbackRate = playbackRateRef.current;
    // When stems are ACTIVE, the original is a SILENT master clock. iOS Safari
    // ignores `.volume` (read-only there) but honors `.muted` — without muting, the
    // original plays audibly on top of the stems on iPhone (the "double audio" bug).
    audio.muted = stemsLoadedRef.current;
    audio.volume = 1;
    audioRef.current = audio;
    // Roteia o master pelo mesmo grafo dos stems (gain -> PitchShift) para o Tom
    // funcionar também sem stems. Volume do master é via GainNode (iOS ignora
    // `.volume` de elemento roteado).
    try {
      if (!pitchRef.current) {
        // Usa o transpose VIGENTE (ex.: key_override do culto já aplicado) — criar
        // com pitch 0 fixo deixava a cifra transposta e o áudio no tom original.
        const ps = new Tone.PitchShift({ pitch: transposeRef.current, windowSize: 0.1 });
        ps.wet.value = transposeRef.current === 0 ? 0 : 1;
        ps.toDestination();
        pitchRef.current = ps;
      }
      const rawCtx = Tone.getContext().rawContext as unknown as AudioContext;
      const src = rawCtx.createMediaElementSource(audio);
      const gain = rawCtx.createGain();
      gain.gain.value = audioVolumeRef.current;
      src.connect(gain);
      Tone.connect(gain as any, pitchRef.current as any);
      masterSourceRef.current = src;
      masterGainRef.current = gain;
    } catch { /* fall back to the element's own output */ }
    // Se o usuário apertou play enquanto a música carregava (ou avançou com música
    // tocando), mantém o spinner até o canplay disparar o play de verdade.
    setBuffering(playIntentRef.current);

    const handleLoadedMetadata = () => setAudioDuration(audio.duration);
    const handleWaiting = () => setBuffering(true);
    const handlePlaying = () => setBuffering(false);
    const handleCanPlay = () => {
      setBuffering(false);
      // Intenção pendente: o áudio ficou pronto — toca sozinho (e os stems juntos).
      if (playIntentRef.current && audio.paused) {
        audio.play().catch(() => setBuffering(false));
        syncTrackAudios("play", audio.currentTime);
      }
    };
    // Estado espelha os eventos REAIS do elemento — nunca mais botão "pause" com
    // áudio parado (autoplay bloqueado, pause do sistema, etc.).
    const handlePlayEvent = () => setAudioPlaying(true);
    const handlePauseEvent = () => {
      setAudioPlaying(false);
      // Pausa que NÃO veio de troca de música (fone/notificação de mídia/OS) é o
      // usuário parando: derruba a intenção, senão um seek posterior (canplay)
      // ressuscitava o áudio e o skip dava autoplay contra a vontade dele.
      if (suppressPauseIntentRef.current) suppressPauseIntentRef.current = false;
      else playIntentRef.current = false;
    };
    const handleEnded = () => {
      if (audio.currentTime < audio.duration) return;
      previewRangeRef.current = null;
      setIsPreviewingLoop(false);
      setIsPlaying(false);
      playIntentRef.current = false;
      setAudioPlaying(false);
      setAudioProgress(audio.duration);
    };
    const handleTimeUpdate = () => {
      const t = audio.currentTime;
      setAudioProgress(t);
      
      const preview = previewRangeRef.current;
      if (preview && t >= preview.end_time) {
        previewRangeRef.current = null;
        setIsPreviewingLoop(false);
        playIntentRef.current = false;
        audio.pause();
        audio.currentTime = preview.end_time;
        syncTrackAudios("pause");
        syncTrackAudios("seek", preview.end_time);
        setAudioProgress(preview.end_time);
        setAudioPlaying(false);
        setIsPlaying(false);
        return;
      }

      // Loop logic
      const loop = activeLoopRef.current;
      if (loop && t >= loop.end_time) {
        const rep = currentRepetitionRef.current + 1;
        if (loop.repeat_count > 0 && rep > loop.repeat_count) {
          // Finished all repetitions
          activeLoopRef.current = null;
          currentRepetitionRef.current = 0;
          setActiveLoop(null);
          setCurrentRepetition(0);
        } else {
          currentRepetitionRef.current = rep;
          setCurrentRepetition(rep);
          audio.currentTime = loop.start_time;
          setAudioProgress(loop.start_time);
          if (audio.paused) audio.play().catch(() => {});
          // sync tracks too
          const map = trackAudiosRef.current;
          for (const [, trk] of map) {
            trk.currentTime = loop.start_time;
          }
        }
        return;
      }
      
      // iOS: <audio> independentes derivam entre si com o tempo. Re-sincroniza as
      // faixas que saíram do clock-mestre além de ~0,2s (raro → sem glitch contínuo).
      const tmap = trackAudiosRef.current;
      for (const [, trk] of tmap) {
        if (!trk.seeking && Number.isFinite(trk.currentTime) && Math.abs(trk.currentTime - t) > 0.2) {
          trk.currentTime = t;
        }
      }

      if (!isTransicaoRef.current) syncSegmentWithAudioTime(t);
    };
    const handleSeeked = () => {
      const t = audio.currentTime;
      setAudioProgress(t);
      if (!isTransicaoRef.current) syncSegmentWithAudioTime(t);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("play", handlePlayEvent);
    audio.addEventListener("pause", handlePauseEvent);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("play", handlePlayEvent);
      audio.removeEventListener("pause", handlePauseEvent);
      audio.pause();
      audio.src = "";
      try { masterSourceRef.current?.disconnect(); } catch { /* noop */ }
      try { masterGainRef.current?.disconnect(); } catch { /* noop */ }
      masterSourceRef.current = null;
      masterGainRef.current = null;
    };
    // hasTracks/isTransicao ficam FORA das deps de propósito (lidos via ref/estado
    // estável): com eles aqui, o elemento era destruído e recriado NO MEIO da música
    // quando a query de faixas resolvia — a playback parava "do nada".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, syncSegmentWithAudioTime]);

  // Sync playbackRate to audio + tracks (ref: elementos novos nascem na velocidade certa)
  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    for (const [, trk] of trackAudiosRef.current) {
      trk.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => { isTransicaoRef.current = isTransicao; }, [isTransicao]);

  const handleSelectLoop = useCallback((loop: LoopPoint | null) => {
    activeLoopRef.current = loop;
    currentRepetitionRef.current = loop ? 1 : 0;
    setActiveLoop(loop);
    setCurrentRepetition(loop ? 1 : 0);
    if (loop && audioRef.current) {
      audioRef.current.currentTime = loop.start_time;
      syncTrackAudios("seek", loop.start_time);
      setAudioProgress(loop.start_time);
    }
  }, [syncTrackAudios]);

  const handleLoopSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;
    const nextTime = Math.max(0, Math.min(audio.duration, time));
    audio.currentTime = nextTime;
    syncTrackAudios("seek", nextTime);
    setAudioProgress(nextTime);
    if (!isTransicao) syncSegmentWithAudioTime(nextTime);
  }, [syncTrackAudios, syncSegmentWithAudioTime, isTransicao]);

  const handlePreviewLoop = useCallback((range: LoopRange | null) => {
    const audio = audioRef.current;
    const wasPreviewing = previewRangeRef.current !== null;
    previewRangeRef.current = range;
    setIsPreviewingLoop(!!range);
    if (!audio) return;
    if (!range) {
      if (wasPreviewing) {
        playIntentRef.current = false;
        setBuffering(false);
        audio.pause();
        syncTrackAudios("pause");
        setAudioPlaying(false);
        setIsPlaying(false);
      }
      return;
    }
    Tone.start().catch(() => {});
    setCountdown(null);
    playIntentRef.current = true;
    handleSelectLoop(null);
    handleLoopSeek(range.start_time);
    audio.play().then(() => {
      if (previewRangeRef.current !== range || audioRef.current !== audio) return;
      syncTrackAudios("play", audio.currentTime);
      setAudioPlaying(true);
      setIsPlaying(true);
    }).catch(() => {
      if (previewRangeRef.current !== range) return;
      previewRangeRef.current = null;
      playIntentRef.current = false;
      setIsPreviewingLoop(false);
      setBuffering(false);
      toast({ title: "Não foi possível reproduzir o áudio", description: "Tente ouvir o trecho novamente.", variant: "destructive" });
    });
  }, [handleLoopSeek, handleSelectLoop, syncTrackAudios, toast]);

  const closeLoopPanel = useCallback(() => {
    handlePreviewLoop(null);
    setShowLoopPanel(false);
  }, [handlePreviewLoop]);

  useEffect(() => {
    previewRangeRef.current = null;
    setIsPreviewingLoop(false);
    activeLoopRef.current = null;
    setActiveLoop(null);
    currentRepetitionRef.current = 0;
    setCurrentRepetition(0);
  }, [currentSongId]);

  const handlePlaybackRateChange = useCallback((rate: number) => {
    setPlaybackRate(rate);
  }, []);


  // Measure the (absolute) top bar so the content below it can clear it —
  // otherwise the start of the song sits hidden behind the controls with no
  // way to scroll up. The ResizeObserver also catches wrapping / safe-area changes.
  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const update = () => setTopBarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [songs.length, isMobile]);

  // Keep the page background matching the present theme so the device safe areas
  // never reveal the light body background (the white strip at the bottom).
  useEffect(() => {
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = isDark ? "#0a0a0a" : "#f5f5f5";
    return () => { document.body.style.backgroundColor = prev; };
  }, [isDark]);

  useEffect(() => {
    if (isTransicao) return; // transicao uses auto-scroll, not timer
    if (isRecording) return;
    // The text-only timer must not advance the playlist while rehearsing audio,
    // even when the song has no valid lyric timestamps or only has stems.
    if (hasAudioFile || hasTracks) return;
    if (!isPlaying || countdown !== null) return;
    playTimer.current = setTimeout(() => {
      if (isLastSegment) {
        setIsPlaying(false);
        // When auto-roteiro is on, the item-duration timer drives the transition,
        // so we don't start the per-song countdown (would double-advance).
        if (!isLastSong && !autoRoteiro) {
          setCountdown(prefs.countdownSeconds);
        }
      } else {
        setSegIdx((i) => i + 1);
      }
    }, prefs.speed * 1000);
    return () => clearTimeout(playTimer.current);
  }, [isTransicao, isRecording, isPlaying, segIdx, prefs.speed, isLastSegment, isLastSong, countdown, prefs.countdownSeconds, hasAudioFile, hasTracks, autoRoteiro]);

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

  // Duration (seconds) of the current roteiro item — song.duration_seconds (fallback)
  // or block.duration_min*60. Used by the auto-roteiro timer + the block countdown.
  const currentItemDuration = useMemo(() => {
    if (activeBlock) return Math.max(0, (activeBlock.duration_min || 0) * 60);
    return (currentSong?.duration_seconds as number) || SONG_FALLBACK_SECONDS;
  }, [activeBlock, currentSong]);

  const goNextSong = useCallback(() => {
    setCountdown(null);
    setBlockIdx(null);
    if (!isLastSong) {
      // Se estava tocando, a PRÓXIMA música começa sozinha quando carregar.
      const wasAudioPlaying = audioPlaying || playIntentRef.current;
      // Música SEM áudio usa isPlaying como timer da letra — esse fluxo continua.
      const wasRolling = wasAudioPlaying || (isPlaying && notPublished);
      stopCurrentAudio();
      playIntentRef.current = wasAudioPlaying;
      if (wasAudioPlaying) setBuffering(true);
      setSongIdx((i) => i + 1);
      setSegIdx(0);
      // isPlaying acompanha o estado real — `true` incondicional fazia a letra (e o
      // auto-roteiro) avançarem sozinhos em silêncio com o áudio pausado.
      setIsPlaying(wasRolling);
      setIsAutoScrolling(false);
    }
  }, [isLastSong, audioPlaying, stopCurrentAudio, isPlaying, notPublished]);

  const goPrevSong = useCallback(() => {
    setCountdown(null);
    setBlockIdx(null);
    if (isFirstSong) {
      // Primeira música: "voltar" recomeça do zero, sem derrubar o áudio carregado.
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        syncTrackAudios("seek", 0);
        setAudioProgress(0);
      }
      setSegIdx(0);
      return;
    }
    const wasAudioPlaying = audioPlaying || playIntentRef.current;
    const wasRolling = wasAudioPlaying || (isPlaying && notPublished);
    stopCurrentAudio();
    playIntentRef.current = wasAudioPlaying;
    if (wasAudioPlaying) setBuffering(true);
    setSongIdx((i) => Math.max(0, i - 1));
    setSegIdx(0);
    setIsPlaying(wasRolling);
    setIsAutoScrolling(false);
  }, [isFirstSong, audioPlaying, stopCurrentAudio, syncTrackAudios, isPlaying, notPublished]);

  // Navigate the unified roteiro by item index. Songs jump to their songIdx (clearing
  // any active block); blocks show the "momento" screen without touching songIdx/segIdx.
  const selectItem = useCallback((idx: number) => {
    const item = roteiro[idx];
    if (!item) return;
    setCountdown(null);
    setIsPlaying(false);
    setIsAutoScrolling(false);
    playIntentRef.current = false;
    stopCurrentAudio(); // para master E stems na hora (antes os stems seguiam tocando)
    if (item.kind === "song") {
      setBlockIdx(null);
      setSongIdx(item.songIdx);
      setSegIdx(0);
      setShowMediaPlayer(false);
    } else {
      const bIdx = (cultoBlocks as any[]).indexOf(item.data);
      setBlockIdx(bIdx >= 0 ? bIdx : null);
    }
  }, [roteiro, cultoBlocks, stopCurrentAudio]);

  // Auto-advance to the next roteiro item (used by the item-duration timer).
  const goNextItem = useCallback(() => {
    if (currentItemIdx < 0 || currentItemIdx >= roteiro.length - 1) {
      setIsPlaying(false);
      setBlockIdx((b) => b); // stay; end of roteiro
      return;
    }
    const next = roteiro[currentItemIdx + 1];
    setCountdown(null);
    setIsAutoScrolling(false);
    if (next.kind === "song") {
      const wasAudioPlaying = audioPlaying || playIntentRef.current;
      // Vindo de um BLOCO o áudio estava parado, mas o auto-roteiro está rodando:
      // a música seguinte deve começar a tocar (comportamento de culto contínuo).
      const resume = wasAudioPlaying || activeBlock !== null;
      stopCurrentAudio();
      playIntentRef.current = resume; // auto-roteiro: mantém tocando no item seguinte
      if (resume) setBuffering(true);
      setBlockIdx(null);
      setSongIdx(next.songIdx);
      setSegIdx(0);
      setIsPlaying(resume || (isPlaying && notPublished));
    } else {
      playIntentRef.current = false;
      stopCurrentAudio();
      setIsPlaying(false);
      const bIdx = (cultoBlocks as any[]).indexOf(next.data);
      setBlockIdx(bIdx >= 0 ? bIdx : null);
    }
  }, [currentItemIdx, roteiro, cultoBlocks, audioPlaying, stopCurrentAudio, activeBlock, isPlaying, notPublished]);

  // Auto-roteiro: advance to the next item after the current item's duration.
  // Songs only advance while playing; blocks advance on a fixed timer once shown.
  useEffect(() => {
    clearTimeout(itemTimer.current);
    if (!autoRoteiro) return;
    if (isRecording) return;
    if (countdown !== null) return;
    const onBlock = activeBlock !== null;
    if (!onBlock && !isPlaying) return; // songs wait for play
    const ms = (currentItemDuration || SONG_FALLBACK_SECONDS) * 1000;
    itemTimer.current = setTimeout(() => { goNextItem(); }, ms);
    return () => clearTimeout(itemTimer.current);
  }, [autoRoteiro, isRecording, countdown, activeBlock, isPlaying, currentItemDuration, currentItemIdx, goNextItem]);

  // Visible countdown for the block "momento" screen.
  useEffect(() => {
    clearInterval(blockTickTimer.current);
    if (activeBlock === null) return;
    setBlockRemaining(currentItemDuration);
    if (!autoRoteiro || currentItemDuration <= 0) return;
    blockTickTimer.current = setInterval(() => {
      setBlockRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => clearInterval(blockTickTimer.current);
  }, [activeBlock, currentItemDuration, autoRoteiro]);

  const goPrevSegment = useCallback(() => {
    setCountdown(null);
    setSegIdx((i) => Math.max(0, i - 1));
  }, []);

  const goNextSegment = useCallback(() => {
    setCountdown(null);
    if (isLastSegment) {
      setIsPlaying(false);
      if (!isLastSong && !autoRoteiro) setCountdown(prefs.countdownSeconds);
    } else {
      setSegIdx((i) => i + 1);
    }
  }, [isLastSegment, isLastSong, prefs.countdownSeconds, autoRoteiro]);




  const togglePlay = useCallback(() => {
    setCountdown(null);
    // While a roteiro "momento" (block) is showing there's no song to play.
    if (activeBlock) return;
    // Música sem MP3 nem faixas: ainda não está publicada, não há o que tocar.
    if (!hasAudioFile && !hasTracks) {
      toast({
        title: "Música não publicada",
        description: "Esta música ainda não tem áudio (MP3), então não dá pra tocar no ensaio.",
      });
      return;
    }
    // Resume the Web Audio context (needed for pitched output) — this is a user gesture
    Tone.start().catch(() => {});

    const audio = audioRef.current;
    // Intenção pendente conta como "tocando": o clique durante o spinner CANCELA o
    // play em vez de rearmá-lo (antes era impossível abortar um play carregando).
    const playing = audioPlaying || (audio ? !audio.paused : false) || playIntentRef.current;
    if (playing) {
      playIntentRef.current = false;
      audio?.pause();
      syncTrackAudios("pause");
      setAudioPlaying(false);
      setBuffering(false);
      setIsPlaying(false);
      return;
    }
    // Registra a INTENÇÃO de tocar: se o áudio ainda está carregando (troca de
    // música recém-feita), o canplay dispara o play sozinho — nunca mais um clique
    // no play que "não faz nada".
    playIntentRef.current = true;
    setIsPlaying(true);
    if (hasAudioFile) {
      setBuffering(true); // limpa no "playing"/"canplay" do master
      if (audio) {
        audio.play().catch(() => { /* estado segue os eventos do elemento */ });
        syncTrackAudios("play", audio.currentTime);
      }
      // sem elemento ainda: intenção registrada + spinner; o canplay resolve.
    } else if (hasTracks) {
      // Música só com faixas (sem MP3 master): garante que as faixas carreguem e toca.
      setStemsWanted(true);
      setBuffering(true);
      if (trackAudiosRef.current.size > 0 && stemsLoadedRef.current) {
        syncTrackAudios("play");
        setAudioPlaying(true);
        setBuffering(false);
      }
      // faixas ainda carregando: o activate() toca ao ficarem prontas (intenção).
    }
  }, [hasAudioFile, audioPlaying, syncTrackAudios, hasTracks, activeBlock, toast]);

  const handleVolumeChange = useCallback((v: number) => {
    setAudioVolume(v);
    audioVolumeRef.current = v;
    const gain = masterGainRef.current;
    if (gain) {
      try { gain.gain.setTargetAtTime(v, gain.context.currentTime, 0.01); }
      catch { gain.gain.value = v; }
    } else if (audioRef.current && !stemsLoaded) {
      audioRef.current.volume = v; // fallback sem Web Audio
    }
  }, [stemsLoaded]);

  // Seek do áudio (toque OU arraste na timeline). Mantém faixas/segmento em sincronia.
  const seekToTime = useCallback((nextTime: number) => {
    if (!audioRef.current || !audioDuration) return;
    const t = Math.max(0, Math.min(audioDuration, nextTime));
    audioRef.current.currentTime = t;
    syncTrackAudios("seek", t);
    setAudioProgress(t);
    if (!isTransicao) syncSegmentWithAudioTime(t);
  }, [audioDuration, syncTrackAudios, isTransicao, syncSegmentWithAudioTime]);

  // Master mudo APENAS quando os stems estão de fato tocando (não quando a query
  // apenas diz que existem — isso deixava o play em silêncio até os 6 MP3s chegarem).
  // iOS honors `.muted` even though it ignores volume.
  useEffect(() => {
    if (audioRef.current) audioRef.current.muted = stemsLoaded;
  }, [stemsLoaded]);

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
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, button, [role="slider"], [contenteditable="true"]')) return;
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
  const chordFontScale = prefs.chordFontScale ?? 1;

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
        <div ref={topBarRef} className="absolute top-0 left-0 right-0 z-30 flex flex-col pt-[max(env(safe-area-inset-top),1.25rem)]">
          {/* Linha 1 — utilitários (ocupa a largura toda: controles à esquerda, toggle à direita) */}
          <div className="flex items-center gap-1.5 px-3 pb-2">
            <button onClick={() => navigate(backPath)} className={`p-2 rounded-xl ${accentBg} backdrop-blur-sm ${hoverBg} transition-colors shrink-0`}>
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => updatePrefs({ theme: isDark ? "light" : "dark" })}
              className={`p-2 rounded-xl ${accentBg} backdrop-blur-sm ${hoverBg} transition-colors shrink-0`}
              title={isDark ? "Modo claro" : "Modo escuro"}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            {/* Tamanho da letra */}
            <div className={`flex items-center gap-0.5 rounded-xl ${accentBg} backdrop-blur-sm px-1 shrink-0`}>
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

            {/* Tamanho dos acordes — independente da letra (só no modo cifra) */}
            {!isVoz && (
              <div className={`flex items-center gap-0.5 rounded-xl ${accentBg} backdrop-blur-sm px-1 shrink-0`} title="Tamanho dos acordes">
                <button
                  onClick={decreaseChordFont}
                  disabled={chordFontIndex === 0}
                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${hoverBg}`}
                  title="Diminuir acordes"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className={`text-[10px] font-bold w-6 text-center ${subtleText}`}>C</span>
                <button
                  onClick={increaseChordFont}
                  disabled={chordFontIndex === CHORD_FONT_SCALES.length - 1}
                  className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${hoverBg}`}
                  title="Aumentar acordes"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Toggle fixado à direita: Voz/Cifra (mobile) ou Cantor/Instrumentista (desktop) */}
            <div className="ml-auto flex items-center shrink-0">
              <div className="hidden lg:flex">
                <RoleToggle role={roleView} onChange={applyRoleView} isDark={isDark} />
              </div>
              <ModeToggle
                instrument={prefs.instrument}
                onChange={(key) => updatePrefs({ instrument: key })}
                isDark={isDark}
                className="lg:hidden"
              />
            </div>
          </div>

          {/* Linha 2 — música selecionada + tom na mesma linha, alinhados */}
          <div className="flex items-center gap-2 px-3 pb-2 min-w-0">
            {/* Seletor de música — mobile/tablet (no desktop a lista fica na barra lateral) */}
            <button
              onClick={() => setShowMobileSongList((v) => !v)}
              className={`lg:hidden flex items-center gap-1.5 flex-1 min-w-0 px-3 py-2 rounded-xl ${accentBg} backdrop-blur-sm ${hoverBg} transition-colors`}
            >
              <Music className="h-4 w-4 shrink-0" />
              <span className="text-xs font-medium truncate flex-1 text-left">{currentSong?.title || "Música"}</span>
              {showMobileSongList ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
            </button>
            {/* Tom / capotraste — interativo (modo cifra). Transpõe a cifra offline,
                pro usuário estudar; funciona com ou sem stems. */}
            {!isVoz && countdown === null && !activeBlock && segments.length > 0 && (
              <div className={`flex items-center gap-1 shrink-0 pl-1.5 pr-2 py-1 rounded-xl ${accentBg} backdrop-blur-sm border ${borderSubtle} text-[11px] font-medium`}>
                <button
                  onClick={() => setTranspose((t) => Math.max(-6, t - 1))}
                  className={`h-6 w-6 rounded-lg flex items-center justify-center ${hoverBg} disabled:opacity-30`}
                  disabled={transpose <= -6}
                  title="Descer ½ tom"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="whitespace-nowrap px-0.5 flex items-center gap-1">
                  <Guitar className="h-3.5 w-3.5 text-primary shrink-0" />
                  Tom <strong className="text-primary">{effectiveKeyLabel ?? (transpose > 0 ? `+${transpose}` : transpose)}</strong>
                </span>
                <button
                  onClick={() => setTranspose((t) => Math.min(6, t + 1))}
                  className={`h-6 w-6 rounded-lg flex items-center justify-center ${hoverBg} disabled:opacity-30`}
                  disabled={transpose >= 6}
                  title="Subir ½ tom"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                {transpose !== baseTranspose && (
                  <button
                    onClick={() => setTranspose(baseTranspose)}
                    className={`h-6 w-6 rounded-lg flex items-center justify-center ${hoverBg}`}
                    title="Tom original"
                  >
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
                {capoHint && (<span className={`${subtleText} whitespace-nowrap`}>· capo {capoHint.capo}ª · <strong className="text-foreground">{capoHint.shapeKey}</strong></span>)}
              </div>
            )}
          </div>

          {/* Mobile collapsible roteiro list (músicas + blocos) */}
          {showMobileSongList && (
            <div className={`lg:hidden mx-3 mb-2 rounded-xl ${isDark ? "bg-black/70" : "bg-white/70"} backdrop-blur-md border ${borderSubtle} max-h-72 overflow-y-auto hide-scrollbar`}>
              {/* Roteiro header */}
              <div className={`flex items-center justify-between px-3 pt-2.5 pb-1.5 border-b ${borderSubtle}`}>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${subtleText}`}>
                  {hasBlocks ? "Roteiro" : "Repertório"}
                </span>
                {hasBlocks && (
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Avançar automaticamente pelo tempo de cada item">
                    <span className={`text-[9px] font-medium ${subtleText}`}>Auto roteiro</span>
                    <Switch checked={autoRoteiro} onCheckedChange={setAutoRoteiro} className="scale-75" />
                  </label>
                )}
              </div>
              {/* Roteiro list */}
              <div className="flex flex-col gap-0.5 p-2">
                {roteiro.map((it, idx) => {
                  const active = idx === currentItemIdx;
                  if (it.kind === "block") {
                    const b = it.data as any;
                    return (
                      <button
                        key={`mblock-${b.id}`}
                        onClick={() => { selectItem(idx); setShowMobileSongList(false); }}
                        className={`flex items-start gap-2 rounded-lg px-2.5 py-2 transition-all text-left border-l-2 ${
                          active ? "bg-primary/15 border-primary" : `border-primary/40 opacity-70 hover:opacity-100 ${hoverBg}`
                        }`}
                      >
                        <Timer className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <div className={`text-xs font-semibold truncate ${active ? "" : subtleText}`}>{b.title}</div>
                          <div className={`text-[10px] ${subtleText} truncate`}>
                            {(b.kind && b.kind !== "moment") ? b.kind : "Momento"}
                            {b.duration_min ? ` · ${b.duration_min} min` : ""}
                          </div>
                        </div>
                      </button>
                    );
                  }
                  const s = it.data as any;
                  return (
                    <button
                      key={`msong-${s.id}-${idx}`}
                      onClick={() => { selectItem(idx); setShowMobileSongList(false); }}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all text-left ${
                        active ? "bg-primary/15 border border-primary/30" : `border border-transparent opacity-70 hover:opacity-100 ${hoverBg}`
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
                      <span className={`text-xs font-medium truncate ${active ? "" : subtleText}`}>
                        {s.title}
                      </span>
                    </button>
                  );
                })}
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
        <div className="flex-1 flex items-center justify-center px-6 pb-6 lg:px-12 lg:pb-12 overflow-hidden z-0" style={{ paddingTop: topBarH ? topBarH + 12 : undefined }}>
          {activeBlock ? (
            <div className="text-center space-y-5 animate-in fade-in max-w-2xl">
              {(activeBlock.kind && activeBlock.kind !== "moment") && (
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">{activeBlock.kind}</p>
              )}
              <h1 className="text-4xl lg:text-6xl font-bold leading-tight">{activeBlock.title}</h1>
              {activeBlock.notes && (
                <p className={`text-lg lg:text-xl leading-relaxed whitespace-pre-wrap ${subtleText}`}>{activeBlock.notes}</p>
              )}
              {currentItemDuration > 0 && (
                <p className="text-5xl font-bold text-primary tabular-nums pt-2">
                  {formatTime(autoRoteiro ? blockRemaining : currentItemDuration)}
                </p>
              )}
              {currentItemIdx < roteiro.length - 1 && (
                <Button onClick={() => selectItem(currentItemIdx + 1)} className="rounded-xl gap-2 mt-2">
                  <SkipForward className="h-4 w-4" /> Próximo
                </Button>
              )}
            </div>
          ) : countdown !== null ? (
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
              chordFontScale={chordFontScale}
              isDark={isDark}
              instrument={prefs.instrument as "violao" | "guitarra" | "guitarra_worship"}
              isVoz={isVoz}
              coverUrl={(currentSong as any)?.cover_path ? coverUrls[(currentSong as any).cover_path] : null}
              title={(currentSong as any)?.title ?? null}
              artist={(currentSong as any)?.artist ?? null}
            />
          ) : (
            <p className={subtleText}>Sem cifra disponível para esta música.</p>
          )}
        </div>

        {/* Right Sidebar — Song list (vertical) + Chord Diagrams */}
        {countdown === null && (
          <div className={`hidden lg:flex flex-col ${isVoz ? "w-44" : "w-56"} border-l ${borderSubtle} overflow-y-auto z-20`}>
            {/* Roteiro — vertical (músicas + blocos do culto) */}
            <div className={`flex flex-col gap-1 p-3 border-b ${borderSubtle}`}>
              <div className="flex items-center justify-between px-1 mb-1">
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${subtleText}`}>
                  {hasBlocks ? "Roteiro" : "Repertório"}
                </span>
                {hasBlocks && (
                  <label className="flex items-center gap-1.5 cursor-pointer" title="Avançar automaticamente pelo tempo de cada item">
                    <span className={`text-[9px] font-medium ${subtleText}`}>Auto</span>
                    <Switch checked={autoRoteiro} onCheckedChange={setAutoRoteiro} className="scale-75" />
                  </label>
                )}
              </div>
              {roteiro.map((it, idx) => {
                const active = idx === currentItemIdx;
                if (it.kind === "block") {
                  const b = it.data as any;
                  return (
                    <button
                      key={`block-${b.id}`}
                      onClick={() => selectItem(idx)}
                      className={`flex items-start gap-2 rounded-lg px-2 py-1.5 transition-all text-left border-l-2 ${
                        active ? "bg-primary/15 border-primary" : `border-primary/40 opacity-60 hover:opacity-100 ${hoverBg}`
                      }`}
                    >
                      <Timer className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className={`text-[11px] font-semibold truncate ${active ? "" : subtleText}`}>{b.title}</div>
                        <div className={`text-[9px] ${subtleText} truncate`}>
                          {(b.kind && b.kind !== "moment") ? b.kind : "Momento"}
                          {b.duration_min ? ` · ${b.duration_min} min` : ""}
                        </div>
                      </div>
                    </button>
                  );
                }
                const s = it.data as any;
                return (
                  <button
                    key={`song-${s.id}-${idx}`}
                    onClick={() => selectItem(idx)}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition-all text-left ${
                      active ? "bg-primary/15 border border-primary/30" : `border border-transparent opacity-60 hover:opacity-100 ${hoverBg}`
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
                    <span className={`text-[11px] font-medium truncate ${active ? "" : subtleText}`}>
                      {s.title}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Chord diagrams (Voz/Cifra é controlado pelo RoleToggle no topo) */}
            <div className="flex flex-col p-4 gap-3">
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
        {showMixer && hasTracks && !isMobile && countdown === null && (
          <div className="order-first h-full shrink-0 pt-14" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <TrackMixer
              tracks={songTracks}
              trackStates={trackStates}
              onTrackStatesChange={setTrackStates}
              isDark={isDark}
              onClose={() => setShowMixer(false)}
              transpose={transpose}
              onTransposeChange={setTranspose}
              detectedKey={detectedKey}
              detecting={detectingKey}
              loading={stemsWanted && !stemsLoaded}
            />
          </div>
        )}

        {/* Loop Panel — desktop sidebar */}
        {showLoopPanel && !isMobile && currentSongId && countdown === null && (
          <div className="order-first h-full shrink-0 w-[360px] pt-14 overflow-hidden" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <LoopPanel
              songId={currentSongId}
              currentTime={audioProgress}
              duration={audioDuration}
              isPlaying={audioPlaying}
              isPreviewing={isPreviewingLoop}
              onSeek={handleLoopSeek}
              onTogglePlayback={togglePlay}
              onPreview={handlePreviewLoop}
              activeLoopId={activeLoop?.id ?? null}
              currentRepetition={currentRepetition}
              playbackRate={playbackRate}
              onSelectLoop={handleSelectLoop}
              onPlaybackRateChange={handlePlaybackRateChange}
              isDark={isDark}
              onClose={closeLoopPanel}
            />
          </div>
        )}

        {/* Metronome Panel — desktop sidebar */}
        {showMetronome && !isMobile && countdown === null && (
          <div className="order-first h-full shrink-0 w-72 pt-14 overflow-hidden" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <div className={`${isDark ? "bg-black/90" : "bg-white/90"} backdrop-blur-md border-r ${borderSubtle} h-full flex flex-col overflow-y-auto`}>
              <div className={`flex items-center justify-between px-3 py-2.5 border-b ${borderSubtle}`}>
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5" />
                  <span className="text-xs font-semibold">Metrônomo</span>
                </div>
                <button onClick={() => setShowMetronome(false)} className={`p-1 rounded-lg ${hoverBg} transition-colors`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <Metronome
                  key={currentSongId}
                  initialBpm={(currentSong as any)?.bpm ?? 100}
                  onBpmChange={persistBpm}
                  running={clickArmed ? audioPlaying : undefined}
                />
                <label className={`flex items-center justify-between gap-2 px-2 py-2 rounded-lg ${accentBg} cursor-pointer`}>
                  <span className="text-xs font-medium">Tocar junto com a música</span>
                  <Switch checked={clickArmed} onCheckedChange={setClickArmed} />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Metronome — mobile drawer */}
      {isMobile && (
        <Drawer open={showMetronome} onOpenChange={setShowMetronome}>
          <DrawerContent className={`max-h-[60vh] bg-background text-foreground ${isDark ? "dark" : ""}`}>
            <div className="px-4 pb-6 pt-2">
              <div className="flex items-center gap-1.5 mb-4">
                <Timer className="h-4 w-4" />
                <span className="text-sm font-semibold">Metrônomo</span>
              </div>
              <Metronome
                key={currentSongId}
                initialBpm={(currentSong as any)?.bpm ?? 100}
                onBpmChange={persistBpm}
                running={clickArmed ? audioPlaying : undefined}
              />
              <label className={`mt-3 flex items-center justify-between gap-2 px-2 py-2 rounded-lg ${accentBg} cursor-pointer`}>
                <span className="text-sm font-medium">Tocar junto com a música</span>
                <Switch checked={clickArmed} onCheckedChange={setClickArmed} />
              </label>
            </div>
          </DrawerContent>
        </Drawer>
      )}

      {/* Loop Panel — mobile drawer */}
      {isMobile && (
        <LoopDrawer
          open={showLoopPanel && !!currentSongId}
          onOpenChange={(open) => { if (open) setShowLoopPanel(true); else closeLoopPanel(); }}
          isDark={isDark}
        >
              {currentSongId && (
                <LoopPanel
                  songId={currentSongId}
                  currentTime={audioProgress}
                  duration={audioDuration}
                  isPlaying={audioPlaying}
                  isPreviewing={isPreviewingLoop}
                  onSeek={handleLoopSeek}
                  onTogglePlayback={togglePlay}
                  onPreview={handlePreviewLoop}
                  activeLoopId={activeLoop?.id ?? null}
                  currentRepetition={currentRepetition}
                  playbackRate={playbackRate}
                  onSelectLoop={handleSelectLoop}
                  onPlaybackRateChange={handlePlaybackRateChange}
                  isDark={isDark}
                  onClose={closeLoopPanel}
                  inDrawer
                />
              )}
        </LoopDrawer>
      )}

      {/* Mixer — mobile drawer (bandeja, igual ao loop e ao metrônomo) */}
      {isMobile && hasTracks && (
        <Drawer open={showMixer} onOpenChange={setShowMixer}>
          <DrawerContent className={`max-h-[85vh] bg-background text-foreground ${isDark ? "dark" : ""}`}>
            <TrackMixer
              tracks={songTracks}
              trackStates={trackStates}
              onTrackStatesChange={setTrackStates}
              isDark={isDark}
              onClose={() => setShowMixer(false)}
              transpose={transpose}
              onTransposeChange={setTranspose}
              detectedKey={detectedKey}
              detecting={detectingKey}
              loading={stemsWanted && !stemsLoaded}
              inDrawer
            />
          </DrawerContent>
        </Drawer>
      )}

      {/* Segment Timeline — only in padrao mode */}
      {!isTransicao && !isVoz && segments.length > 1 && countdown === null && !activeBlock && (
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

      {/* Transport Controls — 3 linhas no mobile (play+timeline / funções / scroll), 1 linha no desktop */}
      <div
        className={`flex flex-col lg:flex-row lg:flex-nowrap lg:items-center gap-x-2 gap-y-2 lg:gap-y-0 px-4 py-2 border-t ${borderSubtle} ${transportBg} backdrop-blur-sm transition-opacity duration-300 z-50 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* ===== Linha 1 — Play + Timeline ===== */}
        <div className="flex items-center gap-2 w-full lg:flex-1 lg:min-w-0">
          {/* Play button — desativado (visual) quando a música não está publicada;
              o clique ainda dispara o aviso "Música não publicada". */}
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-xl shrink-0 h-12 w-12 ${hoverBg} ${notPublished ? "opacity-40" : ""}`}
            onClick={togglePlay}
            aria-disabled={notPublished}
            title={notPublished ? "Música não publicada" : undefined}
          >
            {/* Com áudio, o ícone segue o estado REAL do player (nunca mais "pause"
                com som parado); sem áudio, segue o timer de rolagem da letra. */}
            {(hasAudioFile || hasTracks)
              ? (buffering
                  ? <Loader2 className="h-6 w-6 animate-spin" />
                  : audioPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />)
              : isPlaying ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>

          {/* Audio timeline */}
          {hasAudioFile ? (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className={`text-[10px] ${subtleText} tabular-nums whitespace-nowrap`}>
                {formatTime(audioProgress)}
              </span>
              <div
                className="relative flex-1 min-w-0 mx-1 py-2.5 cursor-pointer touch-none select-none"
                onPointerDown={(e) => {
                  if (!audioDuration) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  seekToTime(pct * audioDuration);
                }}
                onPointerMove={(e) => {
                  if (!audioDuration || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  seekToTime(pct * audioDuration);
                }}
              >
                <div className={`relative h-3 rounded-full ${accentBg}`}>
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
                    className="h-full rounded-full bg-primary relative z-10"
                    style={{ width: `${audioDuration ? (audioProgress / audioDuration) * 100 : 0}%` }}
                  />
                  {/* Thumb arrastável */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-primary shadow-md ring-2 ring-background z-20 pointer-events-none"
                    style={{ left: `${audioDuration ? (audioProgress / audioDuration) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <span className={`text-[10px] ${subtleText} tabular-nums whitespace-nowrap`}>
                {formatTime(audioDuration)}
              </span>
              {!stemsLoaded && (
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

          {/* Minimizar / expandir a barra */}
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-xl shrink-0 h-9 w-9 ml-auto lg:ml-0 ${hoverBg} ${subtleText}`}
            onClick={() => setTransportMinimized((v) => !v)}
            title={transportMinimized ? "Expandir controles" : "Minimizar controles"}
          >
            {transportMinimized ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>

        {!transportMinimized && (
        <>
        {/* ===== Linha 2 — Funções ===== */}
        <div className="flex items-center gap-1.5 w-full lg:w-auto">
          {/* Voltar música */}
          <Button
            variant="outline"
            size="icon"
            className={`rounded-xl shrink-0 h-11 w-11 border ${borderSubtle} ${hoverBg} disabled:opacity-30`}
            onClick={goPrevSong}
            disabled={isFirstSong}
            title="Música anterior"
          >
            <SkipBack className="h-5 w-5" />
          </Button>

          {/* Mixer */}
          {hasTracks && (
            <Button
              variant="ghost"
              className={`rounded-xl flex-1 min-w-0 h-11 gap-1.5 px-2 ${showMixer ? "text-primary bg-primary/10" : ""} ${hoverBg}`}
              onClick={() => setShowMixer((v) => !v)}
              title="Mixer de faixas"
            >
              <SlidersHorizontal className="h-4 w-4 shrink-0" />
              <span className="text-xs font-medium truncate">Mixer</span>
            </Button>
          )}

          {/* Loop / Ensaio */}
          {hasAudioFile && (
            <Button
              variant="ghost"
              className={`rounded-xl flex-1 min-w-0 h-11 gap-1.5 px-2 ${showLoopPanel ? "text-primary bg-primary/10" : ""} ${hoverBg}`}
              onClick={() => { if (showLoopPanel) closeLoopPanel(); else setShowLoopPanel(true); }}
              title="Modo Ensaio"
            >
              <Repeat className="h-4 w-4 shrink-0" />
              <span className="text-xs font-medium truncate">Loop</span>
            </Button>
          )}

          {/* Tap / Metrônomo */}
          <Button
            variant="ghost"
            className={`rounded-xl flex-1 min-w-0 h-11 gap-1.5 px-2 ${showMetronome || (clickArmed && audioPlaying) ? "text-primary bg-primary/10" : ""} ${hoverBg}`}
            onClick={() => setShowMetronome((v) => !v)}
            title="Metrônomo / Tap"
          >
            <Timer className="h-4 w-4 shrink-0" />
            <span className="text-xs font-medium truncate">Tap</span>
          </Button>

        {/* Media button */}
        {hasMedia && !hasAudioFile && (
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-xl shrink-0 h-11 w-11 ${hoverBg} ${showMediaPlayer ? "text-primary" : ""}`}
            onClick={() => {
              if (youtubeId) {
                setShowMediaPlayer((v) => !v);
              } else {
                window.open(mediaUrl, "_blank");
              }
            }}
            title="Tocar música"
          >
            <Music className="h-5 w-5" />
          </Button>
        )}

        {/* Edit timestamps */}
        {!isTransicao && hasSync && (
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-xl shrink-0 h-11 w-11 ${showTimestampEditor ? "text-primary" : ""} ${hoverBg}`}
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
            <List className="h-5 w-5" />
          </Button>
        )}

          {/* Avançar música */}
          <Button
            variant="outline"
            size="icon"
            className={`rounded-xl shrink-0 h-11 w-11 border ${borderSubtle} ${hoverBg} disabled:opacity-30`}
            onClick={goNextSong}
            disabled={isLastSong}
            title="Próxima música"
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>

        {/* ===== Linha 3 — Tempo de scroll ===== */}
        <div className="flex items-center gap-2 w-full lg:w-auto lg:ml-auto">
          <Button
            variant="ghost"
            size="icon"
            className={`rounded-xl shrink-0 h-11 w-11 ${isAutoScrolling ? "text-primary bg-primary/10" : ""} ${hoverBg}`}
            onClick={() => setIsAutoScrolling((v) => !v)}
            title={isAutoScrolling ? "Parar rolagem" : "Iniciar rolagem"}
          >
            <ChevronsDown className={`h-5 w-5 ${isAutoScrolling ? "animate-bounce" : ""}`} />
          </Button>
          <Gauge className={`h-3.5 w-3.5 ${subtleText} shrink-0 hidden md:block`} />
          <span className={`text-[10px] ${subtleText} whitespace-nowrap`}>Lento</span>
          <Slider
            value={[scrollSpeed]}
            onValueChange={([v]) => handleScrollSpeedChange(v)}
            min={5}
            max={120}
            step={1}
            className="flex-1 lg:w-32 lg:flex-initial"
          />
          <span className={`text-[10px] ${subtleText} whitespace-nowrap`}>Rápido</span>
          <span className={`text-[10px] font-mono ${subtleText} w-10 text-right hidden md:inline`}>{scrollSpeed}px/s</span>
        </div>
        </>
        )}
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
