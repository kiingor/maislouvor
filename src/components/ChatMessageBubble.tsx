import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface Props {
  type: string; // 'text' | 'image' | 'audio'
  content: string | null;
  attachmentPath: string | null;
  isMe: boolean;
  /** Última bolha de uma sequência do mesmo remetente: canto da "cauda" mais fechado (estilo Mensagens). */
  tail?: boolean;
}

/** Validade da URL assinada. Só precisa durar a sessão de leitura da conversa. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export function ChatMessageBubble({ type, content, attachmentPath, isMe, tail = true }: Props) {
  const [lightbox, setLightbox] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  // O bucket 'chat' é privado (ver migration 20260816120000_chat_bucket_privado).
  // getPublicUrl não serve mais: só membros da equipe conseguem ler, e o acesso
  // passa por uma URL assinada de validade curta.
  useEffect(() => {
    if (!attachmentPath) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from("chat")
      .createSignedUrl(attachmentPath, SIGNED_URL_TTL_SECONDS)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[chat] não foi possível assinar a URL do anexo", error);
          setUrl(null);
          return;
        }
        setUrl(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [attachmentPath]);

  // Bolha do iOS: raio 18, canto da cauda reduzido na última bolha da sequência.
  const shape = cn("rounded-[18px]", tail && (isMe ? "rounded-br-[6px]" : "rounded-bl-[6px]"));
  // Própria = cor proeminente; dos outros = preenchimento cinza do sistema.
  const tone = isMe ? "bg-prominent text-prominent-foreground" : "bg-fill-secondary text-foreground";

  if (type === "image" && url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightbox(true)}
          aria-label="Ampliar imagem"
          className={cn("block overflow-hidden max-w-[min(240px,100%)] bg-fill-tertiary active:opacity-80 transition-opacity", shape)}
        >
          <img src={url} alt="Imagem" loading="lazy" className="block max-h-72 w-auto object-cover" />
        </button>
        <Dialog open={lightbox} onOpenChange={setLightbox}>
          <DialogContent className="max-w-2xl p-2 sm:p-3">
            <DialogTitle className="sr-only">Imagem</DialogTitle>
            <img src={url} alt="Imagem" className="w-full h-auto max-h-[80dvh] object-contain rounded-[18px]" />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (type === "audio" && url) {
    return (
      <div className={cn("min-w-0 max-w-full px-2 py-1.5", shape, tone)}>
        {/* Encolhe com a coluna da bolha em telas estreitas (360pt) em vez de vazar da tela. */}
        <audio controls preload="metadata" src={url} className="block h-10 w-[240px] max-w-full" />
      </div>
    );
  }

  // Fallback: text (or attachment that failed to resolve)
  return (
    <div className={cn("px-3 py-[7px] text-body whitespace-pre-wrap break-words [overflow-wrap:anywhere]", shape, tone)}>
      {content ?? (type === "image" ? "[imagem]" : type === "audio" ? "[áudio]" : "")}
    </div>
  );
}
