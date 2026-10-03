import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogToolbar } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { RESOLUTION_NOTE_MAX, firstName, type ChatReport } from "@/lib/chatModeration";
import { cn } from "@/lib/utils";

interface Props {
  report: ChatReport | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (note: string, removeMember: boolean) => void;
  pending: boolean;
  /** Painel da plataforma: aplica o tema do gerenciador. */
  platform?: boolean;
}

const FORM_ID = "chat-report-resolve-form";

/** Resolver uma denúncia: anotação interna e, se fizer sentido, tirar o autor da equipe. */
export function ResolveReportDialog({ report, onOpenChange, onConfirm, pending, platform = false }: Props) {
  const [note, setNote] = useState("");
  const [removeMember, setRemoveMember] = useState(false);

  useEffect(() => {
    if (report) {
      setNote("");
      setRemoveMember(false);
    }
  }, [report?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = firstName(report?.reported_name);
  const canRemove = !!report?.reported_profile_id && report.reported_is_member && !report.reported_is_owner;

  return (
    <Dialog open={!!report} onOpenChange={(open) => !pending && onOpenChange(open)}>
      <DialogContent className={cn("sm:max-w-md", platform && "platform-dialog bg-white")}>
        <DialogToolbar
          title="Resolver denúncia"
          confirm={{ label: "Resolver", icon: "none", type: "submit", form: FORM_ID, loading: pending }}
        />
        <DialogDescription className="sr-only">Registre o que foi feito com esta denúncia.</DialogDescription>
        <form
          id={FORM_ID}
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(note, canRemove && removeMember);
          }}
        >
          <div>
            <label htmlFor="chat-report-note" className="mx-4 mb-1.5 block text-footnote text-muted-foreground">
              Anotação (opcional)
            </label>
            <div className="overflow-hidden rounded-card bg-card">
              <textarea
                id="chat-report-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, RESOLUTION_NOTE_MAX))}
                maxLength={RESOLUTION_NOTE_MAX}
                rows={3}
                placeholder="O que foi feito. Fica só no registro da denúncia."
                className="block w-full resize-none bg-transparent px-4 py-3 text-body text-foreground placeholder:text-label-tertiary focus-visible:outline-offset-[-3px]"
              />
            </div>
          </div>

          {canRemove && (
            <div className="overflow-hidden rounded-card bg-card">
              <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
                <label htmlFor="chat-report-remove" className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-body text-foreground">Remover {name} da equipe</span>
                  <span className="block text-footnote text-muted-foreground">
                    A pessoa perde o acesso à equipe e só volta com um novo convite.
                  </span>
                </label>
                <Switch id="chat-report-remove" checked={removeMember} onCheckedChange={(v) => setRemoveMember(!!v)} />
              </div>
            </div>
          )}

          <div className="mx-4 space-y-1.5 text-footnote text-muted-foreground">
            {report?.reported_is_owner && <p>{name} é o responsável pela equipe e não pode ser removido por aqui.</p>}
            {report?.message_exists && <p>A mensagem continua no chat. Use “Apagar mensagem” para tirá-la de lá.</p>}
            <p>Quem denunciou recebe um aviso de que a denúncia foi analisada, sem detalhes da decisão.</p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
