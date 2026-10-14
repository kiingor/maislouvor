import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ASAFE_SETTINGS_IN_APP } from "@/lib/legal";

interface Props {
  open: boolean;
  /** team = líder desativa o assistente da equipe; member = a pessoa não permite/desliga o uso dos dados. */
  kind: "team" | "member";
  assistantName?: string;
  /** team: grupos conectados hoje (0 = não mostra a contagem). */
  groups?: number;
  /** member: primeira decisão ("Não permitir") ou desligar depois de ter permitido. */
  firstDecision?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmação das recusas que apagam ou desligam coisas (revoke_assistant_consent):
 * diz exatamente o que acontece antes de um toque irreversível.
 */
export function AssistantDeclineConfirm({
  open, kind, assistantName = "Asafe", groups = 0, firstDecision = false, busy = false, onConfirm, onCancel,
}: Props) {
  const name = assistantName;
  const team = kind === "team";
  const groupsText = groups > 1 ? ` (${groups} grupos)` : groups === 1 ? " (1 grupo)" : "";

  const title = team
    ? `Desativar o ${name}?`
    : firstDecision ? "Não permitir o uso dos seus dados?" : "Desligar o uso dos seus dados?";
  const action = team ? "Desativar" : firstDecision ? "Não permitir" : "Desligar";

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {team ? (
              <div className="space-y-2">
                <p>
                  Ele para de responder e de enviar avisos em todos os grupos desta equipe{groupsText}, as missões agendadas
                  ficam pausadas e o aceite do uso de IA é revogado.
                </p>
                <p>
                  Para voltar, um líder aceita o aviso de novo, gera outro código e manda “@{name} ativar CÓDIGO” em cada
                  grupo. Depois, retome as missões em {ASAFE_SETTINGS_IN_APP}, e cada pessoa permite de novo o uso dos próprios dados.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p>
                  O {name} deixa de reconhecer você no grupo, não marca mais você nos avisos automáticos e não envia seu nome
                  à IA: nas listas de disponibilidade e nas escalas que ele consulta, você aparece sem nome. Ele também esquece
                  o WhatsApp vinculado e apaga o histórico das suas conversas com ele.
                </p>
                <p>
                  No app, nada muda: seu nome continua nas escalas da equipe. Dá para permitir de novo quando quiser em{" "}
                  {ASAFE_SETTINGS_IN_APP}.
                </p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-ios-red text-white hover:bg-ios-red/90"
            disabled={busy}
            onClick={(e) => { e.preventDefault(); onConfirm(); }}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden="true" />}
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
