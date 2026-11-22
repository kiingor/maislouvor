import { useEffect, useState } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

/**
 * Aparência do app (HIG > Dark Mode): Automático segue o sistema; Claro/Escuro fixam.
 * Guardada no aparelho. O palco do Modo ensaio e a playlist pública têm tema próprio e,
 * ao saírem, devem chamar `applyAppearance()` para voltar à escolha do usuário.
 */
export type Appearance = "system" | "light" | "dark";

const KEY = "louvor-appearance";
const EVENT = "louvor-appearance-change";
const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

// Fallback em memória: se o storage falhar (modo privado), a escolha vale nesta sessão.
let memo: Appearance | null = null;

export function getAppearance(): Appearance {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : memo ?? "system";
  } catch {
    return memo ?? "system";
  }
}

export function isAppearanceDark(a: Appearance = getAppearance()) {
  return a === "dark" || (a === "system" && darkQuery().matches);
}

// Mesmo corte do SystemBars do Capacitor 8 (WEBVIEW_VERSION_WITH_SAFE_AREA_FIX): a partir do
// WebView 140, com viewport-fit=cover (index.html), a página desenha atrás das barras do Android.
// Antes disso o Capacitor afasta a página e a faixa das barras mostra o fundo nativo da janela,
// que segue o tema do APARELHO, não o do app.
const ANDROID_WEBVIEW_DRAWS_UNDER_BARS = 140;

/** A página aparece atrás da barra de status? (iOS: sempre; Android: só com WebView 140+.) */
export function pageDrawsUnderSystemBars(platform = Capacitor.getPlatform(), userAgent = navigator.userAgent) {
  if (platform !== "android") return true;
  const major = Number(/Chrome\/(\d+)/.exec(userAgent)?.[1] ?? 0);
  return major >= ANDROID_WEBVIEW_DRAWS_UNDER_BARS;
}

// Último tema pedido às barras, para recalcular quando o tema do aparelho muda.
let barsDark: boolean | null = null;

/**
 * Cor dos ícones da barra de status e da barra de gestos no app nativo (Android/iOS).
 * O <meta theme-color> só vale no navegador/PWA; no app, os ícones seguiam o tema do aparelho
 * e sumiam com o app em Escuro e o aparelho em Claro (PrimeTestLab 10957, M-03).
 * Quando a página fica atrás das barras, os ícones seguem o tema do app. Quando não fica
 * (WebView antigo no Android), o fundo da faixa é o do aparelho, então os ícones também.
 */
export function paintSystemBars(dark: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  barsDark = dark;
  const style = !pageDrawsUnderSystemBars()
    ? SystemBarsStyle.Default
    : dark
      ? SystemBarsStyle.Dark
      : SystemBarsStyle.Light;
  SystemBars.setStyle({ style }).catch(() => {
    /* sem a barra nativa (versão antiga do app): mantém a do sistema */
  });
}

/**
 * Pinta um tema no <html>: classe .dark (o color-scheme vem do CSS de :root/.dark/.light)
 * e cor da barra de status. `perMedia`: em Automático, cada <meta theme-color> mantém a cor
 * do próprio esquema (media="(prefers-color-scheme: …)"); fixo, todas levam a cor escolhida.
 * No app nativo, também acerta os ícones das barras do sistema (paintSystemBars).
 */
export function paintTheme(dark: boolean, perMedia = false) {
  document.documentElement.classList.toggle("dark", dark);
  paintSystemBars(dark);
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const metaDark = perMedia && m.media ? m.media.includes("dark") : dark;
    m.setAttribute("content", metaDark ? "#000000" : "#F2F2F7");
  });
}

/** Aplica a Aparência escolhida no <html>. */
export function applyAppearance() {
  const a = getAppearance();
  paintTheme(isAppearanceDark(a), a === "system");
}

export function setAppearance(a: Appearance) {
  try {
    if (a === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, a);
    memo = null;
  } catch {
    memo = a; // modo privado: vale só nesta sessão
  }
  applyAppearance();
  window.dispatchEvent(new CustomEvent(EVENT, { detail: a }));
}

/** Chamado uma vez na inicialização: aplica e acompanha mudanças do sistema (em Automático). */
export function initAppearance() {
  // Telas com tema próprio (Modo ensaio) marcam o <html>; não sobrescrever enquanto estiverem abertas.
  const staged = () => document.documentElement.hasAttribute("data-stage-theme");
  if (!staged()) applyAppearance();
  const mq = darkQuery();
  const onSystem = () => {
    if (getAppearance() === "system" && !staged()) applyAppearance();
    // Escuro/Claro fixos ou palco aberto: o tema da página não muda, mas no WebView antigo os
    // ícones seguem o aparelho (DEFAULT), e o Capacitor reaplicaria o estilo antigo.
    else if (barsDark !== null) paintSystemBars(barsDark);
  };
  if (mq.addEventListener) mq.addEventListener("change", onSystem);
  else (mq as MediaQueryList & { addListener?: (f: () => void) => void }).addListener?.(onSystem);
  // Mudança feita em outra aba/janela do app.
  window.addEventListener("storage", (e) => { if ((e.key === KEY || e.key === null) && !staged()) applyAppearance(); });
}

export function useAppearance(): [Appearance, (a: Appearance) => void] {
  const [value, setValue] = useState<Appearance>(getAppearance);
  useEffect(() => {
    const on = () => setValue(getAppearance());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => {
      window.removeEventListener(EVENT, on);
      window.removeEventListener("storage", on);
    };
  }, []);
  return [value, setAppearance];
}

export const APPEARANCE_OPTIONS: { value: Appearance; label: string }[] = [
  { value: "system", label: "Automático" },
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
];
