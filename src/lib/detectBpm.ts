// Offline BPM/tempo detection from an audio URL, using realtime-bpm-analyzer.
import { analyzeFullBuffer } from "realtime-bpm-analyzer";

/**
 * Decode an audio file and estimate its BPM. Returns null on failure so callers
 * can fall back to manual entry. Lightweight enough to run on demand.
 */
export async function detectBpmFromUrl(url: string): Promise<number | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new Ctx();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(arr);
    } finally {
      // OfflineAudioContext is used internally by analyzeFullBuffer; close this one.
      ctx.close().catch(() => {});
    }
    const tempos = await analyzeFullBuffer(buffer);
    if (!tempos || tempos.length === 0) return null;
    const bpm = Math.round(tempos[0].tempo);
    if (!bpm || bpm < 40 || bpm > 240) return null;
    return bpm;
  } catch (e) {
    console.error("detectBpmFromUrl error:", e);
    return null;
  }
}
