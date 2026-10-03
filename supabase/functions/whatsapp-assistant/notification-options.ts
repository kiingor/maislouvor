// Compartilhado com o app: controles e explicação do comportamento automático.
export const NOTIFICATION_OPTIONS = [
  { key: "cultos", title: "Cultos", description: "Novos cultos, mudanças de data e cancelamentos." },
  { key: "escala", title: "Escalas", description: "Marca quem entrou na escala e avisa mudanças de função ou saída." },
  { key: "repertorio", title: "Repertório", description: "Músicas e tons atualizados no culto." },
  { key: "avisos", title: "Avisos do líder", description: "Avisos enviados pelo app e missões agendadas pelo líder no grupo." },
  { key: "lembretes", title: "Lembrete na véspera", description: "Às 18h, horário de Brasília, lembra quem vai servir no dia seguinte." },
] as const;
export type NotificationSettings = Record<(typeof NOTIFICATION_OPTIONS)[number]["key"], boolean>;
export const AUTOMATIC_NOTICES_HELP = "Também levo os avisos do app para este grupo: cultos, escalas com menção, repertório, avisos do líder e lembrete na véspera. O líder escolhe quais receber em Ajustes › Equipe › Avisos automáticos.";
