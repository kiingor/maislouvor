/**
 * O que o assistente sabe fazer.
 *
 * Fonte única: a mensagem de boas-vindas na ativação, o "ajuda" no grupo e a
 * tela Ajustes > Equipe do app usam esta mesma lista (o app importa este
 * arquivo). Sem dependências, para rodar tanto no Deno quanto no Vite.
 */
export interface AssistantCapability {
  emoji: string;
  title: string;
  description: string;
  /** Exemplo do que escrever depois de marcar o assistente. */
  example: string;
}

export const ASSISTANT_CAPABILITIES: readonly AssistantCapability[] = [
  { emoji: "📅", title: "Minha escala", description: "seus próximos cultos e a função em cada um", example: "qual minha escala?" },
  { emoji: "⏭️", title: "Próximo culto", description: "quando você serve de novo", example: "quando eu toco de novo?" },
  { emoji: "🎸", title: "Meus instrumentos", description: "as funções do seu cadastro", example: "quais são meus instrumentos?" },
  { emoji: "👥", title: "Escala do culto", description: "quem está em cada função e quem já confirmou", example: "quem toca domingo?" },
  { emoji: "🎵", title: "Repertório", description: "músicas, tons, BPM, links e vozes do culto", example: "qual o repertório de domingo?" },
  { emoji: "🔎", title: "Tom de uma música", description: "tom, BPM e quando ela foi ou vai ser tocada", example: "qual o tom de Bondade de Deus?" },
  { emoji: "🗓️", title: "Próximos cultos", description: "a agenda da equipe", example: "quais são os próximos cultos?" },
  { emoji: "🙋", title: "Quem pode no dia", description: "disponíveis, indisponíveis e quem não respondeu", example: "quem está disponível dia 12?" },
  { emoji: "✅", title: "Confirmar ou recusar", description: "responder à sua escala", example: "confirmo a escala de domingo" },
  { emoji: "🚫", title: "Avisar indisponibilidade", description: "marcar ou desmarcar um dia seu", example: "não posso dia 20" },
  { emoji: "📌", title: "Avisos do ministério", description: "ensaio, local e o que o líder cadastrar", example: "que horas é o ensaio?" },
];
