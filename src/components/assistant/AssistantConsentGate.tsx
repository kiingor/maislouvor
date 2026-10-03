import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTeam } from "@/contexts/TeamContext";
import { useToast } from "@/hooks/use-toast";
import { AssistantAiConsentDialog } from "@/components/assistant/AssistantAiConsentDialog";
import {
  ASSISTANT_AI_CONSENT_VERSION,
  ASSISTANT_CONSENT_PROMPTS_KEY,
  consentErrorMessage,
  fetchConsentPrompts,
  giveAssistantConsent,
  revokeAssistantConsent,
} from "@/lib/assistantAiConsent";

/** O aviso de membro aparece uma vez por versão do texto, por pessoa, neste aparelho. */
const noticeKey = (profileId: string) => `louvor_asafe_ai_notice:${ASSISTANT_AI_CONSENT_VERSION}:${profileId}`;

function noticeSeen(profileId: string | null): boolean {
  if (!profileId) return true;
  try {
    return localStorage.getItem(noticeKey(profileId)) === "1";
  } catch {
    return false;
  }
}

function markNoticeSeen(profileId: string) {
  try {
    localStorage.setItem(noticeKey(profileId), "1");
  } catch {
    /* sem storage: o aviso pode voltar na próxima abertura */
  }
}

/**
 * Ao abrir o app (dentro do AppLayout):
 * - líder de equipe que já usava o assistente sem o aceite atual: aviso que só
 *   fecha com "concordo" ou "desativar" (uma equipe por vez);
 * - membro de equipe com o assistente ativo que ainda não decidiu: aviso único
 *   com "permitir" ou "não permitir" (fechar = decidir depois em Ajustes).
 * Sem a migração no banco, a consulta falha e nada aparece.
 */
export function AssistantConsentGate() {
  const { profileId } = useTeam();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

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
      if (!teamId) markNoticeSeen(profileId);
      toast({ title: done });
      await afterDecision(teamId);
    } catch (error) {
      toast({ title: "Não foi possível salvar sua escolha", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  if (team) {
    return (
      <AssistantAiConsentDialog
        open
        variant="team-confirm"
        assistantName={name}
        teamName={team.team_name}
        groups={team.groups}
        busy={busy}
        onAccept={() => run("accept", () => giveAssistantConsent("team_activation", team.team_id),
          `Uso de IA confirmado em ${team.team_name}`, team.team_id)}
        onDecline={() => run("decline", () => revokeAssistantConsent("team_activation", team.team_id),
          `${name} desativado em ${team.team_name}`, team.team_id)}
        onClose={() => {}}
      />
    );
  }

  if (!data.member_notice || dismissed === profileId || noticeSeen(profileId)) return null;

  const close = () => {
    markNoticeSeen(profileId);
    setDismissed(profileId);
  };

  return (
    <AssistantAiConsentDialog
      open
      variant="member-notice"
      assistantName={name}
      busy={busy}
      onAccept={() => run("accept", () => giveAssistantConsent("member_link"), "Uso dos dados permitido")}
      onDecline={() => run("decline", () => revokeAssistantConsent("member_link"), "Uso dos dados desligado")}
      onClose={close}
    />
  );
}
