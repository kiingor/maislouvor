import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import { Play, Pause, Minus, Plus } from "lucide-react";

interface MetronomeProps {
  /** Starting tempo. */
  initialBpm?: number;
  /** Called when the user changes the tempo (e.g. to persist songs.bpm). */
  onBpmChange?: (bpm: number) => void;
  /**
   * Optional external control. When defined, the metronome starts/stops to match
   * this flag (used to sync the click with the song's playback). The internal
   * play/pause button is disabled while controlled. When undefined, the metronome
   * is fully manual (its own button drives play/pause).
   */
  running?: boolean;
  className?: string;
}

const SIGNATURES = [2, 3, 4, 6];

/**
 * Self-contained metronome / click track. Uses a Web-Audio lookahead scheduler
 * (NOT Tone.Transport) so it never interferes with the presentation's audio
 * playback / loops, which use the global transport.
 */
export function Metronome({ initialBpm = 100, onBpmChange, running, className }: MetronomeProps) {
  const [bpm, setBpm] = useState(initialBpm);
  const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(-1);

  const synthRef = useRef<Tone.MembraneSynth | null>(null);
  const intervalRef = useRef<number | null>(null);
  const nextNoteTimeRef = useRef(0);
  const beatRef = useRef(0);
  const bpmRef = useRef(bpm);
  const beatsRef = useRef(beatsPerMeasure);
  const isMountedRef = useRef(true);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);

  // Re-sync to a new song's stored BPM when the prop changes.
  useEffect(() => { setBpm(initialBpm); }, [initialBpm]);

  const scheduler = useCallback(() => {
    const ctx = Tone.getContext();
    const lookahead = 0.1; // seconds
    while (nextNoteTimeRef.current < ctx.currentTime + lookahead) {
      const beat = beatRef.current % beatsRef.current;
      const isAccent = beat === 0;
      const time = nextNoteTimeRef.current;
      try {
        synthRef.current?.triggerAttackRelease(
          isAccent ? "C5" : "G4",
          "32n",
          time,
          isAccent ? 1 : 0.5
        );
      } catch { /* ignore scheduling races */ }
      Tone.getDraw().schedule(() => setCurrentBeat(beat), time);
      nextNoteTimeRef.current += 60 / bpmRef.current;
      beatRef.current += 1;
    }
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaying(false);
    setCurrentBeat(-1);
  }, []);

  const start = useCallback(async () => {
    await Tone.start();
    if (!isMountedRef.current) return; // component unmounted during the await — don't schedule
    if (!synthRef.current) {
      synthRef.current = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.02 },
      }).toDestination();
    }
    beatRef.current = 0;
    nextNoteTimeRef.current = Tone.getContext().currentTime + 0.06;
    if (intervalRef.current != null) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(scheduler, 25);
    setPlaying(true);
  }, [scheduler]);

  const toggle = useCallback(() => {
    if (playing) stop();
    else start();
  }, [playing, start, stop]);

  // External (parent-controlled) start/stop. When `running` is provided, mirror it.
  useEffect(() => {
    if (running === undefined) return;
    if (running && !playing) start();
    else if (!running && playing) stop();
  }, [running, playing, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (intervalRef.current != null) clearInterval(intervalRef.current);
      synthRef.current?.dispose();
      synthRef.current = null;
    };
  }, []);

  const changeBpm = useCallback((next: number) => {
    const clamped = Math.max(40, Math.min(240, Math.round(next)));
    setBpm(clamped);
    onBpmChange?.(clamped);
  }, [onBpmChange]);

  const stepHalf =
    "relative grid h-8 w-[46px] place-items-center text-foreground transition-colors active:bg-fill-tertiary before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2";

  return (
    <div className={`flex flex-col gap-4 ${className ?? ""}`}>
      <div className="flex items-center gap-4">
        {/* Play: círculo proeminente (desativado quando segue o play da música) */}
        <button
          type="button"
          onClick={toggle}
          disabled={running !== undefined}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-prominent text-prominent-foreground shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_4px_12px_-4px_var(--lg-shadow)] transition-transform duration-200 active:scale-95 disabled:opacity-50 motion-reduce:transition-none"
          title={running !== undefined ? "Controlado pelo play da música" : playing ? "Parar" : "Iniciar metrônomo"}
          aria-label={running !== undefined ? "Controlado pelo play da música" : playing ? "Parar" : "Iniciar metrônomo"}
        >
          {playing ? <Pause className="h-6 w-6" fill="currentColor" aria-hidden="true" /> : <Play className="ml-0.5 h-6 w-6" fill="currentColor" aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-large-title tabular-nums leading-none">{bpm}</div>
          <div className="mt-1 text-caption1 font-medium text-muted-foreground">BPM</div>
        </div>

        {/* Stepper iOS (− | +) */}
        <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-full bg-fill-tertiary">
          <button type="button" className={stepHalf} onClick={() => changeBpm(bpm - 1)} aria-label="Diminuir BPM" title="Diminuir BPM">
            <Minus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          </button>
          <span className="h-4 w-px bg-separator" aria-hidden="true" />
          <button type="button" className={stepHalf} onClick={() => changeBpm(bpm + 1)} aria-label="Aumentar BPM" title="Aumentar BPM">
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Beat indicator dots */}
      <div className="flex items-center justify-center gap-3" aria-hidden="true">
        {Array.from({ length: beatsPerMeasure }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-transform duration-100 motion-reduce:transition-none ${
              currentBeat === i
                ? i === 0 ? "scale-150 bg-primary" : "scale-150 bg-foreground"
                : "bg-label-tertiary"
            }`}
          />
        ))}
      </div>

      {/* Time signature — controle segmentado */}
      <div role="group" aria-label="Compasso" className="flex h-9 items-center gap-0.5 rounded-full bg-fill-tertiary p-0.5">
        {SIGNATURES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setBeatsPerMeasure(s)}
            aria-pressed={beatsPerMeasure === s}
            className={`relative h-8 flex-1 rounded-full text-subhead font-medium tabular-nums text-foreground transition-colors duration-200 before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2 motion-reduce:transition-none ${
              beatsPerMeasure === s ? "bg-card shadow-sm dark:bg-prominent" : ""
            }`}
          >
            {s}/4
          </button>
        ))}
      </div>
    </div>
  );
}
