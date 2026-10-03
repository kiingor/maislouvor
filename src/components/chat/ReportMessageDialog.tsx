import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogToolbar } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { firePush } from "@/lib/push";
import { REPORT_REVIEW_TIME } from "@/lib/legal";
import {
  REPORT_DETAILS_MAX,
  REPORT_REASONS,
  REPORT_RECEIVED_DESCRIPTION,
  REPORT_RECEIVED_TITLE,
  REPORT_REVIEW_HINT,
  blockUser,
  chatModerationError,
  firstName,
  messagePreview,
  reportChatMessage,
  teamReportsLink,
  type ChatReportReason,
} from "@/lib/chatModeration";

export interface ReportTarget {
  id: string;
  sender_profile_id: string;
  senderName: string;
  message_type: string;
  content: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: ReportTarget | null;
  teamId: string | null;
  /** Quem enviou já está bloqueado: some a opção "Bloquear também". */
  alreadyBlocked?: boolean;
  /** Chamado quando a pessoa também foi bloqueada junto com a denúncia. */
  onBlocked?: () => void;
}

// Formulário agrupado dentro da folha (mesmas peças de CultoDuplicateModal).
const group = "overflow-hidden rounded-card bg-card";
const groupLabel = "mx-4 mb-1.5 block text-footnote text-muted-foreground";
const row = "relative flex min-h-[52px] items-center gap-3 px-4 py-2";
const rowSeparator = "before:absolute before:top-0 before:right-0 before:left-4 before:border-t before:border-border";

const FORM_ID = "chat-report-form";

/** Denunciar uma mensagem do chat: motivo, detalhes opcionais e, se quiser, bloquear quem enviou. */
export function ReportMessageDialog({ open, onOpenChange, message, teamId, alreadyBlocked = false, onBlocked }: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState<ChatReportReason | "">("");
  const [details, setDetails] = useState("");
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sending, setSending] = useState(false);

  // Cada denúncia começa do zero.
  useEffect(() => {
    if (open) {
      setReason("");
      setDetails("");
      setAlsoBlock(false);
    }
  }, [open, message?.id]);

  const name = firstName(message?.senderName);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!message || !reason || sending) return;
    setSending(true);
    try {
      const result = await reportChatMessage(message.id, reason, details);
      if (alsoBlock && !alreadyBlocked) {
        try {
          await blockUser(message.sender_profile_id);
          onBlocked?.();
        } catch (error) {
          toast({ title: "A denúncia foi enviada, mas o bloqueio falhou", description: chatModerationError(error), variant: "destructive" });
        }
      }
      toast({ title: REPORT_RECEIVED_TITLE, description: REPORT_RECEIVED_DESCRIPTION });
      // Push para a liderança; o aviso no app já foi criado pela RPC. Sem conteúdo da
      // mensagem; com o nome da equipe, para quem lidera mais de uma.
      if (teamId && !result.already_reported && result.notify_profile_ids?.length) {
        const body = result.team_name ? `${result.team_name} · ${REPORT_REVIEW_HINT}` : REPORT_REVIEW_HINT;
        void firePush(
          teamId,
          result.notify_profile_ids.map((profileId) => ({
            profile_id: profileId,
            title: "Nova denúncia no chat",
            body,
            link: teamReportsLink(teamId),
          })),
        );
      }
      onOpenChange(false);
    } catch (error) {
      toast({ title: "Não foi possível enviar a denúncia", description: chatModerationError(error), variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !sending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogToolbar
          title="Denunciar mensagem"
          confirm={{
            label: "Enviar",
            icon: "none",
            type: "submit",
            form: FORM_ID,
            disabled: !reason || !message,
            loading: sending,
          }}
        />
        <DialogDescription className="sr-only">
          Escolha o motivo da denúncia. A liderança da equipe e a equipe do +Louvor vão analisar em até {REPORT_REVIEW_TIME}.
        </DialogDescription>
        <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-6">
          {message && (
            <figure className={`${group} px-4 py-3`}>
              <figcaption className="text-footnote font-semibold text-muted-foreground">{message.senderName}</figcaption>
              <blockquote className="mt-0.5 line-clamp-3 whitespace-pre-wrap break-words text-body text-foreground [overflow-wrap:anywhere]">
                {messagePreview(message.message_type, message.content)}
              </blockquote>
            </figure>
          )}

          <div>
            <p className={groupLabel} id="chat-report-reason-label">Motivo</p>
            <RadioGroup
              value={reason}
              onValueChange={(value) => setReason(value as ChatReportReason)}
              aria-labelledby="chat-report-reason-label"
              className={`${group} gap-0`}
            >
              {REPORT_REASONS.map((option, i) => {
                const optionId = `chat-report-reason-${option.value}`;
                return (
                  <div key={option.value} className={`${row} ${i > 0 ? rowSeparator : ""}`}>
                    <label htmlFor={optionId} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block text-body text-foreground">{option.label}</span>
                      <span className="block text-footnote text-muted-foreground">{option.hint}</span>
                    </label>
                    <RadioGroupItem id={optionId} value={option.value} />
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          <div>
            <label htmlFor="chat-report-details" className={groupLabel}>Detalhes (opcional)</label>
            <div className={group}>
              <textarea
                id="chat-report-details"
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, REPORT_DETAILS_MAX))}
                maxLength={REPORT_DETAILS_MAX}
                rows={3}
                placeholder="Conte o que aconteceu, se quiser."
                className="block w-full resize-none bg-transparent px-4 py-3 text-body text-foreground placeholder:text-label-tertiary focus-visible:outline-offset-[-3px]"
              />
            </div>
            <p className="mx-4 mt-1.5 text-right text-footnote tabular-nums text-muted-foreground" aria-live="polite">
              {details.length}/{REPORT_DETAILS_MAX}
            </p>
          </div>

          {!alreadyBlocked && message && (
            <div className={group}>
              <div className={row}>
                <label htmlFor="chat-report-block" className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-body text-foreground">Bloquear {name}</span>
                  <span className="block text-footnote text-muted-foreground">Você deixa de ver as mensagens dessa pessoa.</span>
                </label>
                <Switch id="chat-report-block" checked={alsoBlock} onCheckedChange={(v) => setAlsoBlock(!!v)} />
              </div>
            </div>
          )}

          <p className="mx-4 text-footnote text-muted-foreground">
            Quem enviou a mensagem não é avisado da denúncia. A liderança da equipe e a equipe do +Louvor analisam
            cada denúncia em até {REPORT_REVIEW_TIME} e podem apagar a mensagem ou remover a pessoa da equipe.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
