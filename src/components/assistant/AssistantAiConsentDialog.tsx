import { useId, type ReactNode } from "react";
import { CalendarDays, Clock, ExternalLink, Globe, Loader2, MessageCircle, Music, Phone, ShieldCheck, Target, Undo2, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ASSISTANT_AI_LOCAL_DATA,
  ASSISTANT_AI_PROVIDER,
  ASSISTANT_AI_PURPOSE,
  ASSISTANT_AI_RETENTION,
  assistantAiDataSent,
  consentVersionLabel,
  graceUntilLabel,
  openPrivacyPolicy,
  privacyPolicyUrl,
} from "@/lib/assistantAiConsent";

/**
 * team-activate .. líder, antes do primeiro código de ativação;
 * team-confirm ... líder de equipe que já usava o assistente: confirma ou desativa
 *                  (ao abrir o app, só sai com uma escolha);
 * member ......... pessoa liga "Permitir que o Asafe use meus dados";
 * member-link .... pessoa vai vincular o WhatsApp por código;
 * member-notice .. aviso único ao abrir o app (permitir ou não permitir);
 * team-review / member-review .. só leitura.
 */
export type AssistantConsentVariant =
  | "team-activate" | "team-confirm" | "team-review"
  | "member" | "member-link" | "member-notice" | "member-review";

interface Props {
  open: boolean;
  variant: AssistantConsentVariant;
  assistantName?: string;
  /** team-confirm: equipe e quantos grupos estão ativos. */
  teamName?: string;
  groups?: number;
  /**
   * Pessoa: hoje o assistente ainda a reconhece pela tolerância de quem já usava
   * (até decidir ou até graceUntil). O texto diz o que "Agora não" mantém.
   */
  legacy?: boolean;
  graceUntil?: string | null;
  /** Ação em andamento: trava os botões. */
  busy?: "accept" | "decline" | null;
  onAccept?: () => void;
  /** "Agora não", "Não permitir" ou "Desativar", conforme a variante. */
  onDecline?: () => void;
  /** Fechar pelo ✕, arrastando ou tocando fora (não existe quando `blocking`). */
  onClose: () => void;
  /** Só sai com uma escolha. Padrão: team-confirm (aviso ao abrir o app). */
  blocking?: boolean;
}

/** Mesma ordem de assistantAiDataSent. */
const DATA_ICONS: LucideIcon[] = [MessageCircle, UserRound, CalendarDays, Music];

const LABELS: Record<AssistantConsentVariant, { accept?: string; decline?: string }> = {
  "team-activate": { accept: "Concordo e ativar", decline: "Agora não" },
  "team-confirm": { accept: "Concordo e manter ativo", decline: "Desativar o assistente" },
  member: { accept: "Concordo e permitir", decline: "Agora não" },
  "member-link": { accept: "Concordo e vincular", decline: "Agora não" },
  "member-notice": { accept: "Permitir", decline: "Não permitir" },
  "team-review": {},
  "member-review": {},
};

function Item({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-muted-foreground">
        <Icon className="h-[17px] w-[17px]" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-semibold">{title}</p>
        <div className="mt-0.5 text-subhead leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </li>
  );
}

/**
 * Aviso de compartilhamento com IA de terceiros (App Store 5.1.2(i) e LGPD):
 * quem recebe (OpenAI, EUA), o que vai, para quê, por quanto tempo, que é
 * opcional e como revogar. O aceite é gravado por quem abre o diálogo.
 */
export function AssistantAiConsentDialog({
  open, variant, assistantName = "Asafe", teamName, groups = 0, legacy = false, graceUntil = null, busy = null,
  onAccept, onDecline, onClose, blocking = variant === "team-confirm",
}: Props) {
  const name = assistantName;
  const team = variant.startsWith("team-");
  const review = variant.endsWith("-review");
  const labels = LABELS[variant];
  const sentId = useId();

  const title = {
    "team-activate": `Ativar o ${name} com IA da OpenAI?`,
    "team-confirm": `Confirme o uso de IA no ${name}`,
    member: `Permitir que o ${name} use seus dados?`,
    "member-link": `Permitir que o ${name} use seus dados?`,
    "member-notice": `O ${name} usa IA da OpenAI`,
    "team-review": `Privacidade do ${name}`,
    "member-review": `Privacidade do ${name}`,
  }[variant];

  const until = graceUntilLabel(graceUntil);
  const lead =
    variant === "team-confirm"
      ? `O ${name} já está ativo em ${groups === 1 ? "1 grupo" : `${groups} grupos`} ${teamName ? `da equipe ${teamName}` : "desta equipe"}. Para continuar, confirme que a equipe aceita o uso de IA de terceiros, ou desative o assistente.`
      : variant === "member-notice"
        ? legacy
          ? `Sua equipe usa o ${name} no WhatsApp e ele já reconhece você pelo telefone do cadastro. Escolha se ele pode continuar usando os seus dados.`
          : `Sua equipe usa o ${name} no WhatsApp. Ele só reconhece você no grupo se você permitir o uso dos seus dados.`
        : null;

  // O que acontece sem o aceite: tem de bater com o que o banco faz (assistant_member_ai_allowed).
  const optional = team
    ? `Sem o ${name}, a equipe usa o +Louvor normalmente. Além do seu aceite como líder, cada pessoa (inclusive você) escolhe em Ajustes › Meu usuário se o ${name} pode usar os dados dela.`
    : legacy
      ? `Até você decidir, o ${name} continua reconhecendo você pelo telefone do cadastro, como já fazia${until ? ` (${until})` : ""}. Se não permitir, ele deixa de reconhecer você; o app funciona normalmente e seu nome continua nas escalas da equipe.`
      : `Sem isso, o ${name} não reconhece você no grupo, mas o app funciona normalmente. Seu nome continua nas escalas da equipe.`;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !blocking && !busy) onClose(); }}>
      <DialogContent
        hideClose={blocking}
        className="sm:max-w-lg"
        onEscapeKeyDown={(e) => { if (blocking) e.preventDefault(); }}
        onInteractOutside={(e) => { if (blocking) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="text-balance">{title}</DialogTitle>
          <DialogDescription>Aviso de privacidade · versão {consentVersionLabel()}</DialogDescription>
        </DialogHeader>

        {/* O texto rola; as escolhas ficam sempre à vista. */}
        <div className="-mx-1 max-h-[min(58dvh,560px)] space-y-5 overflow-y-auto overscroll-contain px-1 pb-1">
          {lead && <p className="mx-4 text-subhead leading-relaxed">{lead}</p>}

          <section aria-labelledby={sentId}>
            <p id={sentId} className="mx-4 mb-1.5 text-subhead leading-relaxed">
              Para responder no WhatsApp, o {name} usa inteligência artificial da <strong>{ASSISTANT_AI_PROVIDER}</strong>,
              uma empresa terceira. O +Louvor envia à OpenAI:
            </p>
            <ul className="divide-y divide-separator overflow-hidden rounded-card bg-card">
              {assistantAiDataSent(name).map((item, i) => (
                <Item key={item.title} icon={DATA_ICONS[i] ?? MessageCircle} title={item.title}>{item.detail}.</Item>
              ))}
            </ul>
          </section>

          <ul className="divide-y divide-separator overflow-hidden rounded-card bg-card">
            <Item icon={Phone} title="Telefone e WhatsApp">{ASSISTANT_AI_LOCAL_DATA}</Item>
            <Item icon={Target} title="Para quê">{ASSISTANT_AI_PURPOSE}</Item>
            <Item icon={Globe} title="Onde">Nos servidores da OpenAI, nos Estados Unidos (transferência internacional de dados).</Item>
            <Item icon={Clock} title="Por quanto tempo">
              {ASSISTANT_AI_RETENTION.app} {ASSISTANT_AI_RETENTION.provider}
            </Item>
            <Item icon={ShieldCheck} title="É opcional">{optional}</Item>
            <Item icon={Undo2} title="Como revogar">
              {team
                ? `Em Ajustes › Equipe › Assistente no WhatsApp. O ${name} é desligado em todos os grupos da equipe.`
                : `Desligue “Permitir que o ${name} use meus dados” em Ajustes › Meu usuário › Assistente no WhatsApp.`}
            </Item>
          </ul>

          {team && !review && (
            <p className="mx-4 text-footnote leading-relaxed text-muted-foreground">
              Ao concordar, você confirma, como líder, que a equipe foi informada sobre o uso de IA nas respostas do {name}.
            </p>
          )}

          <a
            href={privacyPolicyUrl()}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => { e.preventDefault(); void openPrivacyPolicy(); }}
            className="mx-4 inline-flex min-h-11 items-center gap-1.5 text-subhead font-medium text-primary"
          >
            Política de Privacidade
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>

        <div>
          {review ? (
            <Button variant="secondary" className="w-full" onClick={onClose}>Fechar</Button>
          ) : (
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={onAccept} disabled={busy !== null}>
                {busy === "accept" && <Loader2 className="animate-spin" aria-hidden="true" />}
                {labels.accept}
              </Button>
              <Button
                variant={variant === "team-confirm" ? "ghost" : "secondary"}
                className={cn("w-full", variant === "team-confirm" && "text-ios-red")}
                onClick={onDecline ?? onClose}
                disabled={busy !== null}
              >
                {busy === "decline" && <Loader2 className="animate-spin" aria-hidden="true" />}
                {labels.decline}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
