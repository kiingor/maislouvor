import { useState, useCallback, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Volume2, VolumeX, RotateCcw, X, Minus, Plus, Loader2 } from "lucide-react";
import { transposeKeyName, DetectedKey } from "@/lib/detectKey";

interface TrackState {
  id: string;
  track_name: string;
  volume: number;
  muted: boolean;
  solo: boolean;
}

interface TrackMixerProps {
  tracks: { id: string; track_name: string }[];
  trackStates: TrackState[];
  onTrackStatesChange: (states: TrackState[]) => void;
  isDark: boolean;
  onClose: () => void;
  transpose?: number;
  onTransposeChange?: (n: number) => void;
  detectedKey?: DetectedKey | null;
  detecting?: boolean;
  /** Faixas ainda baixando (carregam sob demanda ao abrir o mixer). */
  loading?: boolean;
  /** When rendered inside a vaul Drawer (mobile), skip stopPropagation so the
   * drawer can be dragged/closed and outside-clicks dismiss it. */
  inDrawer?: boolean;
}

export function TrackMixer({ tracks, trackStates, onTrackStatesChange, isDark, onClose, transpose = 0, onTransposeChange, detectedKey, detecting, loading = false, inDrawer = false }: TrackMixerProps) {
  const hasSolo = trackStates.some((t) => t.solo);

  const setVolume = useCallback((id: string, volume: number) => {
    onTrackStatesChange(
      trackStates.map((t) => (t.id === id ? { ...t, volume } : t))
    );
  }, [trackStates, onTrackStatesChange]);

  const toggleMute = useCallback((id: string) => {
    onTrackStatesChange(
      trackStates.map((t) => (t.id === id ? { ...t, muted: !t.muted } : t))
    );
  }, [trackStates, onTrackStatesChange]);

  const toggleSolo = useCallback((id: string) => {
    const current = trackStates.find((t) => t.id === id);
    if (!current) return;
    const newSolo = !current.solo;
    onTrackStatesChange(
      trackStates.map((t) => (t.id === id ? { ...t, solo: newSolo } : t))
    );
  }, [trackStates, onTrackStatesChange]);

  const resetAll = useCallback(() => {
    onTrackStatesChange(
      trackStates.map((t) => ({ ...t, volume: 1, muted: false, solo: false }))
    );
  }, [trackStates, onTrackStatesChange]);

  // Célula agrupada: branca sobre o painel no claro, #2C2C2E no escuro (também dentro da folha).
  const group = "rounded-card bg-card dark:bg-grouped-tertiary";
  const circle =
    "relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground transition-transform duration-200 active:scale-95 motion-reduce:transition-none";
  const stepHalf =
    "relative grid h-8 w-[46px] place-items-center text-foreground transition-colors active:bg-fill-tertiary disabled:pointer-events-none disabled:opacity-30 before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2";
  const toggle = (on: boolean, onClass: string) =>
    `relative grid h-8 w-9 shrink-0 place-items-center rounded-full text-footnote font-bold transition-colors duration-150 before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 ${
      on ? onClass : "bg-fill-tertiary text-foreground/70"
    }`;

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden text-foreground"
      onPointerDown={inDrawer ? undefined : (e) => e.stopPropagation()}
      onClick={inDrawer ? undefined : (e) => e.stopPropagation()}
      onTouchStart={inDrawer ? undefined : (e) => e.stopPropagation()}
    >
      {/* Barra do painel: Fechar à esquerda, título, Redefinir à direita. Fica fora do no-drag:
          na folha mobile, puxador + barra arrastam para fechar. */}
      <div className="grid shrink-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-3 pb-2 pt-3 [@media(max-height:500px)]:pb-1 [@media(max-height:500px)]:pt-1.5">
        <button
          type="button"
          onClick={onClose}
          className={`${circle} liquid-glass`}
          aria-label="Fechar mixer"
          title="Fechar mixer"
        >
          <X className="relative z-[4] h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden="true" />
        </button>
        <h2 className="truncate text-center text-headline">Mixer</h2>
        <button
          type="button"
          onClick={resetAll}
          className={`${circle} bg-fill-tertiary`}
          title="Redefinir tudo"
          aria-label="Redefinir tudo"
        >
          <RotateCcw className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden="true" />
        </button>
      </div>

      {/* `data-vaul-no-drag`: impede o Drawer (vaul) de capturar o gesto e tratar como
          arrastar-para-fechar — sem isso, no mobile o thumb do slider não se move. */}
      <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {/* Tom (pitch-shift) */}
        {onTransposeChange && (
          <section className="mt-1">
            <div className="mx-4 mb-1.5 flex items-baseline justify-between gap-2">
              <h3 className="text-footnote text-muted-foreground">Tom</h3>
              <span className="text-footnote text-muted-foreground">
                {detecting ? "detectando…" : detectedKey ? `original: ${detectedKey.name}` : ""}
              </span>
            </div>
            <div className={`${group} flex min-h-[60px] items-center gap-3 px-4 py-2.5`}>
              <div className="min-w-0 flex-1">
                <div className="text-title3 tabular-nums">
                  {detectedKey
                    ? transposeKeyName(detectedKey.pc, detectedKey.mode, transpose)
                    : transpose === 0 ? "—" : `${transpose > 0 ? "+" : ""}${transpose}`}
                </div>
                <div className="text-footnote text-muted-foreground">
                  {transpose === 0 ? "tom original" : `${transpose > 0 ? "+" : ""}${transpose} semitom${Math.abs(transpose) > 1 ? "s" : ""}`}
                </div>
              </div>
              {transpose !== 0 && (
                <button
                  type="button"
                  onClick={() => onTransposeChange(0)}
                  className={`${circle} h-8 w-8 bg-fill-tertiary before:absolute before:-inset-1.5`}
                  title="Voltar ao tom original"
                  aria-label="Voltar ao tom original"
                >
                  <RotateCcw className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                </button>
              )}
              {/* Stepper iOS (− | +) */}
              <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-full bg-fill-tertiary">
                <button
                  type="button"
                  onClick={() => onTransposeChange(Math.max(-6, transpose - 1))}
                  disabled={transpose <= -6}
                  className={stepHalf}
                  aria-label="Diminuir tom"
                  title="Diminuir tom"
                >
                  <Minus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </button>
                <span className="h-4 w-px bg-separator" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onTransposeChange(Math.min(6, transpose + 1))}
                  disabled={transpose >= 6}
                  className={stepHalf}
                  aria-label="Aumentar tom"
                  title="Aumentar tom"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Tracks */}
        <section className={onTransposeChange ? "mt-6" : "mt-1"}>
          <div className="mx-4 mb-1.5 flex items-baseline justify-between gap-2">
            <h3 className="text-footnote text-muted-foreground">Faixas</h3>
            {loading && (
              <span className="flex items-center gap-1.5 text-footnote text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Carregando faixas…
              </span>
            )}
          </div>
          <div className={`${group} overflow-hidden`}>
            {trackStates.map((track, index) => {
              const isEffectivelyMuted = track.muted || (hasSolo && !track.solo);
              return (
                <div
                  key={track.id}
                  className={`relative px-4 py-2.5 ${
                    index > 0 ? "before:absolute before:left-4 before:right-0 before:top-0 before:border-t before:border-separator" : ""
                  }`}
                >
                  <div className="flex min-h-9 items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-body ${isEffectivelyMuted ? "text-muted-foreground" : ""}`}>
                      {track.track_name}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleMute(track.id)}
                      className={toggle(track.muted, "bg-ios-red text-white")}
                      title="Mute"
                      aria-pressed={track.muted}
                    >
                      M
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleSolo(track.id)}
                      className={toggle(track.solo, "bg-ios-yellow text-black")}
                      title="Solo"
                      aria-pressed={track.solo}
                    >
                      S
                    </button>
                  </div>
                  {/* mt-2: a área de toque do thumb (8px acima do slider) não invade a base do M/S. */}
                  <div className="mt-2 flex items-center gap-2.5">
                    {isEffectivelyMuted ? (
                      <VolumeX className="h-[15px] w-[15px] shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
                    ) : (
                      <Volume2 className="h-[15px] w-[15px] shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden="true" />
                    )}
                    <Slider
                      value={[track.volume]}
                      onValueChange={([v]) => setVolume(track.id, v)}
                      min={0}
                      max={1}
                      step={0.05}
                      className={`flex-1 ${isEffectivelyMuted ? "opacity-40" : ""}`}
                      aria-label={`Volume de ${track.track_name}`}
                    />
                    <span className="w-8 text-right text-caption2 tabular-nums text-muted-foreground">
                      {Math.round(track.volume * 100)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
