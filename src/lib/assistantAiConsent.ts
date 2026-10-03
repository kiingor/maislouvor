// Aviso de IA de terceiros do assistente no WhatsApp (App Store 5.1.2(i) e LGPD):
// a versão do texto, o que é enviado à OpenAI e as chamadas ao banco.
//
// Mudou o texto do aviso? Troque ASSISTANT_AI_CONSENT_VERSION E crie uma
// migração com a mesma data em assistant_ai_consent_version(): o banco recusa
// aceites de outra versão, e quem aceitou o texto anterior volta a ver o aviso.
import { Capacitor } from "@capacitor/core";
import { assistantConsentSupabase } from "@/integrations/supabase/assistant-consent-client";
import type { AssistantConsentScope } from "@/integrations/supabase/assistant-consent-types";
import { appOrigin } from "@/lib/appUrl";
import {
  ASAFE_AI_PROVIDER,
  ASAFE_HISTORY_RETENTION_DAYS,
  ASAFE_PROVIDER_RETENTION,
  LEGAL_PATHS,
} from "@/lib/legal";

export type { AssistantConsentScope };

export const ASSISTANT_AI_CONSENT_VERSION = "2026-10-03";

/** Provedor de IA do assistente no WhatsApp (o mesmo citado na Política de Privacidade, src/lib/legal.ts). */
export const ASSISTANT_AI_PROVIDER = ASAFE_AI_PROVIDER;

/** Página pública da política (rota fora de /app, sem login). */
export const PRIVACY_PATH = LEGAL_PATHS.privacy;

/**
 * Retenção. O +Louvor apaga assistant_messages depois do prazo de
 * assistant_purge. A chamada à OpenAI vai com store: false; a frase sobre a
 * política da API da OpenAI fica em src/lib/legal.ts (a mesma da Política de
 * Privacidade) e precisa ser conferida pelo jurídico a cada versão.
 */
export const ASSISTANT_AI_RETENTION = {
  app: `O +Louvor guarda as perguntas e respostas do assistente por ${ASAFE_HISTORY_RETENTION_DAYS} dias (histórico curto e auditoria) e depois apaga.`,
  provider: ASAFE_PROVIDER_RETENTION,
} as const;

/** O que vai para a OpenAI quando alguém chama o assistente. */
export function assistantAiDataSent(name: string): { title: string; detail: string }[] {
  return [
    { title: `Mensagens enviadas ao ${name}`, detail: "o que é escrito ao marcar o assistente nos grupos conectados (e o texto de uma mensagem respondida ao chamá-lo)" },
    { title: "Nome e função na equipe", detail: "de quem pergunta e das pessoas das escalas que permitem o uso dos dados (quem não permite aparece sem nome)" },
    { title: "Escalas e disponibilidade", detail: "cultos, funções, confirmações e dias marcados, sem o motivo das ausências" },
    { title: "Repertório", detail: "músicas, tons, BPM, links e o roteiro dos cultos" },
  ];
}

/** Telefone e WhatsApp ficam no +Louvor: servem só para saber quem está falando. */
export const ASSISTANT_AI_LOCAL_DATA =
  "Usados pelo +Louvor só para identificar quem está falando. Não são enviados à OpenAI.";

export const ASSISTANT_AI_PURPOSE =
  "Gerar as respostas e executar as ações que a própria pessoa pedir, como confirmar a escala ou marcar disponibilidade.";

/** Fim da tolerância de quem já usava (assistant_config.ai_consent_required_from) -> "até 02/11/2026". */
export function graceUntilLabel(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `até ${date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
}

/** "2026-10-03" -> "03/10/2026" */
export function consentVersionLabel(version: string = ASSISTANT_AI_CONSENT_VERSION): string {
  const [y, m, d] = version.split("-");
  return d && m && y ? `${d}/${m}/${y}` : version;
}

/** Ajustes > Equipe (assistant_team_overview.ai_consent). */
export interface TeamAiConsent {
  /** granted = aceito na versão atual; pending = ativo sem o aceite (equipe que já usava); blocked = pending após o prazo da plataforma. */
  state: "granted" | "pending" | "blocked" | "none";
  current_version: string;
  version: string | null;
  accepted_at: string | null;
  accepted_by: string | null;
}

/** Ajustes > Meu usuário (assistant_my_status.ai_consent). */
export interface MemberAiConsent {
  /** granted = permitiu na versão atual; pending = ainda não decidiu; opted_out = não permitiu ou desligou. */
  state: "granted" | "pending" | "opted_out";
  /** O assistente reconhece a pessoa e usa os dados dela hoje? */
  allowed: boolean;
  /**
   * Reconhecida hoje só pela tolerância de quem já usava o assistente antes do
   * aviso (ou aceitou um texto anterior), até decidir ou até grace_until.
   * Ausente em bancos anteriores à correção: tratar como false.
   */
  legacy?: boolean;
  grace_until?: string | null;
  accepted_at: string | null;
  current_version: string;
}

/** Chave da consulta do aviso ao abrir o app (AssistantConsentGate); refeita depois de cada decisão. */
export const ASSISTANT_CONSENT_PROMPTS_KEY = ["assistant-consent-prompts"] as const;

/** assistant_consent_prompts: o que mostrar ao abrir o app. */
export interface AssistantConsentPrompts {
  version: string;
  assistant_name: string;
  teams: { team_id: string; team_name: string; state: "pending" | "blocked"; groups: number }[];
  member_notice: boolean;
  /** Ainda reconhecida pela tolerância de quem já usava (o aviso diz que nada muda até decidir). */
  member_legacy?: boolean;
  grace_until?: string | null;
}

const MESSAGES: Record<string, string> = {
  outdated_version: "O aviso mudou. Atualize o app para ler a versão mais recente.",
  consent_required: "Aceite o aviso sobre a IA antes de continuar.",
  forbidden: "Só um líder da equipe pode fazer isso.",
};

/** Erro do banco -> frase para o toast. */
export function consentErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const key = Object.keys(MESSAGES).find((k) => message.includes(k));
  return key ? MESSAGES[key] : message;
}

export const isConsentRequiredError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).includes("consent_required");

export async function giveAssistantConsent(scope: AssistantConsentScope, teamId: string | null = null) {
  const { data, error } = await assistantConsentSupabase.rpc("give_assistant_consent", {
    p_scope: scope,
    p_team_id: teamId,
    p_version: ASSISTANT_AI_CONSENT_VERSION,
  });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; state: string; version: string };
}

export async function revokeAssistantConsent(scope: AssistantConsentScope, teamId: string | null = null) {
  const { data, error } = await assistantConsentSupabase.rpc("revoke_assistant_consent", { p_scope: scope, p_team_id: teamId });
  if (error) throw new Error(error.message);
  return data as { ok: boolean; state: string; groups_deactivated?: number; removed?: number };
}

export async function fetchConsentPrompts(): Promise<AssistantConsentPrompts> {
  const { data, error } = await assistantConsentSupabase.rpc("assistant_consent_prompts");
  if (error) throw new Error(error.message);
  return data as unknown as AssistantConsentPrompts;
}

/** Política de privacidade: no APK abre o site no navegador do sistema (a webview roda em localhost). */
export function privacyPolicyUrl(): string {
  return `${appOrigin()}${PRIVACY_PATH}`;
}

export async function openPrivacyPolicy(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: privacyPolicyUrl() });
    return;
  }
  window.open(PRIVACY_PATH, "_blank", "noopener");
}
