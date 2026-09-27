// Texto do modelo -> WhatsApp, e datas no fuso de Brasília.

const MAX_REPLY_CHARS = 3_000;

/**
 * O modelo às vezes escapa para Markdown. O WhatsApp usa *negrito* e _itálico_
 * com um símbolo só e não entende títulos, links [texto](url) nem tabelas.
 */
export function toWhatsApp(text: string): string {
  let out = text.replace(/\r\n/g, "\n");
  out = out.replace(/\*\*(.+?)\*\*/g, "*$1*");
  out = out.replace(/__(.+?)__/g, "_$1_");
  out = out.replace(/^#{1,6}\s+(.+)$/gm, "*$1*");
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) =>
    label.trim() === url ? url : `${label}: ${url}`);
  out = out.replace(/^(\s*)[-*]\s+/gm, "$1• ");
  out = out.replace(/^\s*\|?\s*:?-{3,}.*$/gm, "");
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  if (out.length > MAX_REPLY_CHARS) {
    out = out.slice(0, MAX_REPLY_CHARS).replace(/\s+\S*$/, "") + "…";
  }
  return out;
}

/**
 * Os próximos `count` dias a partir de hoje (Brasília): "dom 04/10" e "2026-10-04".
 * Vai no prompt para o modelo não calcular datas de cabeça.
 */
export function upcomingDays(now: Date, count: number): { iso: string; label: string }[] {
  const [y, m, d] = todayInBrazil(now).iso.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "short" });
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(Date.UTC(y, m - 1, d + i, 12));
    const dd = String(day.getUTCDate()).padStart(2, "0");
    const mm = String(day.getUTCMonth() + 1).padStart(2, "0");
    return { iso: `${day.getUTCFullYear()}-${mm}-${dd}`, label: `${weekday.format(day).replace(".", "")} ${dd}/${mm}` };
  });
}

/** "sábado, 27/09/2026" e "2026-09-27" no horário de Brasília. */
export function todayInBrazil(now: Date): { iso: string; label: string } {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    label: `${get("weekday")}, ${get("day")}/${get("month")}/${get("year")}`,
  };
}
