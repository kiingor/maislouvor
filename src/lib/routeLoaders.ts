/**
 * Carregadores das telas de /app (usados pelo lazy() em App.tsx e pelo pré-carregamento).
 * Mesmo especificador de import = mesmo chunk; pré-carregar aqui deixa a troca de aba instantânea.
 */
export const loadHome = () => import("@/pages/Home");
export const loadRepertorios = () => import("@/pages/Repertorios");
export const loadRepertorioDetail = () => import("@/pages/RepertorioDetail");
export const loadCultos = () => import("@/pages/Cultos");
export const loadCultoDetail = () => import("@/pages/CultoDetail");
export const loadSongEditor = () => import("@/pages/SongEditor");
export const loadTeamSettings = () => import("@/pages/TeamSettings");
export const loadDisponibilidades = () => import("@/pages/Disponibilidades");
export const loadChangePassword = () => import("@/pages/ChangePassword");
export const loadChat = () => import("@/pages/Chat");
export const loadRelatorios = () => import("@/pages/Relatorios");
export const loadPresentation = () => import("@/pages/Presentation");

/** Aquece o Modo ensaio (chunk pesado) quando uma tela que leva a ele abre. */
export function warmPresentation() {
  const t = window.setTimeout(() => { loadPresentation().catch(() => {}); }, 1500);
  return () => window.clearTimeout(t);
}

let started = false;
/** Baixa as telas do app em segundo plano, uma a uma, quando o navegador está ocioso. */
export function prefetchAppScreens() {
  if (started) return;
  started = true;
  // Abas primeiro, depois detalhes. O Modo ensaio (motor de áudio) fica de fora: é pesado.
  const queue = [loadCultos, loadRepertorios, loadChat, loadTeamSettings, loadHome, loadCultoDetail, loadRepertorioDetail, loadDisponibilidades, loadSongEditor, loadRelatorios, loadChangePassword];
  const idle = (cb: () => void) =>
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback(cb, { timeout: 2000 }) : window.setTimeout(cb, 300);
  const next = () => {
    const load = queue.shift();
    if (!load) return;
    load().catch(() => {}).finally(() => idle(next));
  };
  idle(next);
}
