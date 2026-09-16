// Audio key detection via chroma + Krumhansl-Schmuckler key profiles.
// Self-contained (small radix-2 FFT) — no external deps.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Krumhansl-Schmuckler tonal hierarchy profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

export interface DetectedKey {
  pc: number; // tonic pitch class, 0 = C
  mode: "major" | "minor";
  name: string; // chord notation, e.g. "G" or "Em"
  label: string; // pt-BR, e.g. "G maior"
  confidence: number; // 0..1
}

// In-place iterative radix-2 Cooley-Tukey FFT
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k, b = a + (len >> 1);
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export function detectKeyFromBuffer(buffer: AudioBuffer): DetectedKey | null {
  const sr = buffer.sampleRate;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const total = ch0.length;
  if (total < sr) return null;

  // Analyze up to 60s from the middle (most representative of the song)
  const span = Math.min(total, sr * 60);
  const start = Math.floor((total - span) / 2);
  const N = 8192;
  const hop = 4096;

  const hann = new Float32Array(N);
  for (let i = 0; i < N; i++) hann[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));

  const chroma = new Array(12).fill(0);
  const re = new Float32Array(N), im = new Float32Array(N);

  for (let p = start; p + N <= start + span; p += hop) {
    for (let i = 0; i < N; i++) {
      const s = ch1 ? (ch0[p + i] + ch1[p + i]) * 0.5 : ch0[p + i];
      re[i] = s * hann[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < N >> 1; k++) {
      const freq = (k * sr) / N;
      if (freq < 55 || freq > 2100) continue; // focus on tonal range (A1..~C7)
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = (((Math.round(midi) % 12) + 12) % 12);
      chroma[pc] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i];
  if (sum <= 0) return null;
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  let best = { score: -Infinity, pc: 0, mode: "major" as "major" | "minor" };
  let second = -Infinity;
  for (let t = 0; t < 12; t++) {
    const majProfile = MAJOR.map((_, i) => MAJOR[((i - t) % 12 + 12) % 12]);
    const minProfile = MINOR.map((_, i) => MINOR[((i - t) % 12 + 12) % 12]);
    const sMaj = pearson(chroma, majProfile);
    const sMin = pearson(chroma, minProfile);
    if (sMaj > best.score) { second = best.score; best = { score: sMaj, pc: t, mode: "major" }; }
    else if (sMaj > second) second = sMaj;
    if (sMin > best.score) { second = best.score; best = { score: sMin, pc: t, mode: "minor" }; }
    else if (sMin > second) second = sMin;
  }

  const name = NOTE_NAMES[best.pc] + (best.mode === "minor" ? "m" : "");
  const label = `${NOTE_NAMES[best.pc]} ${best.mode === "minor" ? "menor" : "maior"}`;
  // Confidence: gap between the best and the runner-up, scaled
  const confidence = Math.max(0, Math.min(1, (best.score - Math.max(0, second)) * 3 + best.score * 0.5));
  return { pc: best.pc, mode: best.mode, name, label, confidence };
}

// Transpose a detected key by N semitones, keeping the mode.
export function transposeKeyName(pc: number, mode: "major" | "minor", semitones: number): string {
  const np = (((pc + semitones) % 12) + 12) % 12;
  return NOTE_NAMES[np] + (mode === "minor" ? "m" : "");
}

const BASE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Parse a stored key name (e.g. "G", "C#", "Bbm", "Em") back into a DetectedKey.
export function parseKeyName(name: string | null | undefined): DetectedKey | null {
  if (!name) return null;
  const m = name.trim().match(/^([A-Ga-g])([#b♯♭])?\s*(m|min|menor)?\b/);
  if (!m) return null;
  let pc = BASE_PC[m[1].toUpperCase()];
  if (pc === undefined) return null;
  if (m[2] === "#" || m[2] === "♯") pc = (pc + 1) % 12;
  else if (m[2] === "b" || m[2] === "♭") pc = (pc + 11) % 12;
  const mode: "major" | "minor" = m[3] ? "minor" : "major";
  const nm = NOTE_NAMES[pc] + (mode === "minor" ? "m" : "");
  return { pc, mode, name: nm, label: `${NOTE_NAMES[pc]} ${mode === "minor" ? "menor" : "maior"}`, confidence: 1 };
}

// ---- essentia.js (loaded on demand) — much more accurate than the chroma fallback ----
let essentiaPromise: Promise<any> | null = null;
async function getEssentia(): Promise<any> {
  if (!essentiaPromise) {
    essentiaPromise = (async () => {
      const [wasmMod, coreMod] = await Promise.all([
        import("essentia.js/dist/essentia-wasm.es.js"),
        import("essentia.js/dist/essentia.js-core.es.js"),
      ]);
      const EssentiaWASM = (wasmMod as any).EssentiaWASM;
      const Essentia = (coreMod as any).default;
      // The WASM runtime initializes asynchronously — wait for it before constructing.
      if (!EssentiaWASM.calledRun) {
        await new Promise<void>((resolve) => {
          const prev = EssentiaWASM.onRuntimeInitialized;
          EssentiaWASM.onRuntimeInitialized = () => { try { prev && prev(); } catch { /* noop */ } resolve(); };
          if (EssentiaWASM.calledRun) resolve();
        });
      }
      return new Essentia(EssentiaWASM);
    })();
  }
  return essentiaPromise;
}

async function detectKeyEssentia(buffer: AudioBuffer): Promise<DetectedKey | null> {
  const essentia = await getEssentia();
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
  const span = Math.min(ch0.length, buffer.sampleRate * 180); // up to 3 min from the middle
  const start = Math.floor((ch0.length - span) / 2);
  const mono = new Float32Array(span);
  for (let i = 0; i < span; i++) mono[i] = ch1 ? (ch0[start + i] + ch1[start + i]) * 0.5 : ch0[start + i];
  const vec = essentia.arrayToVector(mono);
  try {
    // KeyExtractor with the EDMA profile (best for pop/worship) and the real sample rate
    const r = essentia.KeyExtractor(vec, true, 4096, 4096, 12, 3500, 60, 25, 0.2, "edma", buffer.sampleRate, 0.0001, 440, "cosine", "hann");
    const parsed = parseKeyName(String(r.key) + (r.scale === "minor" ? "m" : ""));
    if (parsed) parsed.confidence = typeof r.strength === "number" ? r.strength : 1;
    return parsed;
  } finally {
    try { vec.delete(); } catch { /* noop */ }
  }
}

// Fetch + decode + detect key from a (signed) audio URL. Uses essentia.js, falls back to chroma.
export async function detectKeyFromUrl(url: string): Promise<DetectedKey | null> {
  const resp = await fetch(url);
  const arr = await resp.arrayBuffer();
  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buf = await ctx.decodeAudioData(arr);
    try {
      return await detectKeyEssentia(buf);
    } catch (e) {
      console.warn("essentia key detection failed; using chroma fallback", e);
      return detectKeyFromBuffer(buf);
    }
  } finally {
    ctx.close();
  }
}
