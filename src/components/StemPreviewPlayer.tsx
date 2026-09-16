import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as Tone from "tone";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/GlassCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Play, Pause, Volume2, VolumeX, RotateCcw, SlidersHorizontal, Loader2, Minus, Plus, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { transposeKeyName, parseKeyName, detectKeyFromUrl, DetectedKey } from "@/lib/detectKey";

const KEY_OPTIONS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
];

interface Track {
  id: string;
  track_name: string;
  audio_path: string;
}

interface TrackState {
  id: string;
  track_name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
}

function fmt(t: number) {
  if (!isFinite(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StemPreviewPlayer({
  tracks,
  originalAudioPath,
  songId,
  songKey,
}: {
  tracks: Track[];
  originalAudioPath?: string | null;
  songId?: string;
  songKey?: string | null;
}) {
  const [states, setStates] = useState<TrackState[]>([]);
  const playersRef = useRef<Map<string, Tone.Player>>(new Map());
  const gainsRef = useRef<Map<string, Tone.Gain>>(new Map());
  const pitchRef = useRef<Tone.PitchShift | null>(null);
  const rafRef = useRef<number>(0);
  const initStartedRef = useRef(false);

  const [phase, setPhase] = useState<"idle" | "loading" | "ready">("idle");
  const ready = phase === "ready";
  const loading = phase === "loading";
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [semitones, setSemitones] = useState(0);
  const [detectedKey, setDetectedKey] = useState<DetectedKey | null>(null);
  const [detecting, setDetecting] = useState(false);

  const trackKey = useMemo(() => tracks.map((t) => t.id).join(","), [tracks]);

  // Mixer state mirrors the tracks
  useEffect(() => {
    setStates(tracks.map((t) => ({ id: t.id, track_name: t.track_name, volume: 1, muted: false, solo: false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);

  // Reset & dispose the audio graph when the track set changes / on unmount.
  // Stems load lazily on first play (ensureLoaded) — opening the editor no longer
  // downloads & decodes all 6 stems up front, so the play button shows instantly.
  useEffect(() => {
    initStartedRef.current = false;
    setPhase("idle");
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    return () => {
      cancelAnimationFrame(rafRef.current);
      try { const t = Tone.getTransport(); t.stop(); t.cancel(); t.seconds = 0; } catch { /* noop */ }
      for (const [, p] of playersRef.current) { try { p.unsync(); p.dispose(); } catch { /* noop */ } }
      for (const [, g] of gainsRef.current) { try { g.dispose(); } catch { /* noop */ } }
      try { pitchRef.current?.dispose(); } catch { /* noop */ }
      playersRef.current = new Map();
      gainsRef.current = new Map();
      pitchRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);

  // Lazily build the Tone graph + load buffers on first play.
  const ensureLoaded = useCallback(async () => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    setPhase("loading");
    const pitch = new Tone.PitchShift(0).toDestination();
    pitchRef.current = pitch;
    const tr = Tone.getTransport();
    tr.stop();
    tr.seconds = 0;
    const entries = await Promise.all(
      tracks.map(async (t) => {
        const { data } = await supabase.storage.from("audio").createSignedUrl(t.audio_path, 3600);
        return [t.id, data?.signedUrl || ""] as const;
      })
    );
    const players = new Map<string, Tone.Player>();
    const gains = new Map<string, Tone.Gain>();
    for (const [id, url] of entries) {
      if (!url) continue;
      const gain = new Tone.Gain(1).connect(pitch);
      const player = new Tone.Player(url).connect(gain);
      player.sync().start(0);
      players.set(id, player);
      gains.set(id, gain);
    }
    playersRef.current = players;
    gainsRef.current = gains;
    await Tone.loaded();
    let dur = 0;
    for (const [, p] of players) dur = Math.max(dur, p.buffer?.duration || 0);
    setDuration(dur);
    setPhase("ready");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks]);

  // Apply pitch shift
  useEffect(() => {
    if (pitchRef.current) pitchRef.current.pitch = semitones;
  }, [semitones, ready]);

  // Apply volume / mute / solo
  useEffect(() => {
    const hasSolo = states.some((s) => s.solo);
    for (const s of states) {
      const g = gainsRef.current.get(s.id);
      if (!g) continue;
      const audible = !s.muted && (!hasSolo || s.solo);
      g.gain.rampTo(audible ? s.volume : 0, 0.05);
    }
  }, [states, ready]);

  // Position loop while playing
  useEffect(() => {
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    const tick = () => {
      const t = Tone.getTransport().seconds;
      if (duration && t >= duration) {
        const tr = Tone.getTransport();
        tr.pause();
        tr.seconds = 0;
        setCurrent(0);
        setPlaying(false);
        return;
      }
      setCurrent(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, duration]);

  // Resolve the song key: use the saved key, else analyze the original mix ONCE and persist it.
  useEffect(() => {
    let cancelled = false;
    const existing = parseKeyName(songKey);
    if (existing) { setDetectedKey(existing); return; }
    if (!originalAudioPath) { setDetectedKey(null); return; }
    (async () => {
      setDetecting(true);
      try {
        const { data } = await supabase.storage.from("audio").createSignedUrl(originalAudioPath, 3600);
        if (!data?.signedUrl || cancelled) return;
        const key = await detectKeyFromUrl(data.signedUrl);
        if (cancelled) return;
        setDetectedKey(key);
        if (key && songId) {
          supabase.from("songs").update({ key_original: key.name } as any).eq("id", songId).then(() => {});
        }
      } catch { /* detection is best-effort */ }
      finally { if (!cancelled) setDetecting(false); }
    })();
    return () => { cancelled = true; };
  }, [originalAudioPath, songKey, songId]);

  const togglePlay = useCallback(async () => {
    await Tone.start();
    if (phase !== "ready") {
      if (phase === "loading") return;
      await ensureLoaded();
      Tone.getTransport().start();
      setPlaying(true);
      return;
    }
    const tr = Tone.getTransport();
    if (playing) { tr.pause(); setPlaying(false); }
    else { tr.start(); setPlaying(true); }
  }, [phase, playing, ensureLoaded]);

  const seek = useCallback((t: number) => {
    Tone.getTransport().seconds = t;
    setCurrent(t);
  }, []);

  const setVolume = (id: string, volume: number) =>
    setStates((prev) => prev.map((s) => (s.id === id ? { ...s, volume } : s)));
  const toggleMute = (id: string) =>
    setStates((prev) => prev.map((s) => (s.id === id ? { ...s, muted: !s.muted } : s)));
  const toggleSolo = (id: string) =>
    setStates((prev) => prev.map((s) => (s.id === id ? { ...s, solo: !s.solo } : s)));
  const resetAll = () =>
    setStates((prev) => prev.map((s) => ({ ...s, volume: 1, muted: false, solo: false })));

  // Manual override: detected key is just a suggestion — let the user correct it (saved to the song)
  const handleSetKey = (name: string) => {
    const parsed = parseKeyName(name);
    if (!parsed) return;
    setDetectedKey(parsed);
    setSemitones(0);
    if (songId) supabase.from("songs").update({ key_original: name } as any).eq("id", songId).then(() => {});
  };

  if (!tracks.length) return null;

  const hasSolo = states.some((s) => s.solo);
  const targetKey = detectedKey ? transposeKeyName(detectedKey.pc, detectedKey.mode, semitones) : null;

  return (
    <GlassCard className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <SlidersHorizontal className="h-4 w-4" /> Mixer — ouvir as faixas
        </div>
        <button
          onClick={resetAll}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors text-muted-foreground"
          title="Redefinir volumes"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          disabled={loading}
          className="h-10 w-10 shrink-0 rounded-full bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
        </button>
        <span className="text-[11px] tabular-nums text-muted-foreground w-9 text-right">{fmt(current)}</span>
        <Slider value={[current]} min={0} max={duration || 1} step={0.1} onValueChange={([v]) => seek(v)} className="flex-1" />
        <span className="text-[11px] tabular-nums text-muted-foreground w-9">{fmt(duration)}</span>
      </div>
      {loading && <p className="text-[11px] text-muted-foreground text-center -mt-1">Carregando faixas…</p>}

      {/* Tom (key / pitch) */}
      <div className="rounded-xl bg-accent/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Music2 className="h-3.5 w-3.5" /> Tom
          </span>
          {detecting ? (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> detectando…
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tom orig.</span>
              <Select value={detectedKey?.name ?? ""} onValueChange={handleSetKey}>
                <SelectTrigger className="h-7 w-[68px] rounded-lg text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {KEY_OPTIONS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl shrink-0" onClick={() => setSemitones((s) => Math.max(-6, s - 1))} disabled={semitones <= -6}>
            <Minus className="h-4 w-4" />
          </Button>
          <div className="flex-1 text-center">
            <div className="text-xl font-bold leading-none">
              {targetKey ?? (semitones === 0 ? "—" : `${semitones > 0 ? "+" : ""}${semitones}`)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {semitones === 0 ? "tom original" : `${semitones > 0 ? "+" : ""}${semitones} semitom${Math.abs(semitones) > 1 ? "s" : ""}`}
            </div>
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl shrink-0" onClick={() => setSemitones((s) => Math.min(6, s + 1))} disabled={semitones >= 6}>
            <Plus className="h-4 w-4" />
          </Button>
          {semitones !== 0 && (
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl shrink-0" onClick={() => setSemitones(0)} title="Voltar ao tom original">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Per-track mixer */}
      <div className="space-y-3">
        {states.map((track) => {
          const effMuted = track.muted || (hasSolo && !track.solo);
          return (
            <div key={track.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={cn("text-xs font-medium truncate flex-1", effMuted && "opacity-40")}>{track.track_name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => toggleMute(track.id)}
                    className={cn(
                      "text-[10px] font-bold w-6 h-5 rounded flex items-center justify-center transition-colors",
                      track.muted ? "bg-destructive/80 text-destructive-foreground" : "bg-accent text-muted-foreground"
                    )}
                    title="Mudo"
                  >
                    M
                  </button>
                  <button
                    onClick={() => toggleSolo(track.id)}
                    className={cn(
                      "text-[10px] font-bold w-6 h-5 rounded flex items-center justify-center transition-colors",
                      track.solo ? "bg-amber-500/80 text-black" : "bg-accent text-muted-foreground"
                    )}
                    title="Solo"
                  >
                    S
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {effMuted ? <VolumeX className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <Volume2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <Slider value={[track.volume]} min={0} max={1} step={0.05} onValueChange={([v]) => setVolume(track.id, v)} className={cn("flex-1", effMuted && "opacity-40")} />
                <span className="text-[10px] tabular-nums w-7 text-right text-muted-foreground">{Math.round(track.volume * 100)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
