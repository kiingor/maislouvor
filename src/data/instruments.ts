import { Mic, Mic2, Music, Guitar, Piano, Drum, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Funções da escala.
 *
 * São divididas em dois grupos: VOZES (ministrante + naipes vocais) e
 * INSTRUMENTOS. O valor gravado no banco (culto_lineup.instrument,
 * team_members.instruments[], member_availability.instruments[],
 * team_members.instrument_levels{}) é sempre a string desta lista.
 *
 * ATENÇÃO à colisão "Baixo": existe o naipe vocal e o contrabaixo. Para não
 * misturar os dois no banco, o naipe é gravado como "Baixo (voz)" e o
 * instrumento continua "Baixo". Dentro do grupo "Vozes" a interface pode
 * mostrar só "Baixo" (use `shortInstrumentLabel`); em listas soltas use
 * `instrumentLabel`, que mantém o "(voz)" e evita ambiguidade.
 */

/** Naipes vocais, na ordem soprano → baixo. */
export const VOICE_PARTS = [
  "Soprano",
  "Mezo",
  "Contralto",
  "Tenor",
  "Barítono",
  "Baixo (voz)",
] as const;

/** Funções vocais (quem canta), incluindo o ministrante. */
export const VOCAL_ROLES = ["Ministrante", ...VOICE_PARTS] as const;

/** Funções instrumentais. */
export const INSTRUMENT_ROLES = [
  "Violão",
  "Guitarra",
  "Baixo",
  "Bateria",
  "Teclado",
  "Cajon",
  "Mesa de Som",
] as const;

/**
 * Funções antigas ("Back 1".."Back 4"), de antes dos naipes. Continuam sendo
 * renderizadas normalmente em escalas/disponibilidades já gravadas, mas não
 * aparecem mais nos seletores — o líder reatribui o naipe quando quiser.
 */
export const LEGACY_VOCAL_ROLES = ["Back 1", "Back 2", "Back 3", "Back 4"] as const;

/** Grupos usados pelos seletores de função. */
export const INSTRUMENT_GROUPS: { key: string; label: string; items: readonly string[] }[] = [
  { key: "vozes", label: "Vozes", items: VOCAL_ROLES },
  { key: "instrumentos", label: "Instrumentos", items: INSTRUMENT_ROLES },
];

/** Lista plana de tudo que é selecionável hoje (sem os legados). */
export const INSTRUMENTS = [...VOCAL_ROLES, ...INSTRUMENT_ROLES] as const;

export type Instrument = (typeof INSTRUMENTS)[number];

export const INSTRUMENT_ICONS: Record<string, LucideIcon> = {
  Ministrante: Mic,
  Soprano: Mic2,
  Mezo: Mic2,
  Contralto: Mic2,
  Tenor: Mic2,
  Barítono: Mic2,
  "Baixo (voz)": Mic2,
  // Legados — mantidos para escalas antigas continuarem com ícone.
  "Back 1": Music,
  "Back 2": Music,
  "Back 3": Music,
  "Back 4": Music,
  Violão: Guitar,
  Guitarra: Guitar,
  Baixo: Guitar,
  Bateria: Drum,
  Teclado: Piano,
  Cajon: Drum,
  "Mesa de Som": SlidersHorizontal,
};

/** Ícone da função, com fallback para não sumir nada da tela. */
export function instrumentIcon(value: string): LucideIcon {
  return INSTRUMENT_ICONS[value] ?? Music;
}

const VOCAL_SET = new Set<string>([...VOCAL_ROLES, ...LEGACY_VOCAL_ROLES]);
const VOICE_PART_SET = new Set<string>(VOICE_PARTS);

/** True para ministrante, naipes e os "Back N" legados. */
export function isVocalRole(value: string): boolean {
  return VOCAL_SET.has(value);
}

/** True só para os naipes (exclui Ministrante e os legados). */
export function isVoicePart(value: string): boolean {
  return VOICE_PART_SET.has(value);
}

/** Rótulo completo, sem ambiguidade — use em listas planas, textos e relatórios. */
export function instrumentLabel(value: string): string {
  return value;
}

/**
 * Rótulo curto para uso DENTRO do grupo "Vozes", onde o cabeçalho já
 * desambigua: "Baixo (voz)" vira "Baixo".
 */
export function shortInstrumentLabel(value: string): string {
  return value === "Baixo (voz)" ? "Baixo" : value;
}

/** Ordem canônica para exibir funções (vozes primeiro, legados no fim). */
const ORDER = new Map<string, number>(
  [...VOCAL_ROLES, ...LEGACY_VOCAL_ROLES, ...INSTRUMENT_ROLES].map((v, i) => [v, i]),
);

export function compareInstruments(a: string, b: string): number {
  const ia = ORDER.get(a) ?? 999;
  const ib = ORDER.get(b) ?? 999;
  if (ia !== ib) return ia - ib;
  return a.localeCompare(b, "pt-BR");
}
