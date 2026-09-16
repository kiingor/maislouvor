import { Capacitor } from "@capacitor/core";

/**
 * Domínio público do app. No APK (Capacitor) a webview roda em
 * `https://localhost`, então `window.location.origin` gera links quebrados —
 * qualquer URL que vá para fora do app precisa passar por aqui.
 */
export const PUBLIC_APP_URL = "https://maislouvor.com";

export function appOrigin(): string {
  if (Capacitor.isNativePlatform()) return PUBLIC_APP_URL;
  return window.location.origin;
}
