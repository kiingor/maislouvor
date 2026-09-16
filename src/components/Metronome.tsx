import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import { Button } from "@/components/ui/button";
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

  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`}>
      <div className="flex items-center justify-center gap-6">
        <Button
          size="icon"
          onClick={toggle}
          disabled={running !== undefined}
          className="h-11 w-11 rounded-full shrink-0 disabled:opacity-50"
          title={running !== undefined ? "Controlado pelo play da música" : playing ? "Parar" : "Iniciar metrônomo"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
        </Button>

        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => changeBpm(bpm - 1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <div className="text-center min-w-[64px]">
            <div className="text-2xl font-bold tabular-nums leading-none">{bpm}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">BPM</div>
          </div>
          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => changeBpm(bpm + 1)}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Beat indicator dots */}
      <div className="flex items-center justify-center gap-2">
        {Array.from({ length: beatsPerMeasure }).map((_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-all ${
              currentBeat === i
                ? i === 0 ? "bg-primary scale-150" : "bg-foreground scale-150"
                : "bg-muted-foreground/30"
            }`}
          />
        ))}
      </div>

      {/* Time signature */}
      <div className="flex items-center justify-center gap-1">
        {SIGNATURES.map((s) => (
          <button
            key={s}
            onClick={() => setBeatsPerMeasure(s)}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
              beatsPerMeasure === s ? "bg-primary text-primary-foreground" : "bg-accent/50 text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}/4
          </button>
        ))}
      </div>
    </div>
  );
}
