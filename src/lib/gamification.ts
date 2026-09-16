/**
 * Gamificação — camada de dados da FATIA VISUAL (avatar + ranking + jardim).
 *
 * IMPORTANTE: nesta fase tudo é MOCK + localStorage (sem backend). A pontuação
 * real (ledger, triggers, RLS) vem na migração aditiva do Supabase, depois que
 * o visual for aprovado. Os assets são CC0 do Kenney.nl (pasta /public/kenney).
 */

export const KENNEY = "/kenney";

/* ---------- Avatar (Kenney Toon Characters 1) ---------- */
export type CharKey =
  | "maleAdventurer" | "femaleAdventurer"
  | "malePerson" | "femalePerson"
  | "robot" | "zombie";

export const CHARACTERS: { key: CharKey; label: string; gender: "m" | "f" | "n" }[] = [
  { key: "maleAdventurer", label: "Aventureiro", gender: "m" },
  { key: "femaleAdventurer", label: "Aventureira", gender: "f" },
  { key: "malePerson", label: "Clássico", gender: "m" },
  { key: "femalePerson", label: "Clássica", gender: "f" },
  { key: "robot", label: "Robô", gender: "n" },
  { key: "zombie", label: "Mascote", gender: "n" },
];

/** Personagens do gênero escolhido + os neutros (robô, mascote) aparecem nos dois. */
export const charsForGender = (g: "m" | "f") =>
  CHARACTERS.filter((c) => c.gender === g || c.gender === "n");

export type Pose = "idle" | "cheer0" | "jump";
export const charPose = (k: CharKey, pose: Pose = "idle") =>
  `${KENNEY}/characters/${k}_${pose}.png`;

/* ---------- Galeria de avatares 3D (Quaternius / low-poly animado) ---------- */
export interface Char3D { src: string; label: string; emoji: string; clip?: string }
/** Lista única de personagens 3D animados — só pessoas/robôs (sem animais, sem gênero). */
export const CHARS_3D: Char3D[] = [
  { src: "/models/Michelle.glb", label: "Pop", emoji: "🧑" },
  { src: "/models/Q_Person.glb", label: "Casual", emoji: "🧍" },
  { src: "/models/Xbot.glb", label: "Clássico", emoji: "🙂" },
  { src: "/models/Soldier.glb", label: "Explorador", emoji: "🧗" },
  { src: "/models/Cyber.glb", label: "Cyber", emoji: "🦾" },
  { src: "/models/Knight.glb", label: "Cavaleiro", emoji: "🛡️" },
  { src: "/models/Mage.glb", label: "Mago", emoji: "🧙" },
  { src: "/models/Rogue.glb", label: "Ágil", emoji: "🏃" },
  { src: "/models/Barbarian.glb", label: "Forte", emoji: "💪" },
  { src: "/models/Rogue_Hooded.glb", label: "Furtivo", emoji: "🥷" },
  { src: "/models/RobotExpressive.glb", label: "Robô", emoji: "🤖", clip: "Idle" },
  { src: "/models/MechA.glb", label: "Mecha", emoji: "⚙️", clip: "Idle" },
  { src: "/models/MechB.glb", label: "Androide", emoji: "🦿", clip: "Idle" },
];
const CHAR3D_KEY = "gam.char3d.v1";
export function loadChar3d(): string {
  try {
    const v = localStorage.getItem(CHAR3D_KEY);
    if (v && CHARS_3D.some((c) => c.src === v)) return v;
  } catch { /* ignore */ }
  return CHARS_3D[0].src;
}
export function saveChar3d(src: string) { try { localStorage.setItem(CHAR3D_KEY, src); } catch { /* ignore */ } }

/* ---------- Títulos (gênero) + medalhas Kenney ---------- */
export type Gender = "m" | "f";

export interface Titulo {
  min: number; max: number; m: string; f: string; medal: number;
}

/** 9 títulos genéricos (caráter/jornada), com forma masc/fem e emblema (medalha Kenney 1–9). */
export const TITULOS: Titulo[] = [
  { min: 1,  max: 3,  m: "Aprendiz",     f: "Aprendiz",     medal: 9 },
  { min: 4,  max: 6,  m: "Servo",        f: "Serva",        medal: 8 },
  { min: 7,  max: 9,  m: "Dedicado",     f: "Dedicada",     medal: 7 },
  { min: 10, max: 12, m: "Comprometido", f: "Comprometida", medal: 6 },
  { min: 13, max: 15, m: "Perseverante", f: "Perseverante", medal: 5 },
  { min: 16, max: 18, m: "Fiel",         f: "Fiel",         medal: 4 },
  { min: 19, max: 21, m: "Inspirador",   f: "Inspiradora",  medal: 3 },
  { min: 22, max: 24, m: "Veterano",     f: "Veterana",     medal: 2 },
  { min: 25, max: 26, m: "Pilar",        f: "Pilar",        medal: 1 },
];

export const medalSrc = (n: number) => `${KENNEY}/medals/medal${n}.png`;

export function tituloForLevel(level: number): Titulo {
  return TITULOS.find((t) => level >= t.min && level <= t.max) ?? TITULOS[TITULOS.length - 1];
}
export function tituloLabel(level: number, g: Gender): string {
  const t = tituloForLevel(level);
  return g === "f" ? t.f : t.m;
}

/* ---------- Curva de níveis (espelha o plano) ---------- */
export const LEVEL_XP = [
  0, 40, 110, 210, 340, 500, 690, 910, 1160, 1440, 1760, 2110, 2500, 2930,
  3400, 3910, 4470, 5070, 5720, 6410, 7150, 7940, 8780, 9660, 10600, 11590,
];
export function levelForXp(xp: number): number {
  let l = 1;
  for (let i = 0; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) l = i + 1;
  return Math.min(l, 26);
}
export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const base = LEVEL_XP[level - 1] ?? 0;
  const next = LEVEL_XP[level] ?? base + 1000;
  const pct = level >= 26 ? 100 : Math.min(100, Math.round(((xp - base) / (next - base)) * 100));
  return { level, base, next, pct };
}

/* ---------- Jardim da Equipe (Kenney Nature Kit + Food Kit) ---------- */
// Espécies brasileiras (árvores 3D Quaternius "Stylized Nature" rotuladas como BR).
export const TREE_SPECIES = [
  { key: "mangueira", label: "Mangueira", emoji: "🥭" },
  { key: "goiabeira", label: "Goiabeira", emoji: "🍐" },
  { key: "ipe", label: "Ipê", emoji: "🌳" },
  { key: "jabuticabeira", label: "Jabuticabeira", emoji: "🫐" },
  { key: "coqueiro", label: "Coqueiro", emoji: "🥥" },
  { key: "paubrasil", label: "Pau-brasil", emoji: "🪵" },
];
export const treeGlbSrc = (k: string) => `/models/trees/${k}.glb`;       // modelo 3D (legado)
/** Cor da folhagem por espécie (jardim pixel art). */
export const LEAF_COLORS: Record<string, string> = {
  mangueira: "#2e7d32", goiabeira: "#7cb342", ipe: "#f9a825",
  jabuticabeira: "#1b5e20", coqueiro: "#43a047", paubrasil: "#ef6c00",
};

export const FRUITS = [
  { key: "apple", label: "Maçã" },
  { key: "orange", label: "Laranja" },
  { key: "pear", label: "Pera" },
  { key: "lemon", label: "Limão" },
  { key: "grapes", label: "Uva" },
  { key: "strawberry", label: "Morango" },
  { key: "banana", label: "Banana" },
  { key: "watermelon", label: "Melancia" },
];
export const fruitSrc = (k: string) => `${KENNEY}/fruits/${k}.png`;

/** 8 estágios de crescimento dentro de um período de 6 meses (semestre). */
export const GARDEN_STAGES = [
  "Semente plantada", "Broto", "Redoma", "Fertilização",
  "Caule", "Galhos e folhas", "Florescimento", "Frutificação",
];
export const PERIOD_MONTHS = 6;

/** Cuidados (cada um é uma ação real da equipe) → quanto fazem o jardim crescer. */
export const CARE_ACTIONS = [
  { key: "sun", emoji: "☀️", label: "Sol", sub: "servir no culto", amount: 30 },
  { key: "water", emoji: "💧", label: "Regar", sub: "confirmar escala", amount: 12 },
  { key: "birds", emoji: "🐦", label: "Proteger", sub: "incentivar colega", amount: 8 },
  { key: "fertilize", emoji: "🌱", label: "Adubar", sub: "ensaiar", amount: 6 },
  { key: "weed", emoji: "🌿", label: "Capinar", sub: "indicar indisponib.", amount: 6 },
  { key: "prune", emoji: "✂️", label: "Podar", sub: "perfil em dia", amount: 5 },
];

/* ---------- Mock: estado do membro (avatar + XP) ---------- */
export interface MemberState {
  char: CharKey;
  gender: Gender;
  xp: number;
}
const MEMBER_KEY = "gam.member.v1";
export function loadMember(): MemberState {
  try {
    const raw = localStorage.getItem(MEMBER_KEY);
    if (raw) return { char: "maleAdventurer", gender: "m", xp: 690, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { char: "maleAdventurer", gender: "m", xp: 690 };
}
export function saveMember(s: MemberState) {
  try { localStorage.setItem(MEMBER_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/* ---------- Mock: estado do jardim da equipe ---------- */
export interface GardenState {
  started: boolean;
  startISO: string | null;
  species: string;
  fruit: string;
  stage: number;   // 0..7
  progress: number; // 0..100 dentro do estágio
}
const GARDEN_KEY = "gam.garden.v1";
const DEFAULT_GARDEN: GardenState = { started: false, startISO: null, species: "mangueira", fruit: "apple", stage: 0, progress: 0 };
export function loadGarden(): GardenState {
  const valid = new Set(TREE_SPECIES.map((t) => t.key));
  try {
    const raw = localStorage.getItem(GARDEN_KEY);
    if (raw) {
      const s = { ...DEFAULT_GARDEN, ...JSON.parse(raw) };
      if (!valid.has(s.species)) s.species = "mangueira"; // coerção p/ chaves antigas
      return s;
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_GARDEN };
}
export function saveGarden(s: GardenState) {
  try { localStorage.setItem(GARDEN_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/* ---------- Mock: ranking "Mais Constante" ---------- */
export interface RankRow {
  name: string;
  char: CharKey;
  served: number;
  scheduled: number;
  score: number; // taxa de constância 0..100
  me?: boolean;
}
export const MOCK_LEADERBOARD: RankRow[] = [
  { name: "Ana",   char: "femaleAdventurer", served: 2, scheduled: 2, score: 98 },
  { name: "Pedro", char: "maleAdventurer",   served: 7, scheduled: 8, score: 91 },
  { name: "Júlia", char: "femalePerson",     served: 4, scheduled: 5, score: 84 },
  { name: "Lucas", char: "malePerson",       served: 5, scheduled: 7, score: 80 },
  { name: "Marta", char: "robot",            served: 3, scheduled: 4, score: 79, me: true },
  { name: "Davi",  char: "zombie",           served: 2, scheduled: 4, score: 64 },
];

/** Meta coletiva (jardim) — números de exemplo. */
export const MOCK_TEAM_META = { membersInStreak: 12, membersTotal: 14 };
