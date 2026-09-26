import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { DESKTOP_QUERY, useMediaQuery, useShell } from "@/contexts/ShellContext";

interface PageHeaderProps {
  /** Título grande da tela (HIG: large title). Também vira o título inline ao rolar. */
  title: string;
  /** Linha secundária abaixo do título (opcional, estilo do kit iOS 27). */
  subtitle?: ReactNode;
  /** Ações da tela. No celular vão para a barra superior (botões de vidro); no desktop, ao lado do título. */
  actions?: ReactNode;
  /** Tela de detalhe: mostra Voltar em vez do menu. `true` volta no histórico. */
  back?: string | true;
  /** Conteúdo extra abaixo do título (ex.: busca, segmentos). */
  children?: ReactNode;
  className?: string;
}

/** Destinos da barra lateral do desktop: lá a navegação já está sempre visível, sem Voltar. */
const SIDEBAR_ROOTS = new Set([
  "/app/home",
  "/app/repertorios",
  "/app/cultos",
  "/app/chat",
  "/app/disponibilidades",
  "/app/relatorios",
  "/app/settings",
]);

/**
 * Cabeçalho padrão de toda tela dentro de /app.
 * Renderiza o título grande no conteúdo e registra título inline, Voltar e ações no shell.
 */
export function PageHeader({ title, subtitle, actions, back, children, className }: PageHeaderProps) {
  const shell = useShell();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!shell) return;
    shell.setInlineTitle(title);
    shell.setBack(back ?? null);
    return () => {
      shell.setInlineTitle("");
      shell.setBack(null);
      shell.setCollapsed(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, back, shell?.setInlineTitle, shell?.setBack]);

  // O título inline aparece quando o título grande passa por baixo da barra superior.
  // Mede a barra real (safe area incluída) em vez de depender de variáveis CSS com env().
  useEffect(() => {
    const el = titleRef.current;
    const root = shell?.scrollEl;
    if (!el || !root || !shell) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      const bar = document.querySelector("[data-shell-topbar]");
      const limit = bar ? bar.getBoundingClientRect().bottom : root.getBoundingClientRect().top;
      shell.setCollapsed(el.getBoundingClientRect().bottom < limit + 4);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(check); };
    root.addEventListener("scroll", onScroll, { passive: true });
    check();
    return () => { root.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shell?.scrollEl, shell?.setCollapsed]);

  const portalActions = !isDesktop && shell?.trailingSlot && actions;
  // No celular o Voltar fica na barra superior (TopBar, lg:hidden). No desktop as telas de
  // detalhe (música, culto, repertório, senha) mantêm o Voltar da produção acima do título.
  const desktopBack = isDesktop && back && !SIDEBAR_ROOTS.has(pathname);

  return (
    <header className={cn("mb-4", className)}>
      {desktopBack && (
        <button
          type="button"
          onClick={() => (back === true ? navigate(-1) : navigate(back))}
          className="-ml-1.5 mb-1 inline-flex min-h-11 items-center gap-0.5 rounded-[10px] px-1.5 text-body text-primary transition-opacity hover:opacity-70"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
          Voltar
        </button>
      )}
      {/* Ações alinhadas ao título grande; o subtítulo fica embaixo, fora dessa linha. */}
      <div className="flex items-center justify-between gap-3">
        <h1 ref={titleRef} className="min-w-0 px-0.5 text-large-title text-foreground break-words" aria-busy={!title || undefined}>
          {title || <span className="inline-block h-[34px] w-40 max-w-full rounded-[10px] bg-fill-tertiary align-middle animate-pulse" aria-label="Carregando" />}
        </h1>
        {isDesktop && actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {subtitle && <p className="px-0.5 text-subhead text-muted-foreground mt-0.5">{subtitle}</p>}
      {children && <div className="mt-3">{children}</div>}
      {portalActions && createPortal(actions, shell!.trailingSlot!)}
    </header>
  );
}
