import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, Loader2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/*
 * Folha iOS 27 (HIG > Sheets). Ver docs/ux/ios27-design-spec.md §5 e §9.
 * - Celular (< 640px): folha ancorada embaixo, raio 38, puxador, arrastar para baixo fecha.
 * - ≥ 640px: diálogo centralizado (estilo folha de formulário do iPadOS), raio 28.
 * - Fechar (✕) padrão: círculo de vidro à esquerda; some quando há <DialogToolbar>.
 */

const MOBILE_QUERY = "(max-width: 639.98px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
/** Onde o arrasto pode começar: puxador, barra da folha e cabeçalho. */
const DRAG_ZONE = "[data-sheet-grabber],[data-dialog-toolbar],[data-dialog-header]";
/** Controles dentro dessas áreas continuam recebendo o toque normalmente. */
const NO_DRAG =
  "button,a[href],input,textarea,select,label,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=slider],[role=combobox],[contenteditable=''],[contenteditable='true'],[data-no-drag]";

const matches = (query: string) => typeof window !== "undefined" && !!window.matchMedia?.(query).matches;

function assignRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

/** Permite ao DialogToolbar avisar a folha para esconder o ✕ padrão. */
const DialogSheetContext = React.createContext<{ registerToolbar: () => () => void } | null>(null);

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-[var(--scrim)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:duration-300",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DragState {
  id: number;
  x0: number;
  y0: number;
  dy: number;
  lastY: number;
  lastT: number;
  v: number;
  active: boolean;
}

/**
 * Arrastar para baixo fecha a folha (só no celular). Solto além de 30% da altura
 * ou num gesto rápido, fecha pelo DialogPrimitive.Close escondido; senão volta ao lugar.
 */
function useSheetDrag(enabled: boolean) {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const dismissRef = React.useRef<HTMLButtonElement | null>(null);
  const drag = React.useRef<DragState | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = contentRef.current;
    const target = e.target as Element | null;
    if (!enabled || !el || !target || e.button !== 0 || !e.isPrimary) return;
    // Eventos de portais aninhados (popover, outro diálogo) também sobem pela árvore do React.
    if (!el.contains(target) || !target.closest(DRAG_ZONE) || target.closest(NO_DRAG)) return;
    if (!matches(MOBILE_QUERY)) return;
    drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, dy: 0, lastY: e.clientY, lastT: e.timeStamp, v: 0, active: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = drag.current;
    const el = contentRef.current;
    if (!s || s.id !== e.pointerId || !el) return;
    const dx = e.clientX - s.x0;
    const raw = e.clientY - s.y0;
    if (!s.active) {
      if (Math.abs(dx) < 6 && Math.abs(raw) < 6) return;
      if (raw <= 0 || Math.abs(dx) > Math.abs(raw)) {
        drag.current = null;
        return;
      }
      s.active = true;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro já liberado */
      }
    }
    // Acima da posição de repouso a folha resiste (elástico curto).
    const y = raw >= 0 ? raw : -Math.min(24, Math.sqrt(-raw) * 3);
    const dt = Math.max(1, e.timeStamp - s.lastT);
    s.v = 0.8 * ((e.clientY - s.lastY) / dt) + 0.2 * s.v;
    s.lastY = e.clientY;
    s.lastT = e.timeStamp;
    s.dy = y;
    el.style.transform = `translateY(${y}px)`;
    if (overlayRef.current) overlayRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, y) / el.offsetHeight));
  };

  const finish = (e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const s = drag.current;
    if (!s || s.id !== e.pointerId) return;
    drag.current = null;
    const el = contentRef.current;
    const overlay = overlayRef.current;
    if (!s.active || !el) return;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* já liberado */
    }
    const height = el.offsetHeight || 1;
    const scrim = overlay ? Math.max(0, 1 - Math.max(0, s.dy) / height) : 1;
    const dismiss = !cancelled && (s.dy > height * 0.3 || (s.dy > 24 && s.v > 0.5));
    const animated = !matches(REDUCED_MOTION_QUERY) && typeof el.animate === "function";
    el.style.transform = "";
    if (overlay) overlay.style.opacity = "";

    if (!dismiss) {
      if (animated) {
        el.animate([{ transform: `translateY(${s.dy}px)` }, { transform: "translateY(0)" }], {
          duration: 380,
          easing: "cubic-bezier(0.3, 1.25, 0.45, 1)",
        });
        overlay?.animate([{ opacity: scrim }, { opacity: 1 }], { duration: 300, easing: "ease-out" });
      }
      return;
    }

    const close = (onStay?: () => void) => {
      // Sem animação de saída: a folha já saiu da tela pelo gesto.
      el.style.animation = "none";
      if (overlay) overlay.style.animation = "none";
      dismissRef.current?.click();
      requestAnimationFrame(() => {
        // Diálogo controlado que recusou fechar: devolve a folha ao lugar.
        if (el.isConnected && el.getAttribute("data-state") === "open") {
          el.style.animation = "";
          if (overlay) overlay.style.animation = "";
          onStay?.();
        }
      });
    };

    if (!animated) {
      close();
      return;
    }
    const out = el.animate([{ transform: `translateY(${s.dy}px)` }, { transform: "translateY(calc(100% + 16px))" }], {
      duration: 260,
      easing: "cubic-bezier(0.32, 0.72, 0, 1)",
      fill: "forwards",
    });
    const fade = overlay?.animate([{ opacity: scrim }, { opacity: 0 }], { duration: 260, easing: "ease-out", fill: "forwards" });
    out.onfinish = () =>
      close(() => {
        out.cancel();
        fade?.cancel();
      });
  };

  return {
    contentRef,
    overlayRef,
    dismissRef,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => finish(e, false),
      onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => finish(e, true),
    },
  };
}

/**
 * Reduzir transparência / Aumentar contraste (spec §7): o material da folha fica opaco e sem
 * desfoque. A cor da folha é pintada sobre `--background` opaco, então funciona nos dois temas
 * (inclusive quando a folha recebe a classe `dark` nela mesma, como no modo ensaio).
 */
const opaqueSheetMaterial = cn(
  "contrast-more:bg-background contrast-more:bg-[linear-gradient(var(--sheet-bg),var(--sheet-bg))] contrast-more:backdrop-filter-none",
  "[@media(prefers-reduced-transparency:reduce)]:bg-background [@media(prefers-reduced-transparency:reduce)]:bg-[linear-gradient(var(--sheet-bg),var(--sheet-bg))] [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none",
);

const sheetClasses = cn(
  // Celular: folha flutuante ancorada embaixo (protótipo .sheet).
  "fixed inset-x-2 bottom-2 z-50 mx-auto grid w-auto max-w-lg max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] gap-4 overflow-y-auto overscroll-contain",
  "rounded-sheet bg-[var(--sheet-bg)] text-foreground shadow-[0_-10px_40px_rgba(0,0,0,0.12)] outline-none backdrop-blur-[30px] backdrop-saturate-[1.8]",
  opaqueSheetMaterial,
  "px-4 pb-[max(env(safe-area-inset-bottom),20px)] pt-[19px]",
  // Grupos e células dentro da folha contrastam com o material (claro: branco; escuro: #2C2C2E).
  "[--grouped-tertiary:var(--card)] dark:[--card:240_3%_17%]",
  "max-sm:data-[state=open]:animate-[ios-sheet-in_420ms_cubic-bezier(0.32,0.72,0,1)] max-sm:data-[state=closed]:animate-[ios-sheet-out_300ms_cubic-bezier(0.32,0.72,0,1)_forwards]",
  // ≥ 640px: diálogo centralizado.
  "sm:inset-x-4 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:shadow-[0_24px_80px_-12px_rgba(0,0,0,0.35)]",
  "sm:data-[state=open]:animate-in sm:data-[state=open]:fade-in-0 sm:data-[state=open]:zoom-in-95 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=open]:duration-200",
  "sm:data-[state=closed]:animate-out sm:data-[state=closed]:fade-out-0 sm:data-[state=closed]:zoom-out-95 sm:data-[state=closed]:slide-out-to-top-[48%]",
  "motion-reduce:!animate-none",
);

const fullscreenClasses = cn(
  "fixed inset-0 z-50 flex flex-col gap-4 overflow-y-auto overscroll-contain bg-background text-foreground outline-none",
  "px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-[calc(env(safe-area-inset-top)+8px)]",
  "data-[state=open]:animate-[ios-sheet-in_420ms_cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:animate-[ios-sheet-out_300ms_cubic-bezier(0.32,0.72,0,1)_forwards]",
  "motion-reduce:!animate-none",
);

/** Círculo de vidro 44pt com ✕ (barra da folha, à esquerda). */
const closeCircleClasses =
  "liquid-glass grid size-11 shrink-0 place-items-center rounded-full text-foreground transition-transform duration-200 active:scale-95 disabled:pointer-events-none disabled:opacity-40";

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /** Esconde o ✕ padrão (a tela desenha o próprio Fechar). */
  hideClose?: boolean;
  /** "sheet" (padrão): folha no celular, diálogo centralizado no desktop. "fullscreen": cobre a tela inteira. */
  variant?: "sheet" | "fullscreen";
}

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  (
    { className, children, hideClose = false, variant = "sheet", onPointerDown, onPointerMove, onPointerUp, onPointerCancel, ...props },
    ref,
  ) => {
    const isSheet = variant === "sheet";
    const { contentRef, overlayRef, dismissRef, handlers } = useSheetDrag(isSheet);
    const [toolbars, setToolbars] = React.useState(0);
    const sheetContext = React.useMemo(
      () => ({
        registerToolbar: () => {
          setToolbars((n) => n + 1);
          return () => setToolbars((n) => n - 1);
        },
      }),
      [],
    );
    const showClose = !hideClose && toolbars === 0;

    return (
      <DialogPortal>
        <DialogOverlay ref={overlayRef} />
        <DialogPrimitive.Content
          ref={assignRefs(ref, contentRef)}
          data-sheet={isSheet ? "" : undefined}
          className={cn(isSheet ? sheetClasses : fullscreenClasses, className)}
          onPointerDown={(e) => {
            onPointerDown?.(e);
            if (!e.defaultPrevented) handlers.onPointerDown(e);
          }}
          onPointerMove={(e) => {
            onPointerMove?.(e);
            handlers.onPointerMove(e);
          }}
          onPointerUp={(e) => {
            onPointerUp?.(e);
            handlers.onPointerUp(e);
          }}
          onPointerCancel={(e) => {
            onPointerCancel?.(e);
            handlers.onPointerCancel(e);
          }}
          {...props}
        >
          {isSheet && (
            <div
              data-sheet-grabber=""
              aria-hidden="true"
              className="absolute left-1/2 top-0 z-20 flex h-5 w-24 -translate-x-1/2 cursor-grab touch-none justify-center sm:hidden"
            >
              <div className="ios-grabber" />
            </div>
          )}
          {showClose && (
            <DialogPrimitive.Close
              data-dialog-close=""
              className={cn(
                closeCircleClasses,
                "absolute left-4 z-20 [:has([data-dialog-toolbar])>&]:hidden",
                isSheet ? "top-[19px]" : "top-[calc(env(safe-area-inset-top)+8px)]",
              )}
            >
              <X className="relative z-[4] size-[18px]" strokeWidth={2.4} aria-hidden="true" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
          )}
          <DialogSheetContext.Provider value={sheetContext}>{children}</DialogSheetContext.Provider>
          {/* Alvo do gesto de arrastar para fechar (fecha pelo mesmo caminho do ✕). */}
          <DialogPrimitive.Close ref={dismissRef} tabIndex={-1} aria-hidden="true" style={{ display: "none" }} />
        </DialogPrimitive.Content>
      </DialogPortal>
    );
  },
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    data-dialog-header=""
    className={cn(
      // Alinhado ao ✕ (44pt à esquerda) e centralizado, como a barra de uma folha.
      "flex min-h-11 flex-col items-center justify-center gap-0.5 px-12 text-center max-sm:touch-none max-sm:select-none",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex w-full flex-col-reverse gap-2 [&>*]:w-full sm:flex-row sm:justify-end sm:[&>*]:w-auto",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-headline text-foreground", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-footnote text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export interface DialogToolbarConfirm {
  /** Rótulo da ação. Com `icon: "check"` vira o aria-label do círculo ✓. */
  label: string;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit";
  /** id do <form> quando a barra fica fora dele. */
  form?: string;
  disabled?: boolean;
  loading?: boolean;
  /** "check" (padrão): círculo proeminente com ✓. "none": cápsula com o texto. */
  icon?: "check" | "none";
}

export interface DialogToolbarProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Título da folha (também é o DialogTitle acessível). */
  title: React.ReactNode;
  confirm?: DialogToolbarConfirm;
  /** Lógica extra ao fechar; o fechamento em si é feito pelo DialogClose. */
  onClose?: () => void;
  /** Nome acessível do ✕ (padrão "Fechar", o mesmo do ✕ padrão da folha). */
  closeLabel?: string;
}

/**
 * Barra da folha (HIG > Sheets / Toolbars): Fechar à esquerda, título centralizado,
 * Confirmar (ação principal, proeminente) à direita.
 */
const DialogToolbar = React.forwardRef<HTMLDivElement, DialogToolbarProps>(
  ({ title, confirm, onClose, closeLabel = "Fechar", className, ...props }, ref) => {
    const sheet = React.useContext(DialogSheetContext);
    React.useLayoutEffect(() => sheet?.registerToolbar(), [sheet]);

    const iconOnly = (confirm?.icon ?? "check") === "check";

    return (
      <div
        ref={ref}
        data-dialog-toolbar=""
        className={cn(
          "grid min-h-11 grid-cols-[1fr_auto_1fr] items-center gap-2 max-sm:touch-none max-sm:select-none",
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Close
          type="button"
          aria-label={closeLabel}
          onClick={() => onClose?.()}
          className={cn(closeCircleClasses, "justify-self-start")}
        >
          <X className="relative z-[4] size-[18px]" strokeWidth={2.4} aria-hidden="true" />
        </DialogPrimitive.Close>
        <DialogPrimitive.Title className="min-w-0 truncate text-center text-headline text-foreground">
          {title}
        </DialogPrimitive.Title>
        {confirm ? (
          <button
            type={confirm.type ?? "button"}
            form={confirm.form}
            onClick={confirm.onClick}
            disabled={confirm.disabled || confirm.loading}
            aria-label={iconOnly ? confirm.label : undefined}
            aria-busy={confirm.loading || undefined}
            className={cn(
              "inline-flex h-11 items-center justify-center justify-self-end rounded-full bg-prominent text-prominent-foreground",
              "shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_4px_12px_-4px_var(--lg-shadow)] transition-[transform,opacity] duration-200 active:scale-95",
              "disabled:pointer-events-none disabled:opacity-40",
              // `min-w-max`: a coluna da direita guarda a largura toda da cápsula; um min-width fixo
              // trocaria o mínimo automático do item e a cápsula invadiria o título.
              iconOnly ? "w-11" : "min-w-max gap-1.5 whitespace-nowrap px-4 text-subhead font-semibold",
              confirm.loading && "disabled:opacity-100",
            )}
          >
            {confirm.loading ? (
              <Loader2 className="size-[18px] animate-spin" strokeWidth={2.4} aria-hidden="true" />
            ) : (
              iconOnly && <Check className="size-[19px]" strokeWidth={2.6} aria-hidden="true" />
            )}
            {!iconOnly && <span>{confirm.label}</span>}
          </button>
        ) : (
          <span aria-hidden="true" className="size-11 justify-self-end" />
        )}
      </div>
    );
  },
);
DialogToolbar.displayName = "DialogToolbar";

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogToolbar,
};
