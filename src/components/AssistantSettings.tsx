import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { format, parseISO } from "date-fns";
import { BookOpen, Bot, Check, ChevronRight, Copy, FileText, KeyRound, Link2, Loader2, MessageCircle, PowerOff, ShieldCheck, TriangleAlert, Unlink, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { AssistantMissions } from "@/components/AssistantMissions";
import { AssistantAiConsentDialog, type AssistantConsentVariant } from "@/components/assistant/AssistantAiConsentDialog";
import { AssistantDeclineConfirm } from "@/components/assistant/AssistantDeclineConfirm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_CAPABILITIES,
  NOTIFICATION_OPTIONS,
  type NotificationSettings,
  activationMessage,
  DEFAULT_INSTRUCTIONS_MAX,
  formatWhatsAppNumber,
  linkMessage,
  whatsAppLink,
  type AssistantMyStatus,
  type AssistantOverview,
} from "@/lib/whatsappAssistant";
import {
  ASSISTANT_AI_PROVIDER,
  ASSISTANT_CONSENT_PROMPTS_KEY as CONSENT_PROMPTS_KEY,
  consentErrorMessage,
  giveAssistantConsent,
  graceUntilLabel,
  isConsentRequiredError,
  revokeAssistantConsent,
} from "@/lib/assistantAiConsent";

/* Lista agrupada no estilo do app Ajustes (mesmas medidas de TeamSettings). */
const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_LABEL = "mx-4 mb-1.5 text-footnote text-muted-foreground";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";
const ROW_BODY =
  "flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-t border-separator py-2 pr-4 group-first/row:border-t-0";
const CIRCLE_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-foreground transition-[background-color,transform] hover:bg-fill-secondary active:scale-95";
/** Linha inteira tocável (ação dentro de um grupo). */
const ROW_BUTTON =
  "group/row flex w-full items-center gap-3 pl-4 text-left transition-colors active:bg-fill-quaternary disabled:opacity-60";

const INSTRUCTIONS_PLACEHOLDER =
  "Ex.: Ensaio toda quinta às 20h no templo sede.\nChegar 30 minutos antes dos cultos.\nNa Santa Ceia a equipe usa roupa preta.";

/** As RPCs do assistente ainda não estão nos tipos gerados (types.ts). */
type UntypedRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function callRpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase as unknown as UntypedRpc).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span className={cn("flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground", className)}>
      <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

function Row({ leading, children, className }: { leading: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className="group/row flex items-center gap-3 pl-4">
      {leading}
      <div className={cn(ROW_BODY, className)}>{children}</div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Não deu para copiar", description: "Selecione o texto e copie manualmente." });
    }
  };
  return (
    <button type="button" onClick={copy} title={label} aria-label={copied ? "Copiado" : label} className={CIRCLE_BUTTON}>
      {copied ? (
        <Check className="h-[18px] w-[18px] text-ios-green" strokeWidth={2.75} aria-hidden="true" />
      ) : (
        <Copy className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </button>
  );
}

/** Abre o WhatsApp: no APK pelo navegador do sistema (como no compartilhamento de culto). */
async function openExternal(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank", "noopener");
}

const shortDate = (iso: string) => format(parseISO(iso), "dd/MM");
const dateTime = (iso: string) => format(parseISO(iso), "dd/MM 'às' HH:mm");
const fullDate = (iso: string) => format(parseISO(iso), "dd/MM/yyyy");
const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0];

/** Guia junto da ativação, com exemplos copiáveis e os mesmos comandos do assistente. */
function AssistantUsageGuide({ name, initiallyOpen }: { name: string; initiallyOpen: boolean }) {
  const weeklyMission = "toda sexta às 17h avisa que tem ensaio às 19h";
  const missionExamples = [
    { title: "Aviso diário", example: "todos os dias às 9h avisa que o repertório está no app" },
    { title: "Aviso uma vez", example: "agende para amanhã às 15h: tragam os cabos para o ensaio" },
    { title: "Consultar missões", example: "quais missões estão ativas?" },
    { title: "Alterar o horário", example: "mude a missão ABCD1234 para às 18h" },
    { title: "Pausar uma missão", example: "pause a missão ABCD1234" },
    { title: "Retomar uma missão", example: "retome a missão ABCD1234" },
    { title: "Cancelar uma missão", example: "cancele a missão ABCD1234" },
  ];

  const exampleRow = ({ title, example, description }: { title: string; example: string; description?: string }) => {
    const message = "@" + name + " " + example;
    return (
      <li key={title} className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-subhead font-semibold">{title}</p>
          {description && <p className="mt-0.5 text-footnote text-muted-foreground">{description}</p>}
          <p className="mt-1 break-words text-subhead leading-relaxed">{message}</p>
        </div>
        <CopyButton value={message} label={"Copiar exemplo: " + title} />
      </li>
    );
  };

  return (
    <section aria-labelledby="assistant-guide-title">
      <h3 id="assistant-guide-title" className={GROUP_LABEL}>3. Como usar no grupo</h3>
      <details open={initiallyOpen} className={cn(GROUP, "group/assistant-guide")}>
        <summary className="flex min-h-[64px] cursor-pointer list-none items-center gap-3 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <IconTile icon={BookOpen} />
          <span className="min-w-0 flex-1">
            <span className="block text-body">Guia do {name}</span>
            <span className="block text-footnote text-muted-foreground">Como funciona e exemplos para copiar</span>
          </span>
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-label-tertiary transition-transform group-open/assistant-guide:rotate-90" aria-hidden="true" />
        </summary>
        <div className="space-y-6 border-t border-separator px-4 py-4">
          <section aria-labelledby="assistant-guide-chat">
            <h4 id="assistant-guide-chat" className="text-callout font-semibold">Converse com o {name}</h4>
            <p className="mt-2 text-subhead leading-relaxed text-muted-foreground">
              Depois de ativar, marque o contato @{name} no grupo ou responda a uma mensagem dele.
              Ele consulta os dados desta equipe no +Louvor: cultos, escalas, músicas, tons e disponibilidade.
              Cada integrante também pode confirmar ou recusar a própria escala.
            </p>
            <p className="mt-2 text-subhead leading-relaxed text-muted-foreground">
              Também vale chamar para uma piada gospel, um trocadilho ou um desafio bíblico para a equipe.
              Para continuar a brincadeira, responda à mensagem dele ou marque o contato de novo.
            </p>
            <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">
              Para reconhecer cada pessoa, ele usa o telefone do cadastro ou o vínculo do WhatsApp em Ajustes › Meu usuário.
              Ali mesmo, cada pessoa escolhe se ele pode usar os dados dela; quem não permitir não é reconhecido.
            </p>
            <details className="group/assistant-examples mt-3 overflow-hidden rounded-xl border border-separator">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-subhead font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                Exemplos de perguntas e respostas
                <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary transition-transform group-open/assistant-examples:rotate-90" aria-hidden="true" />
              </summary>
              <ul className="divide-y divide-separator border-t border-separator">
                {ASSISTANT_CAPABILITIES.filter((capability) => capability.title !== "Missões do líder").map(exampleRow)}
              </ul>
            </details>
          </section>

          <section aria-labelledby="assistant-guide-notices">
            <h4 id="assistant-guide-notices" className="text-callout font-semibold">Receba os avisos do app</h4>
            <p className="mt-2 text-subhead leading-relaxed text-muted-foreground">
              Nos grupos conectados, o {name} avisa sobre novos cultos, mudanças de data e escala, atualizações do repertório
              e avisos enviados pelo líder no app. Quem foi escalado pode receber uma menção, conforme o WhatsApp vinculado ao cadastro.
            </p>
            <p className="mt-2 text-subhead leading-relaxed text-muted-foreground">
              O lembrete da véspera sai a partir das 18h, no horário de Brasília, para os cultos do dia seguinte.
              Os avisos chegam mesmo com o app fechado.
            </p>
            <blockquote className="mt-3 rounded-xl bg-fill-quaternary px-3 py-2.5 text-subhead leading-relaxed">
              <span className="mb-1 block text-caption1 font-medium text-muted-foreground">Exemplo de aviso de escala</span>
              @Filipe, eiii! Tu foi escalado para o Culto de Domingo. 🎶
            </blockquote>
            <p className="mt-3 text-footnote leading-relaxed text-muted-foreground">
              Escolha as categorias em Avisos automáticos, abaixo. Esses envios não gastam o limite de perguntas.
            </p>
          </section>

          <section aria-labelledby="assistant-guide-missions">
            <h4 id="assistant-guide-missions" className="text-callout font-semibold">Agende uma missão · somente líderes</h4>
            <p className="mt-2 text-subhead leading-relaxed text-muted-foreground">
              No grupo que deve receber o aviso, diga a mensagem e quando enviá-la. Pode ser uma única vez,
              todos os dias ou em dias da semana. Os horários são de Brasília.
            </p>
            <ul className="mt-3 overflow-hidden rounded-xl border border-separator">
              {exampleRow({ title: "Lembrar do ensaio toda sexta", example: weeklyMission })}
            </ul>
            <p className="mt-2 text-footnote leading-relaxed text-muted-foreground">
              Nesse exemplo, o aviso chega às 17h e o ensaio começa às 19h. Se faltar o horário do envio,
              o {name} pergunta antes de agendar. Confira o código e o próximo envio na resposta dele.
            </p>
            <details className="group/assistant-mission-examples mt-3 overflow-hidden rounded-xl border border-separator">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-subhead font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                Mais exemplos de missões
                <ChevronRight className="h-4 w-4 shrink-0 text-label-tertiary transition-transform group-open/assistant-mission-examples:rotate-90" aria-hidden="true" />
              </summary>
              <ul className="divide-y divide-separator border-t border-separator">
                {missionExamples.map(exampleRow)}
              </ul>
              <p className="border-t border-separator px-4 py-3 text-footnote leading-relaxed text-muted-foreground">
                ABCD1234 é um código de exemplo. Troque pelo código que o {name} informou ao criar a missão.
              </p>
            </details>
            <p className="mt-3 text-footnote leading-relaxed text-muted-foreground">
              Acompanhe, pause, retome ou cancele em Missões agendadas, abaixo. Para receber os envios,
              mantenha Avisos do líder ligado. A missão envia a mensagem que ficou salva para aquele grupo.
            </p>
          </section>
        </div>
      </details>
    </section>
  );
}

/**
 * Ajustes > Equipe: liga o assistente aos grupos do ministério, mostra o uso do
 * dia e guarda as instruções que o líder passa para ele. Só líderes veem.
 * Se o backend ainda não tiver a migração, a seção simplesmente não aparece.
 */
export function TeamAssistantSettings({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["assistant-overview", teamId];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: () => callRpc<AssistantOverview>("assistant_team_overview", { p_team_id: teamId }),
  });

  // null = sem edição (mostra o texto salvo).
  const [draft, setDraft] = useState<string | null>(null);
  const [savingInstructions, setSavingInstructions] = useState(false);
  const [generating, setGenerating] = useState(false);
  // Aviso de IA: qual diálogo está aberto e o que está em andamento.
  const [consentDialog, setConsentDialog] = useState<Extract<AssistantConsentVariant, "team-activate" | "team-confirm" | "team-review"> | null>(null);
  const [consentBusy, setConsentBusy] = useState<"accept" | "decline" | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  if (isError) return null;

  const name = data?.assistant_name ?? "Asafe";
  const maxChars = data?.instructions_max ?? DEFAULT_INSTRUCTIONS_MAX;
  const saved = data?.instructions ?? "";
  const instructions = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved.trim();
  const refresh = () => qc.invalidateQueries({ queryKey });
  // Ausente = banco ainda sem a migração do aviso: fluxo antigo, sem diálogo.
  const consent = data?.ai_consent;
  const needsDecision = consent?.state === "pending" || consent?.state === "blocked";
  // Código gerado antes do aceite não ativa mais (o banco recusa): não mostra.
  const pendingCode = !consent || consent.state === "granted" ? data?.pending_code ?? null : null;

  const generateCode = async () => {
    setGenerating(true);
    try {
      await callRpc("assistant_create_activation_code", { p_team_id: teamId });
      await refresh();
    } catch (error) {
      if (isConsentRequiredError(error)) setConsentDialog("team-activate");
      toast({ title: "Não foi possível gerar o código", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // O primeiro código só sai depois do aviso aceito (o banco também confere).
  const handleGenerateCode = () => {
    if (consent && consent.state !== "granted") setConsentDialog("team-activate");
    else void generateCode();
  };

  const handleAcceptConsent = async () => {
    const activating = consentDialog === "team-activate";
    setConsentBusy("accept");
    try {
      await giveAssistantConsent("team_activation", teamId);
      setConsentDialog(null);
      qc.invalidateQueries({ queryKey: CONSENT_PROMPTS_KEY });
      if (activating) await generateCode();
      else {
        toast({ title: "Uso de IA confirmado", description: `O ${name} continua ativo nos grupos da equipe.` });
        await refresh();
      }
    } catch (error) {
      toast({ title: "Não foi possível registrar o aceite", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setConsentBusy(null);
    }
  };

  // Recusar/revogar pela equipe: o banco desliga o assistente em todos os grupos.
  const handleRevokeConsent = async () => {
    setConsentBusy("decline");
    try {
      await revokeAssistantConsent("team_activation", teamId);
      setConsentDialog(null);
      setDeactivateOpen(false);
      qc.invalidateQueries({ queryKey: CONSENT_PROMPTS_KEY });
      toast({ title: `${name} desativado`, description: "Ele não responde nem envia avisos nos grupos desta equipe." });
      await refresh();
    } catch (error) {
      toast({ title: "Não foi possível desativar", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setConsentBusy(null);
    }
  };

  const handleDisconnect = async (groupId: string) => {
    try {
      await callRpc("assistant_deactivate_group", { p_group_id: groupId });
      toast({ title: "Grupo desconectado", description: `O ${name} não responde nem envia avisos nesse grupo.` });
      await refresh();
    } catch (error) {
      toast({ title: "Não foi possível desconectar", description: errorMessage(error), variant: "destructive" });
    }
  };

  const handleSaveInstructions = async () => {
    const text = instructions.trim();
    setSavingInstructions(true);
    try {
      await callRpc("assistant_update_instructions", { p_team_id: teamId, p_instructions: text });
      qc.setQueryData<AssistantOverview>(queryKey, (old) => (old ? { ...old, instructions: text } : old));
      setDraft(null);
      toast({ title: "Instruções salvas", description: `O ${name} já usa o texto novo nas próximas respostas.` });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: errorMessage(error), variant: "destructive" });
    } finally {
      setSavingInstructions(false);
    }
  };

  const usage = data?.usage;
  const teamLimit = usage?.team_limit ?? null;

  return (
    <section data-testid="team-assistant-settings" aria-labelledby="team-assistant-title" className="space-y-7">
      <div className="mx-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 id="team-assistant-title" className="text-title3 text-foreground">
            Assistente no WhatsApp
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full bg-fill-tertiary px-2 py-0.5 text-caption1 font-semibold text-muted-foreground">
            <ShieldCheck className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" /> Somente líderes
          </span>
        </div>
        <p className="mt-1 max-w-xl text-subhead text-muted-foreground">
          O {name} entra no grupo do ministério e responde quando alguém marca @{name}: escalas, repertório, tons,
          disponibilidade e os combinados do ministério.
          Também leva os avisos do app ao grupo e cumpre as missões agendadas pelo líder.
        </p>
      </div>

      {isLoading || !data ? (
        <div className={cn(GROUP, "h-[104px] animate-pulse")} aria-label="Carregando" />
      ) : !data.platform_enabled ? (
        <div>
          <div className={GROUP}>
            <Row leading={<IconTile icon={Bot} />}>
              <span className="min-w-0 flex-1">
                <span className="block text-body">Em breve</span>
                <span className="block text-footnote text-muted-foreground">
                  O número do assistente ainda está sendo preparado.
                </span>
              </span>
            </Row>
          </div>
          <p className={GROUP_FOOTER}>Você já pode escrever as instruções do ministério abaixo.</p>
        </div>
      ) : needsDecision ? (
        // Equipe que já usava o assistente antes do aviso: só segue com uma decisão.
        <section aria-labelledby="assistant-consent-pending-title" className={cn(GROUP, "px-4 py-4")}>
          <div className="flex items-start gap-3">
            <IconTile icon={TriangleAlert} className="bg-ios-orange text-white" />
            <div className="min-w-0 flex-1">
              <h3 id="assistant-consent-pending-title" className="text-body font-semibold">
                Confirme o uso de IA da OpenAI
              </h3>
              <p className="mt-1 text-subhead leading-relaxed text-muted-foreground">
                {consent?.state === "blocked"
                  ? `O ${name} está em pausa nesta equipe até um líder confirmar. `
                  : `O ${name} está ativo em ${data.groups.length === 1 ? "1 grupo" : `${data.groups.length} grupos`} desta equipe. `}
                As respostas dele são geradas pela {ASSISTANT_AI_PROVIDER} com mensagens e dados da equipe.
                Revise o aviso e confirme, ou desative o {name}.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button className="w-full" onClick={() => setConsentDialog("team-confirm")} disabled={consentBusy !== null}>
              Revisar e confirmar
            </Button>
            <Button variant="ghost" className="w-full text-ios-red" onClick={() => setDeactivateOpen(true)} disabled={consentBusy !== null}>
              Desativar o {name}
            </Button>
          </div>
        </section>
      ) : (
        <>
          {!data.team_enabled && (
            <div className={GROUP} role="status">
              <Row leading={<IconTile icon={TriangleAlert} className="bg-ios-red text-white" />}>
                <span className="min-w-0 flex-1">
                  <span className="block text-body">Assistente suspenso nesta equipe</span>
                  <span className="block text-footnote text-muted-foreground">Fale com o suporte do +Louvor.</span>
                </span>
              </Row>
            </div>
          )}

          {/* 1. Número */}
          <section aria-labelledby="assistant-number-title">
            <h3 id="assistant-number-title" className={GROUP_LABEL}>1. Adicione este número ao grupo</h3>
            <div className={GROUP}>
              <Row leading={<IconTile icon={Bot} />} className="gap-2 pr-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{name}</span>
                  <span className="block truncate text-subhead tabular-nums text-muted-foreground">
                    {formatWhatsAppNumber(data.bot_phone) || "Número não configurado"}
                  </span>
                </span>
                {data.bot_phone && <CopyButton value={formatWhatsAppNumber(data.bot_phone)} label="Copiar número" />}
              </Row>
            </div>
            <p className={GROUP_FOOTER}>Salve o contato como “{name}” e adicione-o ao grupo do ministério.</p>
          </section>

          {/* 2. Código de ativação */}
          <section aria-labelledby="assistant-code-title">
            <h3 id="assistant-code-title" className={GROUP_LABEL}>2. Ative no grupo</h3>
            <div className={GROUP}>
              {pendingCode ? (
                <Row leading={<IconTile icon={Link2} />} className="gap-2 py-2.5 pr-2">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-mono text-body">
                      {activationMessage(name, pendingCode.code)}
                    </span>
                    <span className="block text-footnote text-muted-foreground">
                      Vale uma vez, até {dateTime(pendingCode.expires_at)}.
                    </span>
                  </span>
                  <CopyButton value={activationMessage(name, pendingCode.code)} label="Copiar mensagem" />
                </Row>
              ) : null}
              <button
                type="button"
                onClick={handleGenerateCode}
                disabled={generating}
                className="group/row flex w-full items-center gap-3 pl-4 text-left transition-colors active:bg-fill-quaternary disabled:opacity-60"
              >
                <IconTile icon={generating ? Loader2 : KeyRound} className={generating ? "[&>svg]:animate-spin" : undefined} />
                <span className={ROW_BODY}>
                  <span className="min-w-0 flex-1 text-body text-primary">
                    {pendingCode ? "Gerar outro código" : "Gerar código de ativação"}
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                </span>
              </button>
            </div>
            <p className={GROUP_FOOTER}>
              {data.team_enabled
                ? `Mande a mensagem no grupo marcando o @${name}. Ele se apresenta e lista tudo o que sabe fazer.`
                : `Com o ${name} suspenso nesta equipe, o código não ativa nenhum grupo.`}
              {consent && consent.state !== "granted" && ` Antes do primeiro código, você lê e aceita o aviso sobre o uso de IA da ${ASSISTANT_AI_PROVIDER}.`}
            </p>
          </section>

          <AssistantUsageGuide name={name} initiallyOpen={data.groups.length === 0 || Boolean(pendingCode)} />

          {/* Grupos conectados */}
          <section aria-labelledby="assistant-groups-title">
            <h3 id="assistant-groups-title" className={GROUP_LABEL}>Grupos conectados</h3>
            <div className={GROUP}>
              {data.groups.length === 0 ? (
                <Row leading={<IconTile icon={Users} />}>
                  <span className="text-body text-muted-foreground">Nenhum grupo ainda</span>
                </Row>
              ) : (
                data.groups.map((group) => (
                  <Row key={group.id} leading={<IconTile icon={Users} />} className="gap-2 py-2 pr-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body">{group.name || "Grupo sem nome"}</span>
                      <span className="block truncate text-footnote text-muted-foreground">
                        Desde {shortDate(group.activated_at)}
                        {group.activated_by ? ` · por ${group.activated_by.trim().split(/\s+/)[0]}` : ""}
                      </span>
                    </span>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="h-11 shrink-0 rounded-full px-3 text-subhead font-medium text-ios-red transition-colors hover:bg-ios-red/10"
                        >
                          Desconectar
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Desconectar este grupo?</AlertDialogTitle>
                          <AlertDialogDescription>
                            O {name} para de responder e enviar avisos em “{group.name || "Grupo sem nome"}”. Para voltar, gere um novo código.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDisconnect(group.id)}>Desconectar</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </Row>
                ))
              )}
            </div>
          </section>

          {/* Uso do dia */}
          <section aria-labelledby="assistant-usage-title">
            <h3 id="assistant-usage-title" className={GROUP_LABEL}>Uso de hoje</h3>
            <div className={cn(GROUP, "px-4 py-3")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-body">Perguntas da equipe</span>
                <span className="shrink-0 text-subhead tabular-nums text-muted-foreground">
                  {teamLimit === null ? `${usage?.today ?? 0} · sem limite` : `${usage?.today ?? 0} de ${teamLimit}`}
                </span>
              </div>
              {teamLimit !== null && (
                <Progress
                  value={teamLimit > 0 ? Math.min(100, ((usage?.today ?? 0) / teamLimit) * 100) : 100}
                  className="mt-2.5"
                  aria-label="Perguntas usadas hoje"
                />
              )}
            </div>
            <p className={GROUP_FOOTER}>
              {usage?.member_limit != null ? `Cada pessoa pode fazer até ${usage.member_limit} perguntas por dia. ` : ""}
              A contagem recomeça à meia-noite. Ajuda e ativação não contam.
            </p>
          </section>

          {/* Privacidade e IA: aceite do líder e revogação */}
          {consent?.state === "granted" && (
            <section aria-labelledby="assistant-privacy-title">
              <h3 id="assistant-privacy-title" className={GROUP_LABEL}>Privacidade e IA</h3>
              <div className={GROUP}>
                <Row leading={<IconTile icon={ShieldCheck} />}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body">IA da {ASSISTANT_AI_PROVIDER}</span>
                    <span className="block text-footnote text-muted-foreground">
                      Autorizada
                      {consent.accepted_at ? ` em ${fullDate(consent.accepted_at)}` : ""}
                      {consent.accepted_by ? ` por ${firstName(consent.accepted_by)}` : ""}
                    </span>
                  </span>
                </Row>
                <button type="button" onClick={() => setConsentDialog("team-review")} className={ROW_BUTTON}>
                  <IconTile icon={FileText} />
                  <span className={ROW_BODY}>
                    <span className="min-w-0 flex-1 text-body">Ver o aviso de privacidade</span>
                    <ChevronRight className="h-[18px] w-[18px] text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                  </span>
                </button>
                <button type="button" onClick={() => setDeactivateOpen(true)} disabled={consentBusy !== null} className={ROW_BUTTON}>
                  <IconTile icon={PowerOff} />
                  <span className={ROW_BODY}>
                    <span className="min-w-0 flex-1 text-body text-ios-red">Revogar e desativar o {name}</span>
                  </span>
                </button>
              </div>
              <p className={GROUP_FOOTER}>
                Cada pessoa escolhe em Ajustes › Meu usuário se o {name} pode usar os dados dela. Revogar desliga o {name} em
                todos os grupos desta equipe; para voltar, aceite o aviso de novo e gere outro código.
              </p>
            </section>
          )}
        </>
      )}

      {/* Instruções do ministério */}
      {data && (
        <section aria-labelledby="assistant-instructions-title">
          <h3 id="assistant-instructions-title" className={GROUP_LABEL}>Instruções do ministério</h3>
          <div className={cn(GROUP, "p-3")}>
            <label htmlFor="assistant-instructions" className="sr-only">
              Instruções do ministério para o {name}
            </label>
            <Textarea
              id="assistant-instructions"
              value={instructions}
              onChange={(e) => setDraft(e.target.value.slice(0, maxChars))}
              placeholder={INSTRUCTIONS_PLACEHOLDER}
              rows={6}
              className="min-h-[148px]"
            />
            <div className="mt-2.5 flex items-center justify-between gap-3 pl-1">
              <span className="text-footnote tabular-nums text-muted-foreground">
                {instructions.length}/{maxChars}
              </span>
              <Button
                className="h-11 shrink-0 rounded-full px-5 text-body font-semibold"
                onClick={handleSaveInstructions}
                disabled={!dirty || savingInstructions}
              >
                {savingInstructions && <Loader2 className="animate-spin" aria-hidden="true" />}
                Salvar instruções
              </Button>
            </div>
          </div>
          <p className={GROUP_FOOTER}>
            Horário e local do ensaio, combinados, roupa… O {name} usa este texto para responder a equipe. Qualquer pessoa
            do grupo pode perguntar: não coloque senhas nem dados pessoais.
            Para enviar um aviso em horário marcado, crie uma missão no grupo; salvar este texto orienta as respostas.
          </p>
        </section>
      )}

      {data?.platform_enabled && !needsDecision && <AutomaticNoticeSettings key={teamId} teamId={teamId} disabled={!data.team_enabled} />}
      {data?.platform_enabled && !needsDecision && <AssistantMissions key={`missions-${teamId}`} teamId={teamId} name={name} disabled={!data.team_enabled} />}

      {consent && (
        <AssistantAiConsentDialog
          open={consentDialog !== null}
          variant={consentDialog ?? "team-review"}
          assistantName={name}
          groups={data?.groups.length ?? 0}
          busy={consentBusy}
          blocking={false}
          onAccept={handleAcceptConsent}
          onDecline={consentDialog === "team-confirm" ? () => { setConsentDialog(null); setDeactivateOpen(true); } : () => setConsentDialog(null)}
          onClose={() => setConsentDialog(null)}
        />
      )}
      <AssistantDeclineConfirm
        open={deactivateOpen}
        kind="team"
        assistantName={name}
        groups={data?.groups.length ?? 0}
        busy={consentBusy !== null}
        onConfirm={() => void handleRevokeConsent()}
        onCancel={() => setDeactivateOpen(false)}
      />

    </section>
  );
}

function AutomaticNoticeSettings({ teamId, disabled }: { teamId: string; disabled: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["assistant-notifications", teamId];
  const [saving, setSaving] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey,
    queryFn: () => callRpc<NotificationSettings>("assistant_notification_settings", { p_team_id: teamId }),
    retry: false,
  });
  // Compatível com backend anterior durante a publicação.
  if (!data) return null;
  const save = async (key: keyof NotificationSettings, enabled: boolean) => {
    setSaving(key);
    try {
      const updated = await callRpc<NotificationSettings>("assistant_set_notification", {
        p_team_id: teamId, p_kind: key, p_enabled: enabled,
      });
      qc.setQueryData(queryKey, updated);
      toast({ title: enabled ? "Aviso automático ativado" : "Aviso automático desativado" });
    } catch (error) {
      toast({ title: "Não foi possível salvar", description: errorMessage(error), variant: "destructive" });
    } finally { setSaving(null); }
  };
  return (
    <section aria-labelledby="assistant-notifications-title">
      <h3 id="assistant-notifications-title" className={GROUP_LABEL}>Avisos automáticos</h3>
      <div className={GROUP}>
        {NOTIFICATION_OPTIONS.map((option) => (
          <Row key={option.key} leading={<IconTile icon={MessageCircle} />}>
            <span className="min-w-0 flex-1">
              <span className="block text-body" id={`notice-${option.key}`}>{option.title}</span>
              <span className="block text-footnote text-muted-foreground" id={`notice-${option.key}-description`}>{option.description}</span>
            </span>
            <Switch checked={data[option.key]} disabled={disabled || saving !== null}
              aria-labelledby={`notice-${option.key}`} aria-describedby={`notice-${option.key}-description`}
              onCheckedChange={(enabled) => save(option.key, enabled)} />
          </Row>
        ))}
      </div>
      <p className={GROUP_FOOTER}>
        Vale para os grupos conectados desta equipe. As mudanças são agrupadas por alguns instantes antes do envio.
        As menções usam o WhatsApp vinculado ao cadastro. Os avisos não gastam o limite de perguntas.
      </p>
    </section>
  );
}

/**
 * Ajustes > Meu usuário: o assistente reconhece a pessoa pelo telefone do
 * cadastro. Quando o WhatsApp esconde o número, um código mandado NO PRIVADO do
 * assistente liga o WhatsApp dela; dá para desfazer se não tiver sido ela.
 */
export function MyAssistantSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Aviso de IA: "member" ao ligar o uso dos dados, "member-link" antes do código de vínculo.
  const [consentDialog, setConsentDialog] = useState<Extract<AssistantConsentVariant, "member" | "member-link" | "member-review"> | null>(null);
  const [consentBusy, setConsentBusy] = useState<"accept" | "decline" | null>(null);
  const [optOutOpen, setOptOutOpen] = useState(false);

  const { data, isError } = useQuery({
    queryKey: ["assistant-my-status"],
    queryFn: () => callRpc<AssistantMyStatus>("assistant_my_status"),
  });

  if (isError || !data?.enabled) return null;
  const name = data.assistant_name;
  const chatLink = code ? whatsAppLink(data.bot_phone, linkMessage(code.code)) : null;
  // Ausente = banco ainda sem a migração do aviso: fluxo antigo, sem diálogo.
  const consent = data.ai_consent;
  const optedOut = consent?.state === "opted_out";
  const granted = consent?.state === "granted";
  // Reconhecida hoje só pela tolerância de quem já usava: ainda precisa decidir.
  const legacy = Boolean(consent && !granted && !optedOut && consent.allowed);
  const until = graceUntilLabel(consent?.grace_until);

  const status = optedOut
    ? { label: "Desligado", className: "text-muted-foreground" }
    : consent && !consent.allowed
      ? { label: "Falta autorizar", className: "text-ios-orange" }
      : legacy
        ? { label: "Falta decidir", className: "text-ios-orange" }
        : data.linked
          ? { label: "Reconhece você", className: "text-ios-green" }
          : data.has_phone
            ? { label: "Pelo seu telefone", className: "text-muted-foreground" }
            : { label: "Cadastre seu telefone", className: "text-ios-orange" };

  const consentStatus = !consent
    ? null
    : granted
      ? `Autorizado${consent.accepted_at ? ` em ${fullDate(consent.accepted_at)}` : ""}. A IA da OpenAI responde suas perguntas no grupo.`
      : optedOut
        ? `Desligado: o ${name} não reconhece você nem usa seus dados nas respostas.`
        : legacy
          ? `Você ainda não decidiu. Como sua equipe já usava o ${name}, ele ainda reconhece você pelo telefone${until ? ` ${until}` : ""}. Ligue para permitir ou toque em Não permitir.`
          : `Não autorizado. O ${name} só reconhece você no grupo depois que você permitir.`;

  const refreshStatus = async () => {
    qc.invalidateQueries({ queryKey: CONSENT_PROMPTS_KEY });
    await qc.invalidateQueries({ queryKey: ["assistant-my-status"] });
  };

  const generateLinkCode = async () => {
    setBusy(true);
    try {
      setCode(await callRpc<{ code: string; expires_at: string }>("assistant_create_link_code"));
    } catch (error) {
      if (isConsentRequiredError(error)) setConsentDialog("member-link");
      toast({ title: "Não foi possível gerar o código", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // Vincular por código pede o aceite antes (o banco também confere).
  const handleGenerate = () => {
    if (consent && consent.state !== "granted") setConsentDialog("member-link");
    else void generateLinkCode();
  };

  const handleAcceptConsent = async () => {
    const linking = consentDialog === "member-link";
    setConsentBusy("accept");
    try {
      await giveAssistantConsent("member_link");
      setConsentDialog(null);
      await refreshStatus();
      if (linking) await generateLinkCode();
      else toast({ title: "Uso dos dados permitido", description: `O ${name} reconhece você nos grupos da equipe.` });
    } catch (error) {
      toast({ title: "Não foi possível registrar o aceite", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setConsentBusy(null);
    }
  };

  const handleOptOut = async () => {
    setConsentBusy("decline");
    try {
      await revokeAssistantConsent("member_link");
      setCode(null);
      setOptOutOpen(false);
      toast({ title: "Uso dos dados desligado", description: `O ${name} não reconhece mais você no grupo.` });
      await refreshStatus();
    } catch (error) {
      toast({ title: "Não foi possível desligar", description: consentErrorMessage(error), variant: "destructive" });
    } finally {
      setConsentBusy(null);
    }
  };

  const handleUnlink = async () => {
    setBusy(true);
    try {
      await callRpc("assistant_unlink_me");
      setCode(null);
      toast({ title: "WhatsApp desvinculado", description: `O ${name} volta a reconhecer você só pelo telefone do cadastro.` });
      await qc.invalidateQueries({ queryKey: ["assistant-my-status"] });
    } catch (error) {
      toast({ title: "Não foi possível desvincular", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="settings-assistant">
      <h2 id="settings-assistant" className={GROUP_LABEL}>Assistente no WhatsApp</h2>
      <div className={GROUP}>
        <Row leading={<IconTile icon={Bot} />}>
          <span className="min-w-0 flex-1 text-body">{name}</span>
          <span className={cn("shrink-0 text-subhead", status.className)}>{status.label}</span>
        </Row>

        {consent && (
          <Row leading={<IconTile icon={ShieldCheck} />} className="py-2.5">
            <span className="min-w-0 flex-1">
              <span id="assistant-allow-label" className="block text-body">Permitir que o {name} use meus dados</span>
              <span id="assistant-allow-status" className="block text-footnote text-muted-foreground">{consentStatus}</span>
            </span>
            <Switch
              checked={granted}
              disabled={consentBusy !== null}
              aria-labelledby="assistant-allow-label"
              aria-describedby="assistant-allow-status"
              onCheckedChange={(on) => (on ? setConsentDialog("member") : setOptOutOpen(true))}
            />
          </Row>
        )}

        {legacy && (
          <button type="button" onClick={() => setOptOutOpen(true)} disabled={consentBusy !== null} className={ROW_BUTTON}>
            <IconTile icon={PowerOff} />
            <span className={ROW_BODY}>
              <span className="min-w-0 flex-1 text-body text-ios-red">Não permitir</span>
            </span>
          </button>
        )}

        {code ? (
          <Row leading={<IconTile icon={Link2} />} className="gap-2 py-2.5 pr-2">
            <span className="min-w-0 flex-1">
              <span className="block break-words font-mono text-body">{linkMessage(code.code)}</span>
              <span className="block text-footnote text-muted-foreground">
                Mande no privado do {name}, não no grupo. Vale até {dateTime(code.expires_at)}.
              </span>
            </span>
            {chatLink ? (
              <button
                type="button"
                onClick={() => openExternal(chatLink)}
                className="h-11 shrink-0 rounded-full bg-prominent px-4 text-subhead font-semibold text-prominent-foreground transition-transform active:scale-[0.97]"
              >
                Abrir conversa
              </button>
            ) : (
              <CopyButton value={linkMessage(code.code)} label="Copiar mensagem" />
            )}
          </Row>
        ) : (
          <button type="button" onClick={handleGenerate} disabled={busy} className={ROW_BUTTON}>
            <IconTile icon={busy ? Loader2 : MessageCircle} className={busy ? "[&>svg]:animate-spin" : undefined} />
            <span className={ROW_BODY}>
              <span className="min-w-0 flex-1 text-body text-primary">
                {data.linked ? "Vincular outro WhatsApp" : "O WhatsApp esconde meu número"}
              </span>
              <ChevronRight className="h-[18px] w-[18px] text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
            </span>
          </button>
        )}

        {data.linked && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" disabled={busy} className={ROW_BUTTON}>
                <IconTile icon={Unlink} />
                <span className={ROW_BODY}>
                  <span className="min-w-0 flex-1 text-body text-ios-red">Desvincular meu WhatsApp</span>
                </span>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desvincular o WhatsApp?</AlertDialogTitle>
                <AlertDialogDescription>
                  O {name} esquece os WhatsApps ligados ao seu perfil e volta a reconhecer você só pelo telefone do cadastro.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleUnlink}>Desvincular</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <p className={GROUP_FOOTER}>
        No grupo do ministério, marque @{name} e pergunte sua escala, o repertório ou o tom de uma música. Ele reconhece
        você pelo telefone acima. Se o WhatsApp esconder seu número, use o código: ele abre uma conversa privada com o {name}.
        {consent && ` As respostas são geradas pela IA da ${ASSISTANT_AI_PROVIDER}. `}
        {consent && (
          <button type="button" onClick={() => setConsentDialog("member-review")} className="font-medium text-primary underline-offset-2 hover:underline">
            Ver o aviso de privacidade
          </button>
        )}
      </p>

      {consent && (
        <AssistantAiConsentDialog
          open={consentDialog !== null}
          variant={consentDialog ?? "member-review"}
          assistantName={name}
          legacy={legacy}
          graceUntil={consent.grace_until ?? null}
          busy={consentBusy}
          onAccept={handleAcceptConsent}
          onDecline={() => setConsentDialog(null)}
          onClose={() => setConsentDialog(null)}
        />
      )}
      <AssistantDeclineConfirm
        open={optOutOpen}
        kind="member"
        firstDecision={!granted}
        assistantName={name}
        busy={consentBusy !== null}
        onConfirm={() => void handleOptOut()}
        onCancel={() => setOptOutOpen(false)}
      />
    </section>
  );
}
