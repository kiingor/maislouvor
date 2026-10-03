import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ban, Copy, Ellipsis, EyeOff, Flag, Trash2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { firstName } from "@/lib/chatModeration";
import { cn } from "@/lib/utils";

export interface ModeratedMessageProps {
  isMe: boolean;
  senderName: string;
  type: string;
  content: string | null;
  /** Quem enviou está bloqueado por mim: a mensagem começa recolhida. */
  blocked: boolean;
  /** Autor, ou liderança da equipe apagando qualquer mensagem. */
  canDelete: boolean;
  onReport: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onDelete: () => void;
  children: ReactNode;
}

/** Toque longo: abre o menu depois deste tempo, se o dedo não andar mais que LONG_PRESS_SLOP. */
const LONG_PRESS_MS = 480;
const LONG_PRESS_SLOP = 10;

/**
 * Abre o menu de contexto do Radix no ponto indicado. O mesmo evento serve para o
 * toque longo (com tolerância a tremidas, que o Radix não tem) e para o botão "…".
 */
function openMenuAt(el: Element, x: number, y: number) {
  el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

/**
 * Bolha do chat com as ações de moderação: toque longo no celular, clique direito
 * ou botão "…" (ao passar o mouse / pelo teclado) no computador.
 * Mensagens de quem eu bloqueei aparecem recolhidas, com opção de mostrar ou desbloquear.
 */
export function ModeratedMessage({
  isMe,
  senderName,
  type,
  content,
  blocked,
  canDelete,
  onReport,
  onBlock,
  onUnblock,
  onDelete,
  children,
}: ModeratedMessageProps) {
  const { toast } = useToast();
  const [revealed, setRevealed] = useState(false);
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  const name = firstName(senderName);
  const canCopy = type === "text" && !!content?.trim();

  // Desbloqueou e bloqueou de novo: volta a esconder.
  useEffect(() => {
    if (!blocked) setRevealed(false);
  }, [blocked]);

  const cancelPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  useEffect(() => cancelPress, []);

  if (blocked && !revealed) {
    return (
      <div
        role="group"
        aria-label={`Mensagem de usuário bloqueado (${senderName})`}
        className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-0.5 rounded-[18px] border border-dashed border-separator px-3 py-[7px] text-subhead text-muted-foreground"
      >
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
          Mensagem de usuário bloqueado
        </span>
        <span className="inline-flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="relative font-semibold text-primary before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']"
          >
            Mostrar
          </button>
          <button
            type="button"
            onClick={onUnblock}
            className="relative font-semibold text-primary before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']"
          >
            Desbloquear
          </button>
        </span>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content ?? "");
      toast({ title: "Texto copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <ContextMenu modal>
      <ContextMenuTrigger asChild>
        <div
          className="group/msg relative [@media(pointer:coarse)]:select-none"
          onPointerDown={(e) => {
            if (e.pointerType === "mouse" || e.isPrimary === false) return;
            cancelPress();
            const el = e.currentTarget;
            const { clientX: x, clientY: y } = e;
            press.current = {
              x,
              y,
              timer: window.setTimeout(() => {
                press.current = null;
                navigator.vibrate?.(8);
                openMenuAt(el, x, y);
              }, LONG_PRESS_MS),
            };
          }}
          onPointerMove={(e) => {
            const p = press.current;
            if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_SLOP) cancelPress();
          }}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
        >
          {children}
          {/* Computador: aparece ao passar o mouse ou com o foco do teclado. No toque fica só para leitores de tela. */}
          <button
            type="button"
            aria-label="Ações da mensagem"
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              openMenuAt(e.currentTarget, rect.left + rect.width / 2, rect.bottom);
            }}
            className={cn(
              "absolute -top-2.5 z-[5] grid h-7 w-7 place-items-center rounded-full bg-card text-muted-foreground shadow-sm ring-1 ring-separator",
              "pointer-events-none opacity-0 transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100",
              "group-hover/msg:pointer-events-auto group-hover/msg:opacity-100 group-data-[state=open]/msg:opacity-100",
              "[@media(hover:none)]:sr-only",
              isMe ? "-left-2.5" : "-right-2.5",
            )}
          >
            <Ellipsis className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {canCopy && (
          <ContextMenuItem onSelect={() => void copy()}>
            <Copy aria-hidden="true" />
            Copiar texto
          </ContextMenuItem>
        )}
        {blocked && revealed && (
          <ContextMenuItem onSelect={() => setRevealed(false)}>
            <EyeOff aria-hidden="true" />
            Ocultar mensagem
          </ContextMenuItem>
        )}
        {!isMe && (
          <>
            {(canCopy || (blocked && revealed)) && <ContextMenuSeparator />}
            <ContextMenuItem onSelect={onReport}>
              <Flag aria-hidden="true" />
              Denunciar
            </ContextMenuItem>
            {blocked ? (
              <ContextMenuItem onSelect={onUnblock}>
                <Ban aria-hidden="true" />
                Desbloquear {name}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onSelect={onBlock} className="text-ios-red focus:text-ios-red">
                <Ban aria-hidden="true" />
                Bloquear {name}
              </ContextMenuItem>
            )}
          </>
        )}
        {canDelete && (
          <>
            {(canCopy || !isMe) && <ContextMenuSeparator />}
            <ContextMenuItem onSelect={onDelete} className="text-ios-red focus:text-ios-red">
              <Trash2 aria-hidden="true" />
              Apagar
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
