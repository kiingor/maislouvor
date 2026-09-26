import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Home, MessageCircle, Music, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTeam } from "@/contexts/TeamContext";

type Resource = "cultos" | "repertorios" | "chat";
interface TabItem { title: string; href: string; icon: LucideIcon; resource?: Resource }

// Ordem preservada do app: Cultos · Repertório · Início · Chat · Usuário.
const ALL_TABS: TabItem[] = [
  { title: "Cultos", href: "/app/cultos", icon: CalendarDays, resource: "cultos" },
  { title: "Repertório", href: "/app/repertorios", icon: Music, resource: "repertorios" },
  { title: "Início", href: "/app/home", icon: Home },
  { title: "Chat", href: "/app/chat", icon: MessageCircle, resource: "chat" },
  { title: "Usuário", href: "/app/settings", icon: UserRound },
];

/**
 * Barra de abas flutuante em Liquid Glass (HIG > Tab bars, kit iOS 27 > Tab Bars).
 * A seleção é uma plataforma que vira lente ao tocar e acompanha o arraste horizontal.
 */
export function TabBar({ hidden = false }: { hidden?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { can } = useTeam();
  const tabs = ALL_TABS.filter((t) => !t.resource || can(t.resource, "ver"));
  // Com v7_startTransition o useLocation() fica na tela antiga até a nova carregar; a barra
  // segue o último toque (pending) para não "voltar" nem ignorar um toque de cancelamento.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useEffect(() => { setPendingHref(null); }, [location.pathname]);
  const shownPath = pendingHref ?? location.pathname;
  const activeIndex = Math.max(0, tabs.findIndex((t) => shownPath.startsWith(t.href)));
  const hasActive = tabs.some((t) => shownPath.startsWith(t.href));

  const barRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [lens, setLens] = useState({ x: 4, w: 70 });
  const [lifted, setLifted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; moved: boolean; left: number } | null>(null);
  // Momento do último toque confirmado pela barra: o click que o navegador gera logo depois
  // do mesmo gesto é ignorado; qualquer outro click (leitor de tela, teclado) segue normal.
  const pointerCommitAt = useRef(0);

  // Plataforma ~12% mais larga que a coluna, contida na barra.
  const lensFor = useCallback((i: number, xOverride?: number) => {
    const first = itemRefs.current[0], last = itemRefs.current[tabs.length - 1], item = itemRefs.current[i];
    if (!first || !last || !item) return { x: 4, w: 70 };
    const col = item.offsetWidth, w = Math.round(col * 1.12);
    const left = xOverride ?? item.offsetLeft;
    const min = first.offsetLeft, max = last.offsetLeft + col - w;
    return { x: Math.max(min, Math.min(max, left - (w - col) / 2)), w };
  }, [tabs.length]);

  const place = useCallback(() => setLens(lensFor(activeIndex)), [lensFor, activeIndex]);
  // Quando o conjunto de abas muda (permissões chegando na primeira abertura), a seleção
  // vai direto ao lugar certo, sem deslizar pela barra.
  const [instant, setInstant] = useState(true);
  const lastCount = useRef(tabs.length);
  useLayoutEffect(() => {
    if (lastCount.current !== tabs.length) { lastCount.current = tabs.length; setInstant(true); }
    place();
  }, [place, tabs.length]);
  useEffect(() => {
    if (!instant) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)));
    return () => cancelAnimationFrame(id);
  }, [instant, lens]);
  useEffect(() => {
    const ro = new ResizeObserver(() => place());
    if (barRef.current) ro.observe(barRef.current);
    return () => ro.disconnect();
  }, [place]);

  const indexAt = (clientX: number) => {
    const bar = barRef.current, first = itemRefs.current[0];
    if (!bar || !first) return 0;
    const x = clientX - bar.getBoundingClientRect().left;
    return Math.max(0, Math.min(tabs.length - 1, Math.floor((x - first.offsetLeft) / first.offsetWidth)));
  };

  // Como na produção, tocar a aba ativa numa subrota volta à lista da seção; só na própria
  // raiz não empilha outra entrada no histórico.
  const go = (i: number) => {
    const t = tabs[i];
    if (!t) return place();
    if (t.href === location.pathname && !pendingHref) return place();
    // Inclui tocar de volta a aba já exibida durante uma navegação lenta (cancela a outra).
    setPendingHref(t.href === location.pathname ? null : t.href);
    navigate(t.href);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const bar = barRef.current!;
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false, left: bar.getBoundingClientRect().left };
    setLifted(true);
    const i = indexAt(e.clientX);
    if (i !== activeIndex) setLens(lensFor(i));
    bar.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return cancel();
    if (!d.moved && Math.abs(dx) < 6) return;
    d.moved = true;
    setDragging(true);
    const first = itemRefs.current[0], last = itemRefs.current[tabs.length - 1];
    if (!first || !last) return;
    const col = first.offsetWidth;
    const x = Math.max(first.offsetLeft, Math.min(last.offsetLeft, e.clientX - d.left - col / 2));
    setLens(lensFor(0, x));
    setDragOver(indexAt(x + d.left + col / 2));
  };
  const end = (e: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    setLifted(false); setDragging(false); setDragOver(null);
    if (commit) { pointerCommitAt.current = performance.now(); go(indexAt(e.clientX)); } else place();
  };
  const cancel = () => { drag.current = null; setLifted(false); setDragging(false); setDragOver(null); place(); };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = itemRefs.current.findIndex((el) => el === document.activeElement);
    if (i < 0) return;
    const n = tabs.length;
    const next = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : -1;
    if (next >= 0) { e.preventDefault(); itemRefs.current[next]?.focus(); }
  };

  return (
    <nav
      aria-label="Seções"
      className={cn(
        "absolute z-40 left-[17px] right-[17px] bottom-[max(8px,calc(env(safe-area-inset-bottom)-10px))] lg:hidden transition-transform duration-300 ease-out",
        hidden && "translate-y-[140%] pointer-events-none",
      )}
    >
      <div
        ref={barRef}
        role="tablist"
        className={cn("tab-bar liquid-glass", lifted && "lifted", dragging && "dragging")}
        style={{ ["--lens-x" as string]: `${lens.x}px`, ["--lens-w" as string]: `${lens.w}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => end(e, true)}
        onPointerCancel={(e) => end(e, false)}
        onKeyDown={onKeyDown}
      >
        {hasActive && <span className="tab-lens" aria-hidden="true" style={instant ? { transition: "none" } : undefined} />}
        {tabs.map((t, i) => {
          const selected = hasActive && i === activeIndex;
          const Icon = t.icon;
          return (
            <button
              key={t.href}
              ref={(el) => (itemRefs.current[i] = el)}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected || (!hasActive && i === 0) ? 0 : -1}
              className={cn("tab-item", dragOver === i && "drag-over")}
              onClick={(e) => {
                const fromPointer = e.detail > 0 && performance.now() - pointerCommitAt.current < 500;
                pointerCommitAt.current = 0;
                if (!fromPointer) go(i);
              }}
            >
              <Icon className="h-6 w-6" strokeWidth={selected ? 2.4 : 2} aria-hidden="true" />
              <span>{t.title}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
