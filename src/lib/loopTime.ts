export function formatLoopTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const whole = Math.floor(safe);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// Keep the draft untouched while typing; normalize only on blur.
export function parseLoopTime(value: string): number | null {
  const text = value.trim();
  if (/^\d+$/.test(text)) {
    const seconds = Number(text);
    return Number.isSafeInteger(seconds) ? seconds : null;
  }
  const match = text.match(/^(\d+):([0-5]?\d)$/);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(seconds) ? seconds : null;
}

export interface LoopDraft {
  label: string;
  start_time: number;
  end_time: number;
  repeat_count: number;
}

export interface LoopRange {
  start_time: number;
  end_time: number;
}

export function initialLoopRange(currentTime: number, duration: number): LoopRange {
  const limit = Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : null;
  const start = Math.max(0, Math.min(Math.floor(currentTime), limit === null ? Infinity : Math.max(0, limit - 20)));
  return { start_time: start, end_time: limit === null ? start + 20 : Math.min(start + 20, limit) };
}
