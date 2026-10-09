const INVITE_PATH = /^\/invite\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PENDING_KEY = "maislouvor-auth-destination";
const MAX_AGE = 30 * 60_000;

export function clearAuthRedirect() {
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try { window[name].removeItem(PENDING_KEY); } catch { /* storage indisponível */ }
  }
}

/** Somente rotas internas do app e convites com UUID completo. */
export function safeAppRedirect(value: string | null | undefined, fallback = "/app/home") {
  if (!value || value.startsWith("//") || /[\\\s]/.test(value)) return fallback;
  if (INVITE_PATH.test(value)) return value;
  if (!value.startsWith("/app/")) return fallback;
  try {
    const url = new URL(value, "https://internal.invalid");
    // URL normaliza segmentos '..', inclusive os codificados, antes da checagem.
    if (url.origin === "https://internal.invalid" && url.pathname.startsWith("/app/") && !/%(?:2f|5c)/i.test(url.pathname)) return value;
  } catch { /* destino inválido */ }
  return fallback;
}

export function authPageUrl(page: "/login" | "/signup", destination: string) {
  const safe = safeAppRedirect(destination);
  return safe === "/app/home" ? page : `${page}?redirect=${encodeURIComponent(safe)}`;
}

/** Guarda só uma rota, nunca tokens. No iOS, sobrevive ao cold launch do OAuth. */
export function rememberAuthRedirect(destination: string, native = false) {
  try {
    (native ? localStorage : sessionStorage).setItem(PENDING_KEY, JSON.stringify({ path: safeAppRedirect(destination), expiresAt: Date.now() + MAX_AGE }));
  } catch { /* storage bloqueado: o login continua com o destino padrão */ }
}

/** Consumo único após autenticação; valor explícito é revalidado também. */
export function consumeAuthRedirect(explicit?: string | null, native = false) {
  let remembered = "";
  try {
    const storage = native ? localStorage : sessionStorage;
    const raw = storage.getItem(PENDING_KEY);
    storage.removeItem(PENDING_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && typeof saved.path === "string" && typeof saved.expiresAt === "number" && saved.expiresAt > Date.now() && saved.expiresAt <= Date.now() + MAX_AGE) remembered = safeAppRedirect(saved.path, "");
  } catch { /* ausência ou valor inválido */ }
  return safeAppRedirect(explicit ?? remembered);
}
