// Vozes de uma canção (1ª voz, 2ª voz, ...).
//
// "Voz" é diferente de "naipe": o naipe é a tessitura da pessoa (Soprano,
// Contralto, Tenor...), a voz é a linha melódica daquela canção. Numa mesma
// canção várias pessoas podem estar na mesma voz, e a mesma pessoa pode
// cantar um naipe diferente de uma canção para outra.

import { isVoicePart, isVocalRole, shortInstrumentLabel } from "@/data/instruments";

export const MAX_VOICES = 4;

export function voiceLabel(voice: number): string {
  return `${voice}ª voz`;
}

export interface VoiceAssignment {
  team_member_id: string;
  voice: number;
  /** Naipe só quando difere do da escala; null = herda de culto_lineup. */
  voice_part: string | null;
}

export interface VoiceLine {
  voice: number;
  people: { name: string; part: string | null }[];
}

/**
 * Naipe que a pessoa tem NA ESCALA do culto, a partir das funções dela.
 *
 * Só considera funções vocais: alguém escalado como "Ministrante" + "Violão"
 * não tem naipe (devolve null) — sem isso o "Violão" acabaria impresso como se
 * fosse naipe. Ministrante é o último recurso, porque é função e não tessitura.
 */
export function escalaVoicePart(roles: string[]): string | null {
  return (
    roles.find(isVoicePart) ??
    roles.find((r) => isVocalRole(r) && r !== "Ministrante") ?? // "Back N" legados
    null
  );
}

/**
 * Monta as linhas "1ª voz — Fulana (Soprano), Sicrano (Tenor)" de uma canção,
 * resolvendo o naipe efetivo de cada pessoa (override da canção, senão o naipe
 * da escala do culto).
 */
export function buildVoiceLines(
  assignments: VoiceAssignment[],
  memberInfo: Map<string, { name: string; roles: string[] }>,
): VoiceLine[] {
  const byVoice = new Map<number, { name: string; part: string | null }[]>();

  assignments.forEach((a) => {
    const info = memberInfo.get(a.team_member_id);
    if (!info) return;
    const part = a.voice_part ?? escalaVoicePart(info.roles);
    const list = byVoice.get(a.voice) ?? [];
    list.push({ name: info.name, part });
    byVoice.set(a.voice, list);
  });

  return Array.from(byVoice.entries())
    .sort(([a], [b]) => a - b)
    .map(([voice, people]) => ({
      voice,
      people: people.sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    }));
}

/** "1ª voz: Fulana (Soprano), Sicrano (Tenor)" — usado em texto puro e na UI. */
export function formatVoiceLine(line: VoiceLine): string {
  const people = line.people
    .map((p) => (p.part ? `${p.name} (${shortInstrumentLabel(p.part)})` : p.name))
    .join(", ");
  return `${voiceLabel(line.voice)}: ${people}`;
}
