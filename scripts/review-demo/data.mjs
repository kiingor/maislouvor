// Dados da conta de revisão das lojas (App Store "Sign-in required" / Google Play
// "App access"). Tudo aqui é fictício e puro: nenhuma rede, nenhum arquivo, nenhum
// relógio implícito. seed.mjs usa estes construtores para gravar no Supabase e os
// testes (scripts/review-demo/seed.test.mjs e supabase/tests/review_demo_seed.mjs)
// conferem o mesmo resultado.
//
// Letras, cifras e guias de áudio das músicas "Equipe Demonstração" são originais,
// escritas para esta demonstração. A única gravação de terceiros é o trecho de
// "Baby Bird" (Admiral Bob, CC BY 3.0), com a atribuição exigida pela licença.

export const TIME_ZONE = 'America/Sao_Paulo';

/** Marca gravada no app_metadata (só a service_role altera) de cada conta de revisão. */
export const REVIEW_MARKER = 'review_demo';

export const DEMO_TEAM_NAME = 'Igreja Demonstração (App Review)';
export const DEMO_ARTIST = 'Equipe Demonstração';

/** Credenciais ficam só neste arquivo (diretório 700, arquivo 600), nunca no terminal. */
export const CREDENTIALS_RELATIVE_PATH = '.local/share/maislouvor-review/credentials.json';

export const LEADER = Object.freeze({
  key: 'leader',
  email: 'revisao@maislouvor.com',
  fullName: 'Líder Demonstração',
  role: 'admin',
  instruments: ['Ministrante', 'Violão'],
});

// Membros fictícios: sem telefone, sem senha (não fazem login), sem push e sem
// vínculo com o WhatsApp.
export const MEMBERS = Object.freeze([
  { key: 'ana', email: 'membro1.revisao@maislouvor.com', fullName: 'Ana Exemplo', role: 'editor', instruments: ['Ministrante', 'Soprano'] },
  { key: 'bruno', email: 'membro2.revisao@maislouvor.com', fullName: 'Bruno Exemplo', role: 'viewer', instruments: ['Teclado', 'Baixo'] },
  { key: 'carla', email: 'membro3.revisao@maislouvor.com', fullName: 'Carla Exemplo', role: 'viewer', instruments: ['Contralto', 'Violão'] },
  { key: 'davi', email: 'membro4.revisao@maislouvor.com', fullName: 'Davi Exemplo', role: 'viewer', instruments: ['Bateria', 'Cajon'] },
]);

export const PEOPLE = Object.freeze([LEADER, ...MEMBERS]);
export const DEMO_EMAILS = Object.freeze(PEOPLE.map((person) => person.email));

/** Avisos automáticos do Asafe, todos desligados para a equipe de revisão. */
export const ASSISTANT_NOTICES_OFF = Object.freeze({
  cultos: false, escala: false, repertorio: false, avisos: false, lembretes: false,
});

// ---------------------------------------------------------------------------
// Músicas
// ---------------------------------------------------------------------------

const cifra = (...lines) => lines.join('\n');

/**
 * Cinco músicas originais. `guide` é a progressão tocada no áudio-guia gerado
 * por renderGuideWav (um acorde por compasso, no tom original).
 */
export const ORIGINAL_SONGS = Object.freeze([
  {
    key: 'manha-de-graca',
    title: 'Manhã de Graça',
    theme: 'Celebração',
    keyOriginal: 'G',
    bpm: 112,
    tags: ['abertura', 'alegria'],
    guide: ['G', 'D', 'Em', 'C'],
    cifra: cifra(
      '[Intro]',
      'G   D   Em   C',
      '',
      '[Verso]',
      'G                       D',
      'Abro a janela e vejo o dia chegar',
      'Em                       C',
      'Cada raio de sol me ensina a confiar',
      'G                    D',
      'O orvalho no campo, o canto no ar',
      'Em             C             D',
      'Tudo em mim desperta pra Te louvar',
      '',
      '[Pré-refrão]',
      'C                 D',
      'Não foi a sorte, não foi o acaso',
      'Em          D           C',
      'Foi Tua mão que me guardou',
      '',
      '[Refrão]',
      'G         D',
      'Manhã de graça',
      'Em            C',
      'Teu amor chegou primeiro',
      'G         D',
      'Manhã de graça',
      'Em         D          G',
      'Hoje eu canto por inteiro',
      '',
      '[Final]',
      'C   D   G',
    ),
  },
  {
    key: 'rio-de-paz',
    title: 'Rio de Paz',
    theme: 'Adoração',
    keyOriginal: 'D',
    bpm: 68,
    tags: ['adoração', 'calma'],
    guide: ['D', 'A/C#', 'Bm', 'G'],
    cifra: cifra(
      '[Intro]',
      'D   A/C#   Bm   G',
      '',
      '[Verso]',
      'D                        A/C#',
      'Quando a tarde cai e o ruído se cala',
      'Bm                       G',
      'Eu me aquieto aqui, Tua voz me alcança',
      'D                     A',
      'Como um rio manso a correr pelo chão',
      'G             A              D',
      'Tua paz encontra o meu coração',
      '',
      '[Refrão]',
      'G            D',
      'Corre em mim, rio de paz',
      'A               Bm',
      'Lava, renova, refaz',
      'G            D',
      'Corre em mim, rio de paz',
      'A                   D',
      'Onde Tu estás há descanso',
    ),
  },
  {
    key: 'mesa-posta',
    title: 'Mesa Posta',
    theme: 'Comunhão',
    keyOriginal: 'C',
    bpm: 76,
    tags: ['comunhão', 'ceia'],
    guide: ['C', 'F', 'Am', 'G'],
    cifra: cifra(
      '[Intro]',
      'C   F   Am   G',
      '',
      '[Verso]',
      'C                  F',
      'Há lugar pra todos nesta mesa',
      'Am                 G',
      'Pão repartido, a mesma certeza',
      'C                    F',
      'Quem chegou cansado pode descansar',
      'Am          G          C',
      'Aqui é casa, pode entrar',
      '',
      '[Refrão]',
      'F           G',
      'Somos um só povo',
      'Em            Am',
      'Em volta do mesmo pão',
      'F           G',
      'Somos um só povo',
      'F          G         C',
      'Com um só coração',
    ),
  },
  {
    key: 'passo-a-passo',
    title: 'Passo a Passo',
    theme: 'Gratidão',
    keyOriginal: 'A',
    bpm: 92,
    tags: ['gratidão'],
    guide: ['A', 'E', 'F#m', 'D'],
    cifra: cifra(
      '[Intro]',
      'A   E   F#m   D',
      '',
      '[Verso]',
      'A                     E',
      'Cada passo que eu dei, Tu estavas lá',
      'F#m                    D',
      'Nas subidas e nas curvas do lugar',
      'A                       E',
      'Não contei sozinho as horas da estrada',
      'F#m          D           E',
      'Tua mão foi minha morada',
      '',
      '[Refrão]',
      'D            A',
      'Obrigado, Senhor',
      'E              F#m',
      'Por cada amanhecer',
      'D            A',
      'Passo a passo',
      'E                     A',
      'Eu aprendo a Te conhecer',
    ),
  },
  {
    key: 'esperanca-firme',
    title: 'Esperança Firme',
    theme: 'Esperança',
    keyOriginal: 'E',
    bpm: 84,
    tags: ['esperança', 'encerramento'],
    guide: ['E', 'B', 'C#m', 'A'],
    cifra: cifra(
      '[Intro]',
      'E   B   C#m   A',
      '',
      '[Verso]',
      'E                      B',
      'Mesmo quando o vento sopra contra mim',
      'C#m                    A',
      'Há uma promessa que não chega ao fim',
      'E                      B',
      'O mar pode crescer, a noite demorar',
      'C#m           A            B',
      'A esperança vai ficar',
      '',
      '[Refrão]',
      'A           E',
      'Firme, firme',
      'B               C#m',
      'Como âncora no mar',
      'A           E',
      'Firme, firme',
      'B                 E',
      'Em Ti vou descansar',
    ),
  },
]);

export const BABY_BIRD_SOURCE_URL = 'https://ccmixter.org/files/admiralbob77/25039';
export const BABY_BIRD_LICENSE_URL = 'https://creativecommons.org/licenses/by/3.0/';
/** 4 compassos de 4/4 a 70 BPM. */
const BABY_BIRD_HALF = Math.round(((4 * 4 * 60) / 70) * 100) / 100;

/**
 * Multitrack de terceiros (CC BY 3.0). Os arquivos ficam em assets/baby-bird e
 * são os mesmos da landing (credits.json traz origem, cortes e sha256). A cifra
 * não transcreve acordes: é um roteiro de ensaio com a atribuição da licença,
 * para nada ser inventado sobre a gravação.
 */
export const BABY_BIRD = Object.freeze({
  key: 'baby-bird',
  title: 'Baby Bird (demo)',
  artist: 'Admiral Bob',
  theme: 'Ensaio',
  keyOriginal: 'C',
  bpm: 70,
  durationSeconds: 27,
  tags: ['multitrack', 'cc-by'],
  mediaUrl: BABY_BIRD_SOURCE_URL,
  mix: { file: 'baby-bird/mix.m4a', ext: 'm4a', contentType: 'audio/mp4' },
  // Mesma ordem e rótulos das faixas separadas pelo app (stems-callback).
  stems: [
    { key: 'vocals', label: 'Vocais', file: 'baby-bird/vocals.m4a' },
    { key: 'drums', label: 'Bateria', file: 'baby-bird/drums.m4a' },
    { key: 'bass', label: 'Baixo', file: 'baby-bird/bass.m4a' },
    { key: 'guitar', label: 'Violão', file: 'baby-bird/guitar.m4a' },
    { key: 'keys', label: 'Teclado', file: 'baby-bird/keys.m4a' },
  ],
  loops: [
    { label: 'Primeira parte', start: 0, end: BABY_BIRD_HALF, repeat: 2,
      notes: 'No mixer, deixe só Vocais e Teclado para pegar a melodia.' },
    { label: 'Segunda parte', start: BABY_BIRD_HALF, end: 27.4, repeat: 0,
      notes: 'Repita até a entrada ficar firme. Depois ligue todas as faixas.' },
  ],
  cifra: cifra(
    'Baby Bird — Admiral Bob (2010)',
    'Licença: CC BY 3.0 — ' + BABY_BIRD_LICENSE_URL,
    'Fonte: ' + BABY_BIRD_SOURCE_URL,
    'Trecho de 27 s (de 0:34 a 1:01), com fades e ajuste de ganho.',
    'Sem endosso do artista.',
    '',
    '[Roteiro de ensaio]',
    'Tom: C · 70 BPM · 4/4 · 8 compassos',
    'Faixas: Vocais, Bateria, Baixo, Violão e Teclado',
    '',
    '1. Ouça a mixagem completa.',
    '2. No modo ensaio, abra o Mixer e deixe só Vocais e Teclado.',
    '3. Use o loop "Primeira parte" para repetir os 4 primeiros compassos.',
    '4. Ligue Baixo e Bateria e toque junto com a gravação.',
  ),
});

export const ALL_SONG_KEYS = Object.freeze([...ORIGINAL_SONGS.map((song) => song.key), BABY_BIRD.key]);

// ---------------------------------------------------------------------------
// Utilitários puros
// ---------------------------------------------------------------------------

/** Data local (YYYY-MM-DD) no fuso informado. */
export function localDateISO(date, timeZone = TIME_ZONE) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysISO(iso, days) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Primeiro domingo com pelo menos `minDays` dias de folga (a revisão leva alguns dias). */
export function upcomingSunday(todayISO, minDays = 3) {
  for (let offset = minDays; offset < minDays + 7; offset++) {
    const candidate = addDaysISO(todayISO, offset);
    if (new Date(`${candidate}T12:00:00Z`).getUTCDay() === 0) return candidate;
  }
  throw new Error('unreachable');
}

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto',
  'setembro', 'outubro', 'novembro', 'dezembro'];
export function dayMonthLabel(iso) {
  const [, month, day] = iso.split('-').map(Number);
  return `${day} de ${MONTHS[month - 1]}`;
}

const CHORD_TOKEN = /^[A-G](?:#|b)?(?:m|maj7|7|9|sus2|sus4|add9|dim|aug)*(?:\/[A-G](?:#|b)?)?$/;
/** Mesmo critério do app (src/lib/chordpro.ts): a maioria dos tokens é acorde. */
export function isChordLine(line) {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  return tokens.filter((token) => CHORD_TOKEN.test(token)).length / tokens.length >= 0.6;
}

/** Letra a partir da cifra: tira as linhas de acordes e as partes que ficam vazias. */
export function lyricsFromCifra(text) {
  const sections = [];
  let current = null;
  for (const line of text.split('\n')) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      current = { tag: line.trim(), lines: [] };
      sections.push(current);
    } else if (!isChordLine(line) && line.trim()) {
      if (!current) { current = { tag: null, lines: [] }; sections.push(current); }
      current.lines.push(line.trim());
    }
  }
  const lyrics = sections
    .filter((section) => section.lines.length)
    .map((section) => [section.tag, ...section.lines].filter(Boolean).join('\n'))
    .join('\n\n');
  return lyrics || null;
}

// ---------------------------------------------------------------------------
// Senha
// ---------------------------------------------------------------------------

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const PASSWORD_ALPHABET = UPPER + LOWER + DIGITS;

/**
 * Senha legível (sem 0/O/1/l/I) em 4 blocos de 4: ~92 bits. `randomBytes(n)`
 * vem de node:crypto; o sorteio descarta bytes enviesados.
 */
export function generatePassword(randomBytes) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const chars = [];
    const limit = 256 - (256 % PASSWORD_ALPHABET.length);
    while (chars.length < 16) {
      for (const byte of randomBytes(32)) {
        if (byte < limit && chars.length < 16) chars.push(PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]);
      }
    }
    const password = [0, 4, 8, 12].map((i) => chars.slice(i, i + 4).join('')).join('-');
    if (/[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password)) return password;
  }
  throw new Error('Não foi possível gerar a senha.');
}

// ---------------------------------------------------------------------------
// Áudio-guia (WAV) das músicas originais
// ---------------------------------------------------------------------------

const NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6,
  G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

/** Acordes simples do guia: maior, menor, com sétima e baixo invertido. */
export function chordTones(symbol) {
  const match = /^([A-G](?:#|b)?)(m(?!aj))?(7)?(?:\/([A-G](?:#|b)?))?$/.exec(symbol);
  if (!match) throw new Error(`Acorde não suportado no guia: ${symbol}`);
  const root = NOTE_INDEX[match[1]];
  const intervals = [0, match[2] ? 3 : 4, 7, ...(match[3] ? [10] : [])];
  const bass = match[4] ? NOTE_INDEX[match[4]] : root;
  // Voicing entre Sol 3 e Fá# 4; baixo entre Mi 2 e Ré# 3.
  const rootMidi = 55 + ((root - 7 + 12) % 12);
  return { notes: intervals.map((interval) => rootMidi + interval), bass: 40 + ((bass - 4 + 12) % 12) };
}

const midiToHz = (midi) => 440 * 2 ** ((midi - 69) / 12);

export const GUIDE_SAMPLE_RATE = 22050;
const GUIDE_MIN_SECONDS = 24;
const GUIDE_TAIL_SECONDS = 1.5;

/** Quantos compassos o guia tem (progressão repetida até ~24 s + compasso final). */
export function guideLayout({ guide, bpm }) {
  const barSeconds = (60 / bpm) * 4;
  const repeats = Math.max(1, Math.ceil(GUIDE_MIN_SECONDS / (barSeconds * guide.length)));
  const bars = Array.from({ length: repeats }, () => guide).flat().concat(guide[0]);
  const seconds = bars.length * barSeconds + GUIDE_TAIL_SECONDS;
  return { bars, barSeconds, seconds, samples: Math.ceil(seconds * GUIDE_SAMPLE_RATE) };
}

export function guideByteLength(song) {
  return 44 + guideLayout(song).samples * 2;
}

function addTone(buffer, sampleRate, freq, startSeconds, amp, tau, maxSeconds) {
  const start = Math.floor(startSeconds * sampleRate);
  const length = Math.min(buffer.length - start, Math.floor(maxSeconds * sampleRate));
  const omega = (2 * Math.PI * freq) / sampleRate;
  for (let k = 0; k < length; k++) {
    const t = k / sampleRate;
    const envelope = (t < 0.006 ? t / 0.006 : 1) * Math.exp(-t / tau);
    buffer[start + k] += amp * envelope
      * (Math.sin(omega * k) + 0.35 * Math.sin(2 * omega * k) + 0.12 * Math.sin(3 * omega * k));
  }
}

/**
 * Guia harmônico sintetizado (acordes com ataque de piano a cada tempo e baixo
 * nos tempos 1 e 3). Determinístico: mesma música, mesmos bytes. WAV PCM 16 bits mono.
 */
export function renderGuideWav(song) {
  const { bars, barSeconds, samples } = guideLayout(song);
  const sampleRate = GUIDE_SAMPLE_RATE;
  const beat = barSeconds / 4;
  const buffer = new Float32Array(samples);
  bars.forEach((symbol, barIndex) => {
    const { notes, bass } = chordTones(symbol);
    const last = barIndex === bars.length - 1;
    for (let b = 0; b < (last ? 1 : 4); b++) {
      const at = (barIndex * 4 + b) * beat;
      const ring = last ? barSeconds + GUIDE_TAIL_SECONDS : beat * 1.25;
      for (const note of notes) addTone(buffer, sampleRate, midiToHz(note), at, b === 0 ? 0.24 : 0.15, last ? 1.6 : 0.5, ring);
      if (b % 2 === 0) addTone(buffer, sampleRate, midiToHz(bass), at, 0.42, last ? 2 : 0.9, last ? ring : beat * 2.1);
    }
  });
  let peak = 0;
  for (const value of buffer) peak = Math.max(peak, Math.abs(value));
  const gain = peak > 0 ? 0.85 / peak : 0;
  const fade = Math.floor(0.4 * sampleRate);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); ascii(8, 'WAVE');
  ascii(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const fadeGain = i > samples - fade ? (samples - i) / fade : 1;
    const value = Math.max(-1, Math.min(1, buffer[i] * gain * fadeGain));
    view.setInt16(44 + i * 2, Math.round(value * 32767), true);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Plano completo
// ---------------------------------------------------------------------------

/**
 * Linhas de cada tabela, na ordem de gravação. `refs` liga as chaves das pessoas
 * aos ids reais: { teamId, profiles: { leader, ana, ... }, members: { leader, ana, ... } }.
 * `uuid` gera os ids das linhas novas (crypto.randomUUID em produção).
 */
export function buildContent({ now, uuid, refs }) {
  const today = localDateISO(now);
  const { teamId, profiles: profile, members: member } = refs;
  const at = (minutesAgo) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();

  const files = [];
  const songs = [];
  const songIds = {};
  for (const song of ORIGINAL_SONGS) {
    const id = uuid();
    songIds[song.key] = id;
    const path = `${teamId}/${id}.wav`;
    files.push({ bucket: 'audio', path, contentType: 'audio/wav', source: { kind: 'guide', song: song.key },
      bytes: guideByteLength(song) });
    songs.push({
      id, team_id: teamId, title: song.title, artist: DEMO_ARTIST,
      key_original: song.keyOriginal, key_current: song.keyOriginal, theme: song.theme, tags: song.tags,
      cifra_text: song.cifra, lyrics_text: lyricsFromCifra(song.cifra), bpm: song.bpm,
      duration_seconds: Math.round(guideLayout(song).seconds), audio_path: path, audio_revision: uuid(),
      media_url: null, recording_source_url: null, is_draft: false, draft_repertorio_ids: [],
      stems_status: 'idle', created_by: profile.leader,
    });
  }

  const babyId = uuid();
  songIds[BABY_BIRD.key] = babyId;
  const babyAudio = `${teamId}/${babyId}.${BABY_BIRD.mix.ext}`;
  files.push({ bucket: 'audio', path: babyAudio, contentType: BABY_BIRD.mix.contentType,
    source: { kind: 'asset', file: BABY_BIRD.mix.file } });
  songs.push({
    id: babyId, team_id: teamId, title: BABY_BIRD.title, artist: BABY_BIRD.artist,
    key_original: BABY_BIRD.keyOriginal, key_current: BABY_BIRD.keyOriginal, theme: BABY_BIRD.theme,
    tags: BABY_BIRD.tags, cifra_text: BABY_BIRD.cifra, lyrics_text: null, bpm: BABY_BIRD.bpm,
    duration_seconds: BABY_BIRD.durationSeconds, audio_path: babyAudio, audio_revision: uuid(),
    media_url: BABY_BIRD.mediaUrl, recording_source_url: null, is_draft: false, draft_repertorio_ids: [],
    stems_status: 'done', created_by: profile.leader,
  });
  // Mesmo caminho das faixas separadas pelo app: uma nova separação substitui estas.
  const song_tracks = BABY_BIRD.stems.map((stem, index) => {
    const path = `${teamId}/${babyId}/stems/${stem.key}.m4a`;
    files.push({ bucket: 'audio', path, contentType: 'audio/mp4', source: { kind: 'asset', file: stem.file } });
    return { id: uuid(), song_id: babyId, track_name: stem.label, audio_path: path, sort_order: index };
  });

  const repertorioId = uuid();
  const repertorios = [{ id: repertorioId, team_id: teamId, name: 'Repertório da Demonstração',
    created_by: profile.leader, is_public: false }];
  const repertorio_songs = ALL_SONG_KEYS.map((key, index) => ({
    id: uuid(), repertorio_id: repertorioId, song_id: songIds[key], sort_order: index,
  }));

  const sunday = upcomingSunday(today);
  const nextSunday = addDaysISO(sunday, 7);
  const culto1 = uuid();
  const culto2 = uuid();
  const cultos = [
    { id: culto1, team_id: teamId, created_by: profile.leader, name: 'Culto de Domingo', date: sunday,
      description: 'Ensaio no sábado às 16h. Passagem de som às 18h.', is_public: false },
    { id: culto2, team_id: teamId, created_by: profile.leader, name: 'Culto de Celebração', date: nextSunday,
      description: 'Noite de gratidão com a equipe completa.', is_public: false },
  ];
  // Roteiro: músicas e momentos compartilham a mesma sequência (sort_order).
  const culto_blocks = [
    { id: uuid(), culto_id: culto1, title: 'Boas-vindas', kind: 'Abertura', duration_min: 5, notes: null, sort_order: 0 },
    { id: uuid(), culto_id: culto1, title: 'Mensagem', kind: 'Palavra', duration_min: 30, notes: null, sort_order: 5 },
    { id: uuid(), culto_id: culto1, title: 'Bênção final', kind: 'Encerramento', duration_min: 5, notes: null, sort_order: 6 },
    { id: uuid(), culto_id: culto2, title: 'Mensagem', kind: 'Palavra', duration_min: 30, notes: null, sort_order: 3 },
  ];
  const cultoSong = (cultoId, key, sortOrder, extra = {}) => ({
    id: uuid(), culto_id: cultoId, song_id: songIds[key], sort_order: sortOrder,
    notes: null, notes_author_id: null, key_override: null, ...extra,
  });
  const culto_songs = [
    cultoSong(culto1, 'manha-de-graca', 1),
    cultoSong(culto1, 'rio-de-paz', 2, { key_override: 'E', notes: 'Começar só com teclado no primeiro verso.',
      notes_author_id: profile.leader }),
    cultoSong(culto1, 'baby-bird', 3),
    cultoSong(culto1, 'mesa-posta', 4),
    cultoSong(culto2, 'passo-a-passo', 0),
    cultoSong(culto2, 'esperanca-firme', 1),
    cultoSong(culto2, 'manha-de-graca', 2),
  ];
  const opening = culto_songs[0].id;
  const culto_song_voices = [
    { id: uuid(), culto_song_id: opening, team_member_id: member.ana, voice: 1, voice_part: null },
    { id: uuid(), culto_song_id: opening, team_member_id: member.carla, voice: 2, voice_part: null },
  ];
  const lineup = (cultoId, key, instrument, status) => ({
    id: uuid(), culto_id: cultoId, team_member_id: member[key], instrument, status,
  });
  const culto_lineup = [
    lineup(culto1, 'leader', 'Ministrante', 'accepted'),
    lineup(culto1, 'ana', 'Soprano', 'accepted'),
    lineup(culto1, 'carla', 'Contralto', 'pending'),
    lineup(culto1, 'bruno', 'Teclado', 'accepted'),
    lineup(culto1, 'davi', 'Bateria', 'accepted'),
    lineup(culto2, 'ana', 'Ministrante', 'pending'),
    lineup(culto2, 'leader', 'Violão', 'accepted'),
    lineup(culto2, 'carla', 'Contralto', 'accepted'),
    lineup(culto2, 'bruno', 'Baixo', 'pending'),
  ];
  const availability = (key, date, status, instruments, reason = null) => ({
    id: uuid(), team_member_id: member[key], available_date: date, status, instruments, reason,
  });
  const member_availability = [
    availability('ana', sunday, 'available', ['Soprano', 'Ministrante']),
    availability('bruno', sunday, 'available', ['Teclado']),
    availability('carla', sunday, 'available', ['Contralto']),
    availability('davi', sunday, 'available', ['Bateria']),
    availability('bruno', nextSunday, 'available', ['Baixo']),
    availability('carla', nextSunday, 'available', ['Contralto']),
    availability('davi', nextSunday, 'unavailable', [], 'Viagem em família'),
  ];

  const channelId = uuid();
  const channels = [{ id: channelId, team_id: teamId, name: 'Ensaios',
    description: 'Combinados de ensaio e passagem de som', created_by: profile.leader, sort_order: 0 }];
  const message = (key, minutesAgo, content, channel = null) => ({
    id: uuid(), team_id: teamId, culto_id: null, channel_id: channel, sender_profile_id: profile[key],
    content, message_type: 'text', attachment_path: null, created_at: at(minutesAgo),
  });
  const messages = [
    message('ana', 1800, 'Bom dia, equipe! O ensaio de sábado fica às 16h, combinado?'),
    message('bruno', 1780, 'Combinado. Levo o teclado e o cabo extra.'),
    message('carla', 1745, 'Consigo chegar às 16h30, tudo bem?'),
    message('leader', 1730, 'Tudo certo, Carla. Começamos pela passagem de som.'),
    message('davi', 1500, 'Já ouvi o repertório no app. A ordem ficou ótima.'),
    message('ana', 1440, 'A Rio de Paz em Mi encaixou melhor para a minha voz.'),
    message('bruno', 1410, 'No modo ensaio dá para deixar só o teclado no mixer. Ajuda muito.'),
    message('carla', 1380, 'Obrigada, gente! Até sábado.'),
    message('leader', 900, 'Canal para combinar os ensaios e a passagem de som.', channelId),
    message('davi', 840, 'Vou praticar a Baby Bird só com a bateria e o baixo no mixer.', channelId),
    message('ana', 780, 'Boa! Deixei um loop marcado na primeira parte.', channelId),
  ];

  const song_loop_points = BABY_BIRD.loops.map((loop, index) => ({
    id: uuid(), song_id: babyId, profile_id: index === 0 ? profile.leader : profile.ana, label: loop.label,
    start_time: loop.start, end_time: loop.end, is_public: true, repeat_count: loop.repeat,
    sort_order: index, notes: loop.notes,
  }));

  const notifications = [
    { id: uuid(), profile_id: profile.leader, team_id: teamId, sender_profile_id: profile.ana, type: 'lineup',
      title: 'Você está na escala!', body: `Culto de Domingo • ${dayMonthLabel(sunday)}`,
      link: `/app/cultos/${culto1}`, read: false, created_at: at(180) },
    { id: uuid(), profile_id: profile.leader, team_id: teamId, sender_profile_id: profile.ana, type: 'manual',
      title: 'Ensaio confirmado', body: 'Sábado às 16h. Tragam as cifras atualizadas.', link: null,
      read: false, created_at: at(1200) },
  ];

  return {
    today,
    files,
    // Ordem de gravação: cada tabela só depende das anteriores.
    tables: [
      ['songs', songs],
      ['song_tracks', song_tracks],
      ['repertorios', repertorios],
      ['repertorio_songs', repertorio_songs],
      ['cultos', cultos],
      ['culto_blocks', culto_blocks],
      ['culto_songs', culto_songs],
      ['culto_song_voices', culto_song_voices],
      ['culto_lineup', culto_lineup],
      ['member_availability', member_availability],
      ['channels', channels],
      ['messages', messages],
      ['song_loop_points', song_loop_points],
      ['notifications', notifications],
    ],
  };
}

/** Linhas de equipe/membros (gravadas antes do conteúdo, depois das contas). */
export function buildTeam({ teamId, profiles }) {
  return {
    team: { id: teamId, name: DEMO_TEAM_NAME, owner_id: profiles.leader },
    members: PEOPLE.map((person) => ({
      team_id: teamId, profile_id: profiles[person.key], role: person.role, instruments: person.instruments,
    })),
    assistant: { team_id: teamId, enabled: false, notification_settings: { ...ASSISTANT_NOTICES_OFF } },
  };
}

/** Atributos das contas no Auth. A senha só existe para o líder (os demais não fazem login). */
export function buildUsers(password) {
  return PEOPLE.map((person) => ({
    key: person.key,
    email: person.email,
    password: person.key === LEADER.key ? password : undefined,
    email_confirm: true,
    user_metadata: { full_name: person.fullName },
    app_metadata: { [REVIEW_MARKER]: true },
  }));
}
