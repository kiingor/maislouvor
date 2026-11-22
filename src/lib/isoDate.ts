/** "2026-11-01" → "01/11/2026". Só mexe no texto: nada de Date, para não trocar o dia pelo fuso. */
export function formatIsoDateBR(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}
