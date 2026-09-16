import { describe, expect, it } from "vitest";
import { buildCultoShareText, type ShareRoteiroItem } from "@/lib/shareText";
import { buildVoiceLines, escalaVoicePart, formatVoiceLine, type VoiceAssignment } from "@/lib/voices";
import { compareInstruments, isVocalRole, shortInstrumentLabel } from "@/data/instruments";

const memberInfo = new Map([
  ["m1", { name: "Débora", roles: ["Ministrante", "Soprano"] }],
  ["m2", { name: "Thaiana", roles: ["Contralto"] }],
  ["m3", { name: "Júlio", roles: ["Tenor"] }],
]);

const roteiro: ShareRoteiroItem[] = [
  {
    kind: "song",
    cultoSongId: "cs1",
    title: "Quero Subir",
    artist: "Diante do Trono",
    key: "A",
    originalKey: "C",
    bpm: 72,
    mediaUrl: "https://youtu.be/abc",
    notes: "só violão na intro",
    theme: "Adoração",
  },
  { kind: "block", title: "Oração", blockKind: "Oração", durationMin: 5, notes: null },
  { kind: "song", cultoSongId: "cs2", title: "Sublime", artist: null, key: "C", originalKey: "C", bpm: null, mediaUrl: null, notes: null, theme: null },
];

describe("naipes", () => {
  it("separa o naipe Baixo do contrabaixo", () => {
    expect(isVocalRole("Baixo (voz)")).toBe(true);
    expect(isVocalRole("Baixo")).toBe(false);
    expect(shortInstrumentLabel("Baixo (voz)")).toBe("Baixo");
  });

  it("trata os Back N legados como voz", () => {
    expect(isVocalRole("Back 2")).toBe(true);
  });

  it("ordena vozes antes de instrumentos", () => {
    const sorted = ["Bateria", "Contralto", "Ministrante", "Violão"].sort(compareInstruments);
    expect(sorted).toEqual(["Ministrante", "Contralto", "Violão", "Bateria"]);
  });
});

describe("vozes por canção", () => {
  const assignments: VoiceAssignment[] = [
    { team_member_id: "m1", voice: 1, voice_part: null },
    { team_member_id: "m3", voice: 1, voice_part: null },
    { team_member_id: "m2", voice: 2, voice_part: "Mezo" },
  ];

  it("agrupa várias pessoas na mesma voz e ordena por número da voz", () => {
    const lines = buildVoiceLines(assignments, memberInfo);
    expect(lines.map((l) => l.voice)).toEqual([1, 2]);
    expect(lines[0].people).toHaveLength(2);
  });

  it("herda o naipe da escala quando não há override", () => {
    const lines = buildVoiceLines(assignments, memberInfo);
    // Débora é Ministrante + Soprano → o naipe efetivo é Soprano, não Ministrante.
    expect(formatVoiceLine(lines[0])).toBe("1ª voz: Débora (Soprano), Júlio (Tenor)");
  });

  it("usa o override quando a pessoa muda de naipe naquela canção", () => {
    const lines = buildVoiceLines(assignments, memberInfo);
    expect(formatVoiceLine(lines[1])).toBe("2ª voz: Thaiana (Mezo)");
  });

  it("ignora atribuições de quem saiu da escala", () => {
    const lines = buildVoiceLines([{ team_member_id: "fantasma", voice: 1, voice_part: null }], memberInfo);
    expect(lines).toEqual([]);
  });

  // Regressão: quem canta E toca não pode ter o instrumento impresso como naipe.
  it("nunca herda um INSTRUMENTO como naipe", () => {
    expect(escalaVoicePart(["Ministrante", "Teclado"])).toBeNull();
    expect(escalaVoicePart(["Ministrante", "Violão", "Soprano"])).toBe("Soprano");
    expect(escalaVoicePart(["Violão"])).toBeNull();
  });

  it("cai no Back N legado quando não há naipe novo", () => {
    expect(escalaVoicePart(["Ministrante", "Back 2"])).toBe("Back 2");
  });

  it("Ministrante puro fica sem naipe em vez de virar 'Ministrante'", () => {
    const info = new Map([["m9", { name: "Léo", roles: ["Ministrante"] }]]);
    const lines = buildVoiceLines([{ team_member_id: "m9", voice: 1, voice_part: null }], info);
    expect(formatVoiceLine(lines[0])).toBe("1ª voz: Léo");
  });

  it("instrumentista escalado junto não vaza para a linha de voz", () => {
    const info = new Map([["m1", { name: "Débora", roles: ["Ministrante", "Teclado"] }]]);
    const lines = buildVoiceLines([{ team_member_id: "m1", voice: 1, voice_part: null }], info);
    expect(formatVoiceLine(lines[0])).toBe("1ª voz: Débora");
    expect(formatVoiceLine(lines[0])).not.toContain("Teclado");
  });
});

describe("mensagem de compartilhamento", () => {
  const base = {
    cultoName: "Culto de Domingo",
    cultoDate: "2026-07-26",
    roteiro,
    lineup: { Violão: ["Gabriel"], Ministrante: ["Débora"], Bateria: ["Felipe"] },
    voices: new Map([["cs1", [{ team_member_id: "m2", voice: 2, voice_part: null } as VoiceAssignment]]]),
    memberInfo,
    url: "https://maislouvor.com/culto/tok",
  };

  it("inclui tom de execução, tom original, BPM e link", () => {
    const text = buildCultoShareText(base);
    expect(text).toContain("🎵 Tom: A (original C)");
    expect(text).toContain("🥁 72 BPM");
    expect(text).toContain("▶️ https://youtu.be/abc");
  });

  it("omite o tom original quando é igual ao de execução", () => {
    const text = buildCultoShareText(base);
    expect(text).toContain("🎵 Tom: C");
    expect(text).not.toContain("(original C)\n   🎵 Tom: C");
    expect(text.match(/original/g)).toHaveLength(1);
  });

  it("numera só as canções, deixando os momentos fora da contagem", () => {
    const text = buildCultoShareText(base);
    expect(text).toContain("*1. Quero Subir*");
    expect(text).toContain("*2. Sublime*");
    expect(text).toContain("⏸️ _Oração (Oração · 5 min)_");
  });

  it("ordena a escala com as vozes antes dos instrumentos", () => {
    const text = buildCultoShareText(base);
    const ministrante = text.indexOf("Ministrante:");
    const violao = text.indexOf("Violão:");
    const bateria = text.indexOf("Bateria:");
    expect(ministrante).toBeLessThan(violao);
    expect(violao).toBeLessThan(bateria);
  });

  it("respeita as opções desligadas", () => {
    const text = buildCultoShareText({
      ...base,
      options: { includeLineup: false, includeLinks: false, includeUrl: false, includeVoices: false, includeNotes: false },
    });
    expect(text).not.toContain("*ESCALA*");
    expect(text).not.toContain("youtu.be");
    expect(text).not.toContain("maislouvor.com");
    expect(text).not.toContain("só violão na intro");
    expect(text).not.toContain("voz:");
  });

  it("mostra as vozes da canção quando ligado", () => {
    const text = buildCultoShareText(base);
    expect(text).toContain("🎤 2ª voz: Thaiana (Contralto)");
  });
});
