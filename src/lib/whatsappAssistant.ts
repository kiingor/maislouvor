// Assistente do +Louvor no WhatsApp: tipos das RPCs e textos usados em Ajustes.
//
// A lista do que o assistente faz vem do próprio código da edge function, para
// a tela e as mensagens no grupo nunca divergirem.
export { ASSISTANT_CAPABILITIES, type AssistantCapability } from "../../supabase/functions/whatsapp-assistant/capabilities.ts";
export { NOTIFICATION_OPTIONS, type NotificationSettings } from "../../supabase/functions/whatsapp-assistant/notification-options.ts";
// Aviso de IA (OpenAI) e consentimento: versão do texto e chamadas em ./assistantAiConsent.
import type { MemberAiConsent, TeamAiConsent } from "./assistantAiConsent";

export const DEFAULT_INSTRUCTIONS_MAX = 2000;

/** assistant_team_overview (Usuário > Asafe, só líder). */
export interface AssistantOverview {
  platform_enabled: boolean;
  team_enabled: boolean;
  assistant_name: string;
  bot_phone: string | null;
  instructions: string;
  instructions_max: number;
  usage: { today: number; team_limit: number | null; member_limit: number | null };
  groups: { id: string; name: string | null; activated_at: string; activated_by: string | null }[];
  pending_code: { code: string; expires_at: string } | null;
  /** Ausente enquanto o banco não tiver a migração do aviso de IA (fluxo antigo). */
  ai_consent?: TeamAiConsent;
}

/** assistant_my_status (Usuário > Asafe). */
export interface AssistantMyStatus {
  enabled: boolean;
  assistant_name: string;
  bot_phone: string | null;
  has_phone: boolean;
  linked: boolean;
  /** Ausente enquanto o banco não tiver a migração do aviso de IA (fluxo antigo). */
  ai_consent?: MemberAiConsent;
}

/** "5511955554444" -> "+55 (11) 95555-4444". Fora do Brasil: "+" e os dígitos. */
export function formatWhatsAppNumber(value: string | null | undefined): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const br = digits.match(/^55(\d{2})(9?\d{4})(\d{4})$/);
  if (br) return `+55 (${br[1]}) ${br[2]}-${br[3]}`;
  return `+${digits}`;
}

/** Mensagem que o líder manda no grupo para ligar o grupo à equipe. */
export function activationMessage(assistantName: string, code: string): string {
  return `@${assistantName} ativar ${code}`;
}

/**
 * Mensagem que a pessoa manda NO PRIVADO do assistente quando o WhatsApp esconde
 * o número dela. Num grupo o código fica público e o assistente o invalida.
 */
export function linkMessage(code: string): string {
  return `vincular ${code}`;
}

/** wa.me: abre a conversa privada com o assistente, opcionalmente com o texto pronto. */
export function whatsAppLink(value: string | null | undefined, text?: string): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
