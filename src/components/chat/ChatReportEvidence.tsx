import { useState } from "react";
import { AudioLines, Image as ImageIcon, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { deletedRoleLabels, type ChatReport } from "@/lib/chatModeration";
import { cn } from "@/lib/utils";

/** URL assinada curta: só o tempo de olhar a prova. */
const EVIDENCE_URL_TTL_SECONDS = 10 * 60;

/**
 * Cópia da mensagem denunciada (feita no momento da denúncia, sobrevive à mensagem
 * apagada). Anexos só carregam quando a pessoa pede para ver.
 */
export function ChatReportEvidence({ report, className }: { report: ChatReport; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const attachment = report.message_attachment_path;
  const isImage = report.message_type === "image";
  const isAudio = report.message_type === "audio";

  const load = async () => {
    if (!attachment || loading) return;
    setLoading(true);
    const { data, error } = await supabase.storage.from("chat").createSignedUrl(attachment, EVIDENCE_URL_TTL_SECONDS);
    setLoading(false);
    if (error || !data?.signedUrl) setUnavailable(true);
    else setUrl(data.signedUrl);
  };

  return (
    <figure className={cn("rounded-[14px] border border-border bg-muted/40 px-3 py-2.5", className)}>
      <figcaption className="text-footnote font-semibold text-muted-foreground">
        {report.reported_name || "Conta excluída"}
        {report.message_created_at && (
          <time dateTime={report.message_created_at} className="ml-1.5 font-normal tabular-nums">
            {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(
              new Date(report.message_created_at),
            )}
          </time>
        )}
      </figcaption>
      {report.message_content && (
        <blockquote className="mt-1 whitespace-pre-wrap break-words text-subhead text-foreground [overflow-wrap:anywhere]">
          {report.message_content}
        </blockquote>
      )}
      {attachment && (isImage || isAudio) && (
        <div className="mt-2">
          {url ? (
            isImage ? (
              <img src={url} alt="Imagem denunciada" className="max-h-64 w-auto max-w-full rounded-[10px] object-contain" />
            ) : (
              <audio controls preload="metadata" src={url} className="block h-10 w-full max-w-[280px]" />
            )
          ) : unavailable ? (
            <p className="text-footnote text-muted-foreground">O anexo não está mais disponível.</p>
          ) : (
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-fill-tertiary px-3 text-footnote font-semibold text-foreground transition-colors hover:bg-fill-secondary disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : isImage ? (
                <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <AudioLines className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {isImage ? "Ver imagem" : "Ouvir áudio"}
            </button>
          )}
        </div>
      )}
      {!report.message_content && !attachment && (
        <p className="mt-1 text-subhead text-muted-foreground">Mensagem sem texto</p>
      )}
      {report.message_deleted_role && (
        <p className="mt-2 text-footnote text-muted-foreground">{deletedRoleLabels[report.message_deleted_role]}</p>
      )}
    </figure>
  );
}
