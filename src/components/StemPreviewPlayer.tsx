import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import * as Tone from "tone";
import { supabase } from "@/integrations/supabase/client";
import { Slider } from "@/components/ui/slider";
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

  // Lista agrupada iOS: um único card (sem card dentro de card), linhas com separador recuado.
  const row =
    "relative flex min-h-[52px] items-center gap-3 px-4 py-2.5 before:pointer-events-none before:absolute before:left-4 before:right-0 before:top-0 before:border-t before:border-separator first:before:hidden";
  const stepBtn =
    "grid h-11 min-w-[44px] place-items-center px-3 text-foreground transition-colors active:bg-fill-secondary disabled:opacity-30";
  const toggleBtn =
    "relative h-8 min-w-[44px] rounded-full px-2 text-footnote font-bold transition-colors after:absolute after:inset-x-0 after:-inset-y-1.5";

  return (
    <div className="min-w-0">
      <div className="mx-4 mb-1.5 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5 text-footnote text-muted-foreground">
          <SlidersHorizontal className="h-[15px] w-[15px] shrink-0" strokeWidth={2.25} aria-hidden="true" /> Mixer — ouvir as faixas
        </span>
        <button
          type="button"
          onClick={resetAll}
          className="-my-3 -mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-primary transition-colors active:bg-fill-tertiary"
          title="Redefinir volumes"
          aria-label="Redefinir volumes"
        >
          <RotateCcw className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>

      <div className="overflow-hidden rounded-card bg-card">
        {/* Transport (estilo mini player do Música) */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={loading}
              aria-label={playing ? "Pausar faixas" : "Ouvir faixas"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-prominent text-prominent-foreground transition-transform active:scale-95 disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
              ) : playing ? (
                <Pause className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true" />
              ) : (
                <Play className="ml-0.5 h-[18px] w-[18px]" fill="currentColor" aria-hidden="true" />
              )}
            </button>
            <span className="w-9 text-right text-caption1 tabular-nums text-muted-foreground">{fmt(current)}</span>
            <Slider value={[current]} min={0} max={duration || 1} step={0.1} onValueChange={([v]) => seek(v)} className="flex-1" />
            <span className="w-9 text-caption1 tabular-nums text-muted-foreground">{fmt(duration)}</span>
          </div>
          {loading && <p role="status" className="mt-1.5 text-center text-caption1 text-muted-foreground">Carregando faixas…</p>}
        </div>

        {/* Tom (key / pitch) */}
        <div className={row}>
          <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-fill-tertiary text-muted-foreground" aria-hidden="true">
            <Music2 className="h-[17px] w-[17px]" />
          </span>
          <span className="min-w-0 flex-1 text-body text-foreground">Tom</span>
          {detecting ? (
            <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} aria-hidden="true" /> detectando…
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-footnote text-muted-foreground">Tom orig.</span>
              <Select value={detectedKey?.name ?? ""} onValueChange={handleSetKey}>
                <SelectTrigger className="h-11 w-[76px] rounded-full border-0 bg-fill-tertiary px-3 text-subhead font-semibold">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {KEY_OPTIONS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className={row}>
          <div className="min-w-0 flex-1">
            <div className="text-title2 tabular-nums text-foreground">
              {targetKey ?? (semitones === 0 ? "—" : `${semitones > 0 ? "+" : ""}${semitones}`)}
            </div>
            <div className="text-footnote text-muted-foreground">
              {semitones === 0 ? "tom original" : `${semitones > 0 ? "+" : ""}${semitones} semitom${Math.abs(semitones) > 1 ? "s" : ""}`}
            </div>
          </div>
          {semitones !== 0 && (
            <button
              type="button"
              onClick={() => setSemitones(0)}
              title="Voltar ao tom original"
              aria-label="Voltar ao tom original"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fill-tertiary text-muted-foreground transition-colors active:bg-fill-secondary"
            >
              <RotateCcw className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            </button>
          )}
          {/* Stepper iOS: cápsula − | + */}
          <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-full bg-fill-tertiary">
            <button type="button" className={stepBtn} onClick={() => setSemitones((s) => Math.max(-6, s - 1))} disabled={semitones <= -6} aria-label="Descer meio tom">
              <Minus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
            <span className="h-5 w-px bg-separator" aria-hidden="true" />
            <button type="button" className={stepBtn} onClick={() => setSemitones((s) => Math.min(6, s + 1))} disabled={semitones >= 6} aria-label="Subir meio tom">
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Per-track mixer */}
        {states.map((track) => {
          const effMuted = track.muted || (hasSolo && !track.solo);
          return (
            <div key={track.id} className={cn(row, "flex-col items-stretch gap-1.5")}>
              <div className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate text-body", effMuted ? "text-muted-foreground" : "text-foreground")}>{track.track_name}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleMute(track.id)}
                    aria-pressed={track.muted}
                    aria-label={`Mudo ${track.track_name}`}
                    className={cn(toggleBtn, track.muted ? "bg-ios-red text-white" : "bg-fill-tertiary text-muted-foreground")}
                    title="Mudo"
                  >
                    M
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSolo(track.id)}
                    aria-pressed={track.solo}
                    aria-label={`Solo ${track.track_name}`}
                    className={cn(toggleBtn, track.solo ? "bg-prominent text-prominent-foreground" : "bg-fill-tertiary text-muted-foreground")}
                    title="Solo"
                  >
                    S
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                {effMuted ? (
                  <VolumeX className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
                ) : (
                  <Volume2 className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
                )}
                <Slider value={[track.volume]} min={0} max={1} step={0.05} onValueChange={([v]) => setVolume(track.id, v)} className={cn("flex-1", effMuted && "opacity-40")} />
                <span className="w-8 text-right text-caption1 tabular-nums text-muted-foreground">{Math.round(track.volume * 100)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
