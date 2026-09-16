// Gera a mensagem de texto (WhatsApp) com a escala + o repertório de um culto.
//
// Serve principalmente para passar as informações a músicos convidados, que não
// têm conta no app: eles precisam saber o tom que o grupo vai tocar, o BPM, o
// link da canção, o momento do culto e a ordem — sem depender de abrir o app.

import { compareInstruments } from "@/data/instruments";
import { buildVoiceLines, formatVoiceLine, type VoiceAssignment } from "@/lib/voices";

export interface ShareRoteiroSong {
  kind: "song";
  cultoSongId: string;
  title: string;
  artist?: string | null;
  /** Tom que o grupo vai tocar. */
  key: string;
  /** Tom da cifra/original — só entra no texto se for diferente do de execução. */
  originalKey?: string | null;
  bpm?: number | null;
  mediaUrl?: string | null;
  notes?: string | null;
  theme?: string | null;
}

export interface ShareRoteiroBlock {
  kind: "block";
  title: string;
  blockKind?: string | null;
  durationMin?: number | null;
  notes?: string | null;
}

export type ShareRoteiroItem = ShareRoteiroSong | ShareRoteiroBlock;

export interface BuildCultoShareTextInput {
  cultoName: string;
  /** "YYYY-MM-DD" */
  cultoDate?: string | null;
  roteiro: ShareRoteiroItem[];
  /** instrumento/naipe -> nomes. */
  lineup: Record<string, string[]>;
  /** culto_song_id -> atribuições de voz. */
  voices?: Map<string, VoiceAssignment[]>;
  memberInfo?: Map<string, { name: string; roles: string[] }>;
  /** Link público do roteiro, quando houver. */
  url?: string | null;
  options?: {
    includeLineup?: boolean;
    includeVoices?: boolean;
    includeLinks?: boolean;
    includeNotes?: boolean;
    includeUrl?: boolean;
  };
}

const DEFAULT_OPTIONS = {
  includeLineup: true,
  includeVoices: true,
  includeLinks: true,
  includeNotes: true,
  includeUrl: true,
};

function formatDate(date?: string | null): string {
  if (!date) return "";
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const label = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function buildCultoShareText(input: BuildCultoShareTextInput): string {
  const opts = { ...DEFAULT_OPTIONS, ...(input.options ?? {}) };
  const out: string[] = [];

  out.push(`*${input.cultoName.toUpperCase()}*`);
  const dateLabel = formatDate(input.cultoDate);
  if (dateLabel) out.push(`🗓️ ${dateLabel}`);

  // ---- Escala ----
  if (opts.includeLineup) {
    const roles = Object.keys(input.lineup)
      .filter((r) => (input.lineup[r] ?? []).length > 0)
      .sort(compareInstruments);
    if (roles.length > 0) {
      out.push("");
      out.push("*ESCALA*");
      roles.forEach((role) => {
        out.push(`• ${role}: ${input.lineup[role].join(", ")}`);
      });
    }
  }

  // ---- Repertório / roteiro ----
  if (input.roteiro.length > 0) {
    out.push("");
    out.push("*REPERTÓRIO*");

    let songNumber = 0;
    input.roteiro.forEach((item) => {
      if (item.kind === "block") {
        const parts: string[] = [];
        if (item.blockKind && item.blockKind !== "moment") parts.push(item.blockKind);
        if (item.durationMin) parts.push(`${item.durationMin} min`);
        const suffix = parts.length > 0 ? ` (${parts.join(" · ")})` : "";
        out.push("");
        out.push(`⏸️ _${item.title}${suffix}_`);
        if (opts.includeNotes && item.notes) out.push(`   ↳ ${item.notes}`);
        return;
      }

      songNumber += 1;
      out.push("");
      out.push(`*${songNumber}. ${item.title}*${item.artist ? ` — ${item.artist}` : ""}`);

      const meta: string[] = [];
      if (item.key) {
        meta.push(
          item.originalKey && item.originalKey !== item.key
            ? `🎵 Tom: ${item.key} (original ${item.originalKey})`
            : `🎵 Tom: ${item.key}`,
        );
      }
      if (item.bpm) meta.push(`🥁 ${item.bpm} BPM`);
      if (item.theme) meta.push(`🏷️ ${item.theme}`);
      if (meta.length > 0) out.push(`   ${meta.join(" · ")}`);

      if (opts.includeVoices && input.voices && input.memberInfo) {
        const lines = buildVoiceLines(input.voices.get(item.cultoSongId) ?? [], input.memberInfo);
        lines.forEach((line) => out.push(`   🎤 ${formatVoiceLine(line)}`));
      }

      if (opts.includeLinks && item.mediaUrl) out.push(`   ▶️ ${item.mediaUrl}`);
      if (opts.includeNotes && item.notes) out.push(`   💬 ${item.notes}`);
    });
  }

  if (opts.includeUrl && input.url) {
    out.push("");
    out.push(`🔗 Roteiro completo: ${input.url}`);
  }

  return out.join("\n");
}
