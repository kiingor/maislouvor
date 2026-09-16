// Gera e dispara o download de um arquivo .ics (VCALENDAR) com um evento de dia inteiro.

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

// Escapa caracteres especiais conforme RFC 5545 (TEXT).
function escapeICS(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Formata uma Date para o stamp UTC usado em DTSTAMP (YYYYMMDDTHHMMSSZ).
function toICSStamp(d: Date): string {
  return (
    d.getUTCFullYear().toString() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    "T" +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    "Z"
  );
}

// "YYYY-MM-DD" -> "YYYYMMDD"
function toICSDate(isoDate: string): string {
  return isoDate.replace(/-/g, "").slice(0, 8);
}

// Soma 1 dia a uma data "YYYY-MM-DD" e retorna no formato "YYYYMMDD" (DTEND exclusivo).
function nextDayICSDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return (
    dt.getUTCFullYear().toString() +
    pad(dt.getUTCMonth() + 1) +
    pad(dt.getUTCDate())
  );
}

interface ICSEvent {
  name: string;
  date: string; // "YYYY-MM-DD"
  description?: string | null;
  uid?: string;
}

export function buildICS({ name, date, description, uid }: ICSEvent): string {
  const stamp = toICSStamp(new Date());
  const eventUid = uid || `${date}-${Math.random().toString(36).slice(2)}@louvormais`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//+Louvor//Culto//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${eventUid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${toICSDate(date)}`,
    `DTEND;VALUE=DATE:${nextDayICSDate(date)}`,
    `SUMMARY:${escapeICS(name)}`,
  ];

  if (description && description.trim()) {
    lines.push(`DESCRIPTION:${escapeICS(description.trim())}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  // RFC 5545 exige CRLF entre as linhas.
  return lines.join("\r\n");
}

export function downloadICS(event: ICSEvent): void {
  const ics = buildICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const safeName = (event.name || "culto").replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "culto";

  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
