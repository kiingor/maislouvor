import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface Props {
  type: string; // 'text' | 'image' | 'audio'
  content: string | null;
  attachmentPath: string | null;
  isMe: boolean;
}

/** Validade da URL assinada. Só precisa durar a sessão de leitura da conversa. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export function ChatMessageBubble({ type, content, attachmentPath, isMe }: Props) {
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

  if (type === "image" && url) {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightbox(true)}
          className="block overflow-hidden rounded-2xl border border-border/40 max-w-[220px]"
        >
          <img
            src={url}
            alt="Imagem"
            loading="lazy"
            className="max-h-60 w-auto object-cover"
          />
        </button>
        <Dialog open={lightbox} onOpenChange={setLightbox}>
          <DialogContent className="glass border-0 rounded-2xl p-2 max-w-2xl">
            <img src={url} alt="Imagem" className="w-full h-auto rounded-xl" />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (type === "audio" && url) {
    return (
      <div
        className={`px-2 py-1.5 rounded-2xl ${
          isMe
            ? "bg-primary/90 rounded-tr-md"
            : "bg-accent rounded-tl-md"
        }`}
      >
        <audio controls preload="metadata" src={url} className="h-9 max-w-[220px]" />
      </div>
    );
  }

  // Fallback: text (or attachment that failed to resolve)
  return (
    <div
      className={`px-3 py-1.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
        isMe
          ? "bg-primary text-primary-foreground rounded-tr-md"
          : "bg-accent text-accent-foreground rounded-tl-md"
      }`}
    >
      {content ?? (type === "image" ? "[imagem]" : type === "audio" ? "[áudio]" : "")}
    </div>
  );
}
