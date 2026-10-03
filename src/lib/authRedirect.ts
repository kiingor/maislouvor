/**
 * Destino do ?redirect= do login. Só caminhos internos do app (/app/...): nada
 * de URL externa, "//host" ou barra invertida, para o link não virar redirecionamento aberto.
 */
export function safeAppRedirect(value: string | null | undefined, fallback = "/app/home") {
  if (!value || !value.startsWith("/app/") || value.startsWith("//") || /[\\\s]/.test(value)) return fallback;
  return value;
}
