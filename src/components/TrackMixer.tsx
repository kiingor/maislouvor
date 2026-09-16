import { useState, useCallback, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Headphones, RotateCcw, X, SlidersHorizontal, Music2, Minus, Plus } from "lucide-react";
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
  const subtleText = isDark ? "text-white/50" : "text-black/50";
  const accentBg = isDark ? "bg-white/10" : "bg-black/10";
  const hoverBg = isDark ? "hover:bg-white/10" : "hover:bg-black/10";
  const borderSubtle = isDark ? "border-white/10" : "border-black/10";

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

  return (
    <div
      // `data-vaul-no-drag`: impede o Drawer (vaul) de capturar o gesto e tratar como
      // arrastar-para-fechar — sem isso, no mobile o thumb do slider não se move.
      data-vaul-no-drag
      className={`${inDrawer ? "" : `${isDark ? "bg-black/90" : "bg-white/90"} backdrop-blur-md border-r ${borderSubtle}`} w-full lg:w-64 h-full flex flex-col overflow-hidden`}
      onPointerDown={inDrawer ? undefined : (e) => e.stopPropagation()}
      onClick={inDrawer ? undefined : (e) => e.stopPropagation()}
      onTouchStart={inDrawer ? undefined : (e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-3 py-2.5 border-b ${borderSubtle}`}>
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="text-xs font-semibold">Mixer</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetAll}
            className={`p-1 rounded-lg ${hoverBg} transition-colors`}
            title="Redefinir tudo"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
          {!inDrawer && (
            <button
              onClick={onClose}
              className={`p-1 rounded-lg ${hoverBg} transition-colors`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tom (pitch-shift) */}
      {onTransposeChange && (
        <div className={`px-3 py-2.5 border-b ${borderSubtle} space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold">
              <Music2 className="h-3.5 w-3.5" /> Tom
            </span>
            <span className={`text-[10px] ${subtleText}`}>
              {detecting ? "detectando…" : detectedKey ? `original: ${detectedKey.name}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onTransposeChange(Math.max(-6, transpose - 1))}
              disabled={transpose <= -6}
              className={`h-7 w-7 rounded-lg flex items-center justify-center ${accentBg} ${hoverBg} disabled:opacity-30`}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-base font-bold leading-none">
                {detectedKey
                  ? transposeKeyName(detectedKey.pc, detectedKey.mode, transpose)
                  : transpose === 0 ? "—" : `${transpose > 0 ? "+" : ""}${transpose}`}
              </div>
              <div className={`text-[9px] ${subtleText} mt-0.5`}>
                {transpose === 0 ? "tom original" : `${transpose > 0 ? "+" : ""}${transpose} semitom${Math.abs(transpose) > 1 ? "s" : ""}`}
              </div>
            </div>
            <button
              onClick={() => onTransposeChange(Math.min(6, transpose + 1))}
              disabled={transpose >= 6}
              className={`h-7 w-7 rounded-lg flex items-center justify-center ${accentBg} ${hoverBg} disabled:opacity-30`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            {transpose !== 0 && (
              <button
                onClick={() => onTransposeChange(0)}
                className={`h-7 w-7 rounded-lg flex items-center justify-center ${hoverBg}`}
                title="Voltar ao tom original"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tracks */}
      {loading && (
        <div className={`px-3 py-1.5 text-[10px] ${subtleText} flex items-center gap-1.5`}>
          <span className="h-2.5 w-2.5 rounded-full border border-current border-t-transparent animate-spin" />
          Carregando faixas…
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {trackStates.map((track) => {
          const isEffectivelyMuted = track.muted || (hasSolo && !track.solo);
          return (
            <div key={track.id} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-medium truncate flex-1 ${isEffectivelyMuted ? "opacity-40" : ""}`}>
                  {track.track_name}
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => toggleMute(track.id)}
                    className={`text-[9px] font-bold w-6 h-5 rounded flex items-center justify-center transition-colors ${
                      track.muted
                        ? "bg-destructive/80 text-destructive-foreground"
                        : `${accentBg} ${subtleText}`
                    }`}
                    title="Mute"
                  >
                    M
                  </button>
                  <button
                    onClick={() => toggleSolo(track.id)}
                    className={`text-[9px] font-bold w-6 h-5 rounded flex items-center justify-center transition-colors ${
                      track.solo
                        ? "bg-amber-500/80 text-black"
                        : `${accentBg} ${subtleText}`
                    }`}
                    title="Solo"
                  >
                    S
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEffectivelyMuted ? (
                  <VolumeX className={`h-3 w-3 shrink-0 ${subtleText}`} />
                ) : (
                  <Volume2 className="h-3 w-3 shrink-0" />
                )}
                <Slider
                  value={[track.volume]}
                  onValueChange={([v]) => setVolume(track.id, v)}
                  min={0}
                  max={1}
                  step={0.05}
                  className={`flex-1 ${isEffectivelyMuted ? "opacity-40" : ""}`}
                />
                <span className={`text-[9px] tabular-nums w-7 text-right ${subtleText}`}>
                  {Math.round(track.volume * 100)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
