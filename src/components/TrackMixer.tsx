import { useState, useCallback, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Volume2, VolumeX, Headphones, RotateCcw, X, SlidersHorizontal } from "lucide-react";

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
}

export function TrackMixer({ tracks, trackStates, onTrackStatesChange, isDark, onClose }: TrackMixerProps) {
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
      className={`${isDark ? "bg-black/90" : "bg-white/90"} backdrop-blur-md border-r ${borderSubtle} w-64 h-full flex flex-col overflow-hidden`}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
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
          <button
            onClick={onClose}
            className={`p-1 rounded-lg ${hoverBg} transition-colors`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tracks */}
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
