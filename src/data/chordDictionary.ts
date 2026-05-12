export type ChordShape = {
  frets: (number | -1)[]; // -1 = muted, 0 = open, 1+ = fret number
  baseFret: number;
  barres?: number[];
};

export type InstrumentChords = Record<string, ChordShape>;

// Common worship chords for violão and guitarra
// frets array: [E2, A, D, G, B, E4] (low to high)
const VIOLAO_CHORDS: InstrumentChords = {
  // Major
  "C":   { frets: [-1, 3, 2, 0, 1, 0], baseFret: 1 },
  "D":   { frets: [-1, -1, 0, 2, 3, 2], baseFret: 1 },
  "E":   { frets: [0, 2, 2, 1, 0, 0], baseFret: 1 },
  "F":   { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, barres: [1] },
  "G":   { frets: [3, 2, 0, 0, 0, 3], baseFret: 1 },
  "A":   { frets: [-1, 0, 2, 2, 2, 0], baseFret: 1 },
  "B":   { frets: [-1, 2, 4, 4, 4, 2], baseFret: 1, barres: [2] },

  // Sharp/flat majors
  "C#":  { frets: [-1, 4, 3, 1, 2, 1], baseFret: 1, barres: [1] },
  "Db":  { frets: [-1, 4, 3, 1, 2, 1], baseFret: 1, barres: [1] },
  "D#":  { frets: [-1, -1, 1, 3, 4, 3], baseFret: 1 },
  "Eb":  { frets: [-1, -1, 1, 3, 4, 3], baseFret: 1 },
  "F#":  { frets: [2, 4, 4, 3, 2, 2], baseFret: 1, barres: [2] },
  "Gb":  { frets: [2, 4, 4, 3, 2, 2], baseFret: 1, barres: [2] },
  "G#":  { frets: [4, 6, 6, 5, 4, 4], baseFret: 1, barres: [4] },
  "Ab":  { frets: [4, 6, 6, 5, 4, 4], baseFret: 1, barres: [4] },
  "A#":  { frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, barres: [1] },
  "Bb":  { frets: [-1, 1, 3, 3, 3, 1], baseFret: 1, barres: [1] },

  // Minor
  "Am":  { frets: [-1, 0, 2, 2, 1, 0], baseFret: 1 },
  "Bm":  { frets: [-1, 2, 4, 4, 3, 2], baseFret: 1, barres: [2] },
  "Cm":  { frets: [-1, 3, 5, 5, 4, 3], baseFret: 1, barres: [3] },
  "Dm":  { frets: [-1, -1, 0, 2, 3, 1], baseFret: 1 },
  "Em":  { frets: [0, 2, 2, 0, 0, 0], baseFret: 1 },
  "Fm":  { frets: [1, 3, 3, 1, 1, 1], baseFret: 1, barres: [1] },
  "Gm":  { frets: [3, 5, 5, 3, 3, 3], baseFret: 1, barres: [3] },
  "F#m": { frets: [2, 4, 4, 2, 2, 2], baseFret: 1, barres: [2] },
  "G#m": { frets: [4, 6, 6, 4, 4, 4], baseFret: 1, barres: [4] },
  "Abm": { frets: [4, 6, 6, 4, 4, 4], baseFret: 1, barres: [4] },
  "A#m": { frets: [-1, 1, 3, 3, 2, 1], baseFret: 1, barres: [1] },
  "Bbm": { frets: [-1, 1, 3, 3, 2, 1], baseFret: 1, barres: [1] },
  "C#m": { frets: [-1, 4, 6, 6, 5, 4], baseFret: 1, barres: [4] },
  "Dbm": { frets: [-1, 4, 6, 6, 5, 4], baseFret: 1, barres: [4] },
  "D#m": { frets: [-1, -1, 1, 3, 4, 2], baseFret: 1 },
  "Ebm": { frets: [-1, -1, 1, 3, 4, 2], baseFret: 1 },

  // Seventh
  "A7":  { frets: [-1, 0, 2, 0, 2, 0], baseFret: 1 },
  "B7":  { frets: [-1, 2, 1, 2, 0, 2], baseFret: 1 },
  "C7":  { frets: [-1, 3, 2, 3, 1, 0], baseFret: 1 },
  "D7":  { frets: [-1, -1, 0, 2, 1, 2], baseFret: 1 },
  "E7":  { frets: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  "F7":  { frets: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [1] },
  "G7":  { frets: [3, 2, 0, 0, 0, 1], baseFret: 1 },

  // Minor seventh
  "Am7": { frets: [-1, 0, 2, 0, 1, 0], baseFret: 1 },
  "Bm7": { frets: [-1, 2, 0, 2, 3, 2], baseFret: 1 },
  "Dm7": { frets: [-1, -1, 0, 2, 1, 1], baseFret: 1 },
  "Em7": { frets: [0, 2, 0, 0, 0, 0], baseFret: 1 },
  "Fm7": { frets: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [1] },
  "Gm7": { frets: [3, 5, 3, 3, 3, 3], baseFret: 1, barres: [3] },

  // Sus
  "Asus2": { frets: [-1, 0, 2, 2, 0, 0], baseFret: 1 },
  "Asus4": { frets: [-1, 0, 2, 2, 3, 0], baseFret: 1 },
  "Dsus2": { frets: [-1, -1, 0, 2, 3, 0], baseFret: 1 },
  "Dsus4": { frets: [-1, -1, 0, 2, 3, 3], baseFret: 1 },
  "Esus4": { frets: [0, 2, 2, 2, 0, 0], baseFret: 1 },
  "Gsus4": { frets: [3, 5, 5, 5, 3, 3], baseFret: 1, barres: [3] },
  "Csus4": { frets: [-1, 3, 3, 0, 1, 1], baseFret: 1 },
};

// Guitarra base acústica uses same shapes as violão
const GUITARRA_CHORDS: InstrumentChords = { ...VIOLAO_CHORDS };

// Worship guitar: movable barre chord shapes, typically 5th fret and up (CAGED system)
const GUITARRA_WORSHIP_CHORDS: InstrumentChords = {
  // Major - movable barre shapes
  "C":   { frets: [-1, 3, 5, 5, 5, 3], baseFret: 3, barres: [3] },
  "D":   { frets: [-1, 5, 7, 7, 7, 5], baseFret: 5, barres: [5] },
  "E":   { frets: [-1, 7, 9, 9, 9, 7], baseFret: 7, barres: [7] },
  "F":   { frets: [1, 3, 3, 2, 1, 1], baseFret: 1, barres: [1] },
  "G":   { frets: [3, 5, 5, 4, 3, 3], baseFret: 3, barres: [3] },
  "A":   { frets: [5, 7, 7, 6, 5, 5], baseFret: 5, barres: [5] },
  "B":   { frets: [7, 9, 9, 8, 7, 7], baseFret: 7, barres: [7] },

  // Sharp/flat majors
  "C#":  { frets: [-1, 4, 6, 6, 6, 4], baseFret: 4, barres: [4] },
  "Db":  { frets: [-1, 4, 6, 6, 6, 4], baseFret: 4, barres: [4] },
  "D#":  { frets: [-1, 6, 8, 8, 8, 6], baseFret: 6, barres: [6] },
  "Eb":  { frets: [-1, 6, 8, 8, 8, 6], baseFret: 6, barres: [6] },
  "F#":  { frets: [2, 4, 4, 3, 2, 2], baseFret: 2, barres: [2] },
  "Gb":  { frets: [2, 4, 4, 3, 2, 2], baseFret: 2, barres: [2] },
  "G#":  { frets: [4, 6, 6, 5, 4, 4], baseFret: 4, barres: [4] },
  "Ab":  { frets: [4, 6, 6, 5, 4, 4], baseFret: 4, barres: [4] },
  "A#":  { frets: [6, 8, 8, 7, 6, 6], baseFret: 6, barres: [6] },
  "Bb":  { frets: [6, 8, 8, 7, 6, 6], baseFret: 6, barres: [6] },

  // Minor - movable barre shapes
  "Am":  { frets: [5, 7, 7, 5, 5, 5], baseFret: 5, barres: [5] },
  "Bm":  { frets: [7, 9, 9, 7, 7, 7], baseFret: 7, barres: [7] },
  "Cm":  { frets: [-1, 3, 5, 5, 4, 3], baseFret: 3, barres: [3] },
  "Dm":  { frets: [-1, 5, 7, 7, 6, 5], baseFret: 5, barres: [5] },
  "Em":  { frets: [-1, 7, 9, 9, 8, 7], baseFret: 7, barres: [7] },
  "Fm":  { frets: [1, 3, 3, 1, 1, 1], baseFret: 1, barres: [1] },
  "Gm":  { frets: [3, 5, 5, 3, 3, 3], baseFret: 3, barres: [3] },
  "F#m": { frets: [2, 4, 4, 2, 2, 2], baseFret: 2, barres: [2] },
  "G#m": { frets: [4, 6, 6, 4, 4, 4], baseFret: 4, barres: [4] },
  "Abm": { frets: [4, 6, 6, 4, 4, 4], baseFret: 4, barres: [4] },
  "A#m": { frets: [6, 8, 8, 6, 6, 6], baseFret: 6, barres: [6] },
  "Bbm": { frets: [6, 8, 8, 6, 6, 6], baseFret: 6, barres: [6] },
  "C#m": { frets: [-1, 4, 6, 6, 5, 4], baseFret: 4, barres: [4] },
  "Dbm": { frets: [-1, 4, 6, 6, 5, 4], baseFret: 4, barres: [4] },
  "D#m": { frets: [-1, 6, 8, 8, 7, 6], baseFret: 6, barres: [6] },
  "Ebm": { frets: [-1, 6, 8, 8, 7, 6], baseFret: 6, barres: [6] },

  // Seventh - movable shapes
  "A7":  { frets: [5, 7, 5, 6, 5, 5], baseFret: 5, barres: [5] },
  "B7":  { frets: [7, 9, 7, 8, 7, 7], baseFret: 7, barres: [7] },
  "C7":  { frets: [-1, 3, 5, 3, 5, 3], baseFret: 3, barres: [3] },
  "D7":  { frets: [-1, 5, 7, 5, 7, 5], baseFret: 5, barres: [5] },
  "E7":  { frets: [-1, 7, 9, 7, 9, 7], baseFret: 7, barres: [7] },
  "F7":  { frets: [1, 3, 1, 2, 1, 1], baseFret: 1, barres: [1] },
  "G7":  { frets: [3, 5, 3, 4, 3, 3], baseFret: 3, barres: [3] },

  // Minor seventh - movable shapes
  "Am7": { frets: [5, 7, 5, 5, 5, 5], baseFret: 5, barres: [5] },
  "Bm7": { frets: [7, 9, 7, 7, 7, 7], baseFret: 7, barres: [7] },
  "Dm7": { frets: [-1, 5, 7, 5, 6, 5], baseFret: 5, barres: [5] },
  "Em7": { frets: [-1, 7, 9, 7, 8, 7], baseFret: 7, barres: [7] },
  "Fm7": { frets: [1, 3, 1, 1, 1, 1], baseFret: 1, barres: [1] },
  "Gm7": { frets: [3, 5, 3, 3, 3, 3], baseFret: 3, barres: [3] },

  // Sus - movable shapes
  "Asus2": { frets: [5, 7, 7, 4, 5, 5], baseFret: 4, barres: [5] },
  "Asus4": { frets: [5, 7, 7, 7, 5, 5], baseFret: 5, barres: [5] },
  "Dsus2": { frets: [-1, 5, 7, 7, 5, 5], baseFret: 5, barres: [5] },
  "Dsus4": { frets: [-1, 5, 7, 7, 8, 5], baseFret: 5, barres: [5] },
  "Esus4": { frets: [-1, 7, 9, 9, 10, 7], baseFret: 7, barres: [7] },
  "Gsus4": { frets: [3, 5, 5, 5, 3, 3], baseFret: 3, barres: [3] },
  "Csus4": { frets: [-1, 3, 5, 5, 6, 3], baseFret: 3, barres: [3] },
};

type InstrumentKey = 'violao' | 'guitarra' | 'guitarra_worship';

export const CHORD_DB: Record<string, Record<InstrumentKey, ChordShape>> = {};

for (const [name, shape] of Object.entries(VIOLAO_CHORDS)) {
  CHORD_DB[name] = {
    violao: shape,
    guitarra: GUITARRA_CHORDS[name] || shape,
    guitarra_worship: GUITARRA_WORSHIP_CHORDS[name] || shape,
  };
}
// Add any worship-only chords not in VIOLAO_CHORDS
for (const [name, shape] of Object.entries(GUITARRA_WORSHIP_CHORDS)) {
  if (!CHORD_DB[name]) {
    CHORD_DB[name] = {
      violao: VIOLAO_CHORDS[name] || shape,
      guitarra: VIOLAO_CHORDS[name] || shape,
      guitarra_worship: shape,
    };
  }
}

export function getChordShape(chord: string, instrument: InstrumentKey): ChordShape | null {
  // Direct match
  if (CHORD_DB[chord]?.[instrument]) return CHORD_DB[chord][instrument];

  // Strip bass note (e.g. F9/C -> F9)
  const withoutBass = chord.replace(/\/[A-G][#b]?$/, '');
  if (withoutBass !== chord && CHORD_DB[withoutBass]?.[instrument]) return CHORD_DB[withoutBass][instrument];

  // Strip extensions to find base chord (e.g. F9 -> F, G11 -> G)
  const baseMatch = chord.match(/^([A-G][#b]?m?)/);
  if (baseMatch) {
    const base = baseMatch[1];
    if (CHORD_DB[base + "7"]?.[instrument]) return CHORD_DB[base + "7"][instrument];
    if (CHORD_DB[base]?.[instrument]) return CHORD_DB[base][instrument];
  }

  return null;
}

export function extractChords(text: string): string[] {
  const chordPattern = /\b([A-G][#b]?(?:m|maj|min|dim|aug|sus[24]?|add\d+|7|9|11|13)*(?:\/[A-G][#b]?)?)\b/g;
  const matches = text.match(chordPattern) || [];
  return [...new Set(matches)];
}

export function splitSegments(cifraText: string): string[] {
  const normalized = cifraText.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sectionTagRegex = /^\s*\[[^\]]+\]\s*$/;

  // Prefer explicit section tags: [Primeira Parte], [Refrão], etc.
  if (lines.some((line) => sectionTagRegex.test(line))) {
    const segments: string[] = [];
    let current: string[] = [];

    for (const line of lines) {
      if (sectionTagRegex.test(line)) {
        if (current.join("\n").trim()) segments.push(current.join("\n").trim());
        current = [line.trim()];
      } else {
        current.push(line);
      }
    }

    if (current.join("\n").trim()) segments.push(current.join("\n").trim());
    return segments.filter((segment) => segment.length > 0);
  }

  // Fallback: split by blank lines but keep bigger chunks together
  const raw = normalized
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const MIN_LINES = 6;
  const merged: string[] = [];
  let buffer = "";

  for (const block of raw) {
    if (!buffer) {
      buffer = block;
      continue;
    }

    const bufferLines = buffer.split("\n").filter((l) => l.trim().length > 0).length;
    if (bufferLines < MIN_LINES) {
      buffer += "\n\n" + block;
    } else {
      merged.push(buffer);
      buffer = block;
    }
  }

  if (buffer) merged.push(buffer);
  return merged;
}

export const CHROMATIC_KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
