// Client-side chord transposition built on ChordSheetJS.
// Replaces the old server/LLM `transpose` edge function: instant, offline, exact.
//
// The app stores cifras in "Cifra Club" style (chord lines above lyric lines),
// so we transpose per-line: a line is only treated as chords when most of its
// tokens parse as real chords. This preserves Portuguese lyrics (words like
// "A", "Em", "Da", "Sol") and keeps the original spacing/alignment intact.
import { Chord } from "chordsheetjs";

const NOTE_TO_SEMITONE: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

function parseChord(token: string): Chord | null {
  try {
    return Chord.parse(token) ?? null;
  } catch {
    return null;
  }
}

/** Transpose a single chord token (e.g. "G/B", "Am7", "F#dim"). Leaves unknown tokens untouched. */
export function transposeChord(token: string, semitones: number): string {
  if (!semitones) return token;
  const c = parseChord(token);
  if (!c) return token;
  try {
    return c.transpose(semitones).toString();
  } catch {
    return token;
  }
}

/** True when the line looks like a chord line (most whitespace-separated tokens are chords). */
export function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let chords = 0;
  for (const t of tokens) if (parseChord(t)) chords++;
  return chords / tokens.length >= 0.6;
}

/** Transpose every chord in a cifra by N semitones, preserving lyrics, spacing and line breaks. */
export function transposeCifra(text: string, semitones: number): string {
  if (!text || !semitones) return text;
  return text
    .split("\n")
    .map((line) =>
      isChordLine(line) ? line.replace(/\S+/g, (tok) => transposeChord(tok, semitones)) : line
    )
    .join("\n");
}

/** Root note → 0..11 semitone (ignores minor/quality, handles sharps & flats). */
export function keyRootSemitone(key: string): number | null {
  const m = (key || "").trim().match(/^([A-G])(#|b)?/);
  if (!m) return null;
  const root = m[1] + (m[2] ?? "");
  return root in NOTE_TO_SEMITONE ? NOTE_TO_SEMITONE[root] : null;
}

/** Signed minimal semitone distance from one key to another, range [-6, 6]. */
export function semitonesBetweenKeys(from: string, to: string): number {
  const a = keyRootSemitone(from);
  const b = keyRootSemitone(to);
  if (a == null || b == null) return 0;
  let delta = ((b - a) % 12 + 12) % 12;
  if (delta > 6) delta -= 12;
  return delta;
}

export function transposeCifraToKey(text: string, from: string, to: string): string {
  return transposeCifra(text, semitonesBetweenKeys(from, to));
}

/** Transpose a key/chord label (e.g. "Am" + 2 = "Bm", "G" - 1 = "Gb"). */
export function transposeKeyName(key: string, semitones: number): string {
  if (!key) return key;
  if (!semitones) return key;
  const c = parseChord(key);
  if (c) {
    try {
      return c.transpose(semitones).toString();
    } catch {
      /* fall through */
    }
  }
  // Fallback for bare roots (sharps only)
  const root = keyRootSemitone(key);
  if (root == null) return key;
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const isMinor = /m\b|m$/.test(key.replace(/maj/i, ""));
  return NAMES[(((root + semitones) % 12) + 12) % 12] + (isMinor ? "m" : "");
}

/** Best-effort key guess from a cifra: the first chord of the first chord line. */
export function detectKeyFromCifra(text: string): string | null {
  if (!text) return null;
  for (const line of text.split("\n")) {
    if (!isChordLine(line)) continue;
    const first = line.trim().split(/\s+/).find((t) => parseChord(t));
    if (first) {
      const c = parseChord(first)!;
      return c.toString();
    }
  }
  return null;
}

/**
 * Capo suggestion: to *sound* in `targetKey` while *playing* easy open-chord
 * shapes, place a capo and play in `shapeKey`. Returns the lowest capo fret
 * (1..11) whose shape key is an "easy" open key, or null if none fits well.
 */
export function capoSuggestion(targetKey: string): { capo: number; shapeKey: string } | null {
  const EASY = ["C", "A", "G", "E", "D"]; // common open-chord keys (and their minors)
  const targetRoot = keyRootSemitone(targetKey);
  if (targetRoot == null) return null;
  const isMinor = /m\b|m$/.test((targetKey || "").replace(/maj/i, ""));
  for (let capo = 1; capo <= 11; capo++) {
    const shapeRoot = (((targetRoot - capo) % 12) + 12) % 12;
    const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const name = NAMES[shapeRoot];
    if (EASY.includes(name)) {
      return { capo, shapeKey: name + (isMinor ? "m" : "") };
    }
  }
  return null;
}
