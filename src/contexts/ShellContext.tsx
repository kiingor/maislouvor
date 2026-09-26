import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Estado compartilhado entre o shell (barra superior, abas) e o PageHeader de cada tela.
 * As ações e o título inline entram na barra superior por portal: o shell expõe os nós
 * e o PageHeader renderiza dentro deles, sem sincronizar ReactNode por estado.
 */
interface ShellState {
  /** Nó da barra superior onde o PageHeader coloca as ações (lado direito). */
  trailingSlot: HTMLElement | null;
  setTrailingSlot: (el: HTMLElement | null) => void;
  /** Título inline da barra superior (aparece quando o título grande sai de vista). */
  inlineTitle: string;
  setInlineTitle: (t: string) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** Destino do botão Voltar. `true` = histórico. `null` = tela raiz (mostra o menu). */
  back: string | true | null;
  setBack: (b: string | true | null) => void;
  /** Contêiner rolável do conteúdo (para observar o título grande). */
  scrollEl: HTMLElement | null;
  setScrollEl: (el: HTMLElement | null) => void;
  /** Esconde a barra superior do shell (telas com cabeçalho próprio, ex.: chat em tela cheia). */
  hideTopBar: boolean;
  setHideTopBar: (v: boolean) => void;
  /** Esconde a barra de abas (ex.: dentro de uma conversa, como no Mensagens do iOS). */
  hideTabBar: boolean;
  setHideTabBar: (v: boolean) => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [trailingSlot, setTrailingSlot] = useState<HTMLElement | null>(null);
  const [inlineTitle, setInlineTitle] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [back, setBack] = useState<string | true | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [hideTopBar, setHideTopBar] = useState(false);
  const [hideTabBar, setHideTabBar] = useState(false);
  const value = useMemo(
    () => ({ trailingSlot, setTrailingSlot, inlineTitle, setInlineTitle, collapsed, setCollapsed, back, setBack, scrollEl, setScrollEl, hideTopBar, setHideTopBar, hideTabBar, setHideTabBar }),
    [trailingSlot, inlineTitle, collapsed, back, scrollEl, hideTopBar, hideTabBar],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/** Retorna null fora do shell (páginas públicas), para os componentes degradarem sozinhos. */
export function useShell() {
  return useContext(ShellContext);
}

/** Telas com cabeçalho próprio podem esconder a barra superior do shell enquanto montadas. */
export function useHideShellTopBar(hide = true) {
  const shell = useShell();
  useEffect(() => {
    if (!shell || !hide) return;
    shell.setHideTopBar(true);
    return () => shell.setHideTopBar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hide, shell?.setHideTopBar]);
}

/** Esconde a barra de abas enquanto a tela estiver montada (ou enquanto `hide` for true). */
export function useHideTabBar(hide = true) {
  const shell = useShell();
  useEffect(() => {
    if (!shell || !hide) return;
    shell.setHideTabBar(true);
    return () => shell.setHideTabBar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hide, shell?.setHideTabBar]);
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

export const DESKTOP_QUERY = "(min-width: 1024px)";
