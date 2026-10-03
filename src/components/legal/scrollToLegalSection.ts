const prefersReducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Rola até a seção e leva o foco ao título dela (leitores de tela anunciam onde chegaram).
 * Não mexe no histórico: no app, "Voltar" sai do documento em vez de percorrer âncoras.
 */
export function scrollToLegalSection(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;
  target.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  const heading = target.querySelector<HTMLElement>("h2");
  heading?.focus({ preventScroll: true });
  return true;
}
