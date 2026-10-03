import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { AssistantAiConsentDialog } from "@/components/assistant/AssistantAiConsentDialog";
import { AssistantDeclineConfirm } from "@/components/assistant/AssistantDeclineConfirm";
import {
  ASSISTANT_CONSENT_PROMPTS_KEY,
  consentErrorMessage,
  fetchConsentPrompts,
  giveAssistantConsent,
  revokeAssistantConsent,
} from "@/lib/assistantAiConsent";

/**
 * Ao abrir o app (dentro do AppLayout):
 * - líder de equipe que já usava o assistente sem o aceite atual: aviso que só
 *   fecha com "concordo" ou "desativar" (uma equipe por vez);
 * - membro de equipe com o assistente ativo que ainda não decidiu: aviso com
 *   "permitir" ou "não permitir". Fechar só adia até a próxima abertura do app:
 *   o aviso volta enquanto não houver uma escolha registrada no banco.
 * "Desativar" e "Não permitir" apagam/desligam coisas: pedem confirmação antes.
 * Sem a migração no banco, a consulta falha e nada aparece.
 */
export function AssistantConsentGate() {
  const { profileId } = useTeam();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  // Fechado (ou decidido) nesta abertura do app; não fica salvo no aparelho.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data } = useQuery({
    queryKey: [...ASSISTANT_CONSENT_PROMPTS_KEY, profileId],
    queryFn: fetchConsentPrompts,
    enabled: Boolean(profileId),
    staleTime: Infinity,
    retry: false,
  });

  if (!data || !profileId) return null;
  const name = data.assistant_name || "Asafe";
  const team = data.teams[0];

  const afterDecision = async (teamId?: string) => {
    if (teamId) qc.invalidateQueries({ queryKey: ["assistant-overview", teamId] });
    qc.invalidateQueries({ queryKey: ["assistant-my-status"] });
    await qc.invalidateQueries({ queryKey: ASSISTANT_CONSENT_PROMPTS_KEY });
  };

  const run = async (kind: "accept" | "decline", action: () => Promise<unknown>, done: string, teamId?: string) => {
    setBusy(kind);
    try {
      await action();
      if (!teamId) setDismissed(profileId);
      toast({ title: done });
      await afterDecision(teamId);
      // Só depois de recarregar: senão o aviso da mesma equipe reaparece por um instante.
      setConfirming(false);
    } catch (error) {
      toast({ title: "Não foi possível salvar sua escolha", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (team) {
    return (
      <>
        <AssistantAiConsentDialog
          open={!confirming}
          variant="team-confirm"
          assistantName={name}
          teamName={team.team_name}
          groups={team.groups}
          busy={busy}
          onAccept={() => run("accept", () => giveAssistantConsent("team_activation", team.team_id),
            `Uso de IA confirmado em ${team.team_name}`, team.team_id)}
          onDecline={() => setConfirming(true)}
          onClose={() => {}}
        />
        <AssistantDeclineConfirm
          open={confirming}
          kind="team"
          assistantName={name}
          groups={team.groups}
          busy={busy === "decline"}
          onConfirm={() => run("decline", () => revokeAssistantConsent("team_activation", team.team_id),
            `${name} desativado em ${team.team_name}`, team.team_id)}
          onCancel={() => setConfirming(false)}
        />
      </>
    );
  }

  if (!data.member_notice || dismissed === profileId) return null;

  return (
    <>
      <AssistantAiConsentDialog
        open={!confirming}
        variant="member-notice"
        assistantName={name}
        legacy={Boolean(data.member_legacy)}
        graceUntil={data.grace_until ?? null}
        busy={busy}
        onAccept={() => run("accept", () => giveAssistantConsent("member_link"), "Uso dos dados permitido")}
        onDecline={() => setConfirming(true)}
        onClose={() => setDismissed(profileId)}
      />
      <AssistantDeclineConfirm
        open={confirming}
        kind="member"
        firstDecision
        assistantName={name}
        busy={busy === "decline"}
        onConfirm={() => run("decline", () => revokeAssistantConsent("member_link"), "Uso dos dados não permitido")}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}
