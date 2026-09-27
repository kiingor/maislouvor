import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { format, parseISO } from "date-fns";
import { Bot, Check, ChevronRight, Copy, KeyRound, Link2, Loader2, MessageCircle, ShieldCheck, TriangleAlert, Unlink, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
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
  activationMessage,
  DEFAULT_INSTRUCTIONS_MAX,
  formatWhatsAppNumber,
  linkMessage,
  whatsAppLink,
  type AssistantMyStatus,
  type AssistantOverview,
} from "@/lib/whatsappAssistant";

/* Lista agrupada no estilo do app Ajustes (mesmas medidas de TeamSettings). */
const GROUP = "overflow-hidden rounded-card bg-card";
const GROUP_LABEL = "mx-4 mb-1.5 text-footnote text-muted-foreground";
const GROUP_FOOTER = "mx-4 mt-1.5 text-footnote text-muted-foreground";
const ROW_BODY =
  "flex min-h-[52px] min-w-0 flex-1 items-center gap-3 border-t border-separator py-2 pr-4 group-first/row:border-t-0";
const CIRCLE_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-fill-tertiary text-foreground transition-[background-color,transform] hover:bg-fill-secondary active:scale-95";

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

  if (isError) return null;

  const name = data?.assistant_name ?? "Asafe";
  const maxChars = data?.instructions_max ?? DEFAULT_INSTRUCTIONS_MAX;
  const saved = data?.instructions ?? "";
  const instructions = draft ?? saved;
  const dirty = draft !== null && draft.trim() !== saved.trim();
  const refresh = () => qc.invalidateQueries({ queryKey });

  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      await callRpc("assistant_create_activation_code", { p_team_id: teamId });
      await refresh();
    } catch (error) {
      toast({ title: "Não foi possível gerar o código", description: errorMessage(error), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleDisconnect = async (groupId: string) => {
    try {
      await callRpc("assistant_deactivate_group", { p_group_id: groupId });
      toast({ title: "Grupo desconectado", description: `O ${name} não responde mais nesse grupo.` });
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
          disponibilidade e os avisos que você escrever aqui.
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
              {data.pending_code ? (
                <Row leading={<IconTile icon={Link2} />} className="gap-2 py-2.5 pr-2">
                  <span className="min-w-0 flex-1">
                    <span className="block break-words font-mono text-body">
                      {activationMessage(name, data.pending_code.code)}
                    </span>
                    <span className="block text-footnote text-muted-foreground">
                      Vale uma vez, até {dateTime(data.pending_code.expires_at)}.
                    </span>
                  </span>
                  <CopyButton value={activationMessage(name, data.pending_code.code)} label="Copiar mensagem" />
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
                    {data.pending_code ? "Gerar outro código" : "Gerar código de ativação"}
                  </span>
                  <ChevronRight className="h-[18px] w-[18px] text-label-tertiary" strokeWidth={2.5} aria-hidden="true" />
                </span>
              </button>
            </div>
            <p className={GROUP_FOOTER}>
              Mande a mensagem no grupo marcando o @{name}. Ele se apresenta e lista tudo o que sabe fazer.
            </p>
          </section>

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
                            O {name} para de responder em “{group.name || "Grupo sem nome"}”. Para voltar, gere um novo código.
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
          </p>
        </section>
      )}

      {/* O que ele faz */}
      <section aria-labelledby="assistant-capabilities-title">
        <h3 id="assistant-capabilities-title" className={GROUP_LABEL}>O que o {name} faz</h3>
        <ul className={GROUP}>
          {ASSISTANT_CAPABILITIES.map((capability) => (
            <li key={capability.title} className="group/row flex items-center gap-3 pl-4">
              <span
                className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-fill-tertiary text-[17px] leading-none"
                aria-hidden="true"
              >
                {capability.emoji}
              </span>
              <span className={cn(ROW_BODY, "py-2.5")}>
                <span className="min-w-0 flex-1">
                  <span className="block text-body">{capability.title}</span>
                  <span className="block text-footnote text-muted-foreground">
                    {capability.description} · “@{name} {capability.example}”
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>
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

  const { data, isError } = useQuery({
    queryKey: ["assistant-my-status"],
    queryFn: () => callRpc<AssistantMyStatus>("assistant_my_status"),
  });

  if (isError || !data?.enabled) return null;
  const name = data.assistant_name;
  const chatLink = code ? whatsAppLink(data.bot_phone, linkMessage(code.code)) : null;

  const status = data.linked
    ? { label: "Reconhece você", className: "text-ios-green" }
    : data.has_phone
      ? { label: "Pelo seu telefone", className: "text-muted-foreground" }
      : { label: "Cadastre seu telefone", className: "text-ios-orange" };

  const handleGenerate = async () => {
    setBusy(true);
    try {
      setCode(await callRpc<{ code: string; expires_at: string }>("assistant_create_link_code"));
    } catch (error) {
      toast({ title: "Não foi possível gerar o código", description: errorMessage(error), variant: "destructive" });
    } finally {
      setBusy(false);
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

  const rowButton = "group/row flex w-full items-center gap-3 pl-4 text-left transition-colors active:bg-fill-quaternary disabled:opacity-60";

  return (
    <section aria-labelledby="settings-assistant">
      <h2 id="settings-assistant" className={GROUP_LABEL}>Assistente no WhatsApp</h2>
      <div className={GROUP}>
        <Row leading={<IconTile icon={Bot} />}>
          <span className="min-w-0 flex-1 text-body">{name}</span>
          <span className={cn("shrink-0 text-subhead", status.className)}>{status.label}</span>
        </Row>

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
          <button type="button" onClick={handleGenerate} disabled={busy} className={rowButton}>
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
              <button type="button" disabled={busy} className={rowButton}>
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
      </p>
    </section>
  );
}
