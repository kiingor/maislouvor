/* ------------------------------------------------------------------
   Termos de Uso, Política de Privacidade e Suporte — fonte única.

   Tudo que identifica o responsável pelo +Louvor, os contatos e as
   versões vigentes fica aqui. Os textos longos ficam em
   src/content/legal/*, para revisão jurídica sem mexer nas telas.

   O marcador LEGAL_PLACEHOLDER_MARK indica o que ainda depende de
   decisão do dono do app. Antes de publicar nas lojas, rode:
     node scripts/check-legal-placeholders.mjs
   (sai com erro enquanto restar algum marcador).
   ------------------------------------------------------------------ */

/**
 * Versões vigentes. Mudou o texto de forma relevante? Atualize a data aqui:
 * quem aceitou uma versão anterior vê o aviso de novo aceite (TermsGate).
 *
 * O banco só aceita estas versões (public.legal_current_versions(), em
 * 20261003131000_terms_acceptance.sql): ao mudar a data, crie uma migração nova
 * que redefina a função com a mesma data e publique-a junto com o app. O teste
 * src/lib/legal.test.ts falha se as duas pontas divergirem.
 */
export const TERMS_VERSION = "2026-10-07";
export const PRIVACY_VERSION = "2026-10-08";
/** Data de vigência exibida nos documentos (AAAA-MM-DD). */
export const LEGAL_EFFECTIVE_DATE = "2026-10-08";

export const APP_NAME = "+Louvor";
export const LEGAL_SITE_URL = "https://maislouvor.com";

// Identificação do controlador (LGPD, art. 9º, III).
export const LEGAL_ENTITY_NAME = "Filipe Santos Lourenço";
export const LEGAL_DOCUMENT = "CPF 103.699.414-70";
export const LEGAL_ADDRESS = "Av. Sinesio Guimaraes, 617 — João Pessoa/PB, CEP 58040-400, Brasil";

// Contatos. Use caixas de e-mail que alguém lê todos os dias úteis.
export const PRIVACY_EMAIL = "filipesantoslourenco@outlook.com";
export const SUPPORT_EMAIL = "suporte@maislouvor.com";
/** Canal indicado pelo titular; não equivale à nomeação formal de um encarregado. */
export const PRIVACY_CONTACT_NAME = LEGAL_ENTITY_NAME;

// Operadores que ainda não estão identificados no código.
export const INFRA_PROVIDER = "Hostinger, com servidor no Brasil";
export const EMAIL_PROVIDER = "GoDaddy — E-mail Profissional";
/** Quanto tempo uma cópia de segurança pode guardar dados já excluídos. */
export const BACKUP_RETENTION = "Backups diários e cópias de implantação são mantidos por 30 dias. A Hostinger mantém também duas cópias semanais rotativas, separadas do servidor, que podem incluir esses backups. O ciclo de eliminação das cópias de recuperação é de aproximadamente 45 dias com as rotinas funcionando. Falhas podem prolongar esse prazo: a última cópia recuperável é preservada até corrigir o problema e validar uma nova cópia. Dados excluídos não devem voltar ao uso normal em uma restauração.";
/**
 * Dados pessoais sensíveis (LGPD, art. 5º, II): participar de uma equipe de louvor
 * pode revelar convicção religiosa. Base legal do art. 11 para esse tratamento —
 * decisão do jurídico (ex.: consentimento específico e em destaque no cadastro,
 * art. 11, I, o que pede uma caixa própria na tela de cadastro).
 */
export const SENSITIVE_DATA_LEGAL_BASIS =
  "Consentimento específico e destacado de cada pessoa (art. 11, I, da LGPD), solicitado antes do acesso às funções de equipe. A autorização abrange vínculos, funções, disponibilidade e participação em cultos e ensaios para organizar a equipe e suas escalas. O líder não pode autorizar em nome dos integrantes. A escolha tem versão e data registradas e pode ser retirada em Usuário → Minhas escolhas de privacidade. Sem autorização, a conta, o suporte e a exclusão permanecem acessíveis; as funções de equipe ficam indisponíveis. O Asafe exige autorização separada.";

/**
 * Prazo para atender pedidos de titulares feitos por e-mail, inclusive a
 * exclusão de conta de quem não consegue entrar (LGPD, art. 19, II: até 15 dias).
 */
export const PRIVACY_REQUEST_RESPONSE_DAYS = 15;

/** Prazo de resposta do suporte (compromisso exibido na página /suporte). */
export const SUPPORT_RESPONSE_TIME = "até 2 dias úteis";
/** Prazo para analisar denúncias de conteúdo (exigência da App Store, 1.2). */
export const REPORT_REVIEW_TIME = "24 horas";
/** Idade mínima para ter conta. De 13 a 17 anos, só com autorização do responsável. */
export const MIN_AGE = 13;

// Rótulos de telas citados nos documentos (mudou a tela? ajuste aqui).
/** Aba do app com os ajustes pessoais (barra de abas e menu lateral: "Usuário"). */
export const MY_SETTINGS_IN_APP = "Usuário › Perfil";
/** Ajustes da equipe, só para líderes (Usuário › Equipe). */
export const TEAM_SETTINGS_IN_APP = "Usuário › Equipe";
/** Onde fica a exclusão de conta no app (DeleteAccountSection). */
export const DELETE_ACCOUNT_IN_APP = `${MY_SETTINGS_IN_APP} › Excluir minha conta`;
/** Âncora da seção de exclusão em Usuário › Perfil (DeleteAccountSection). */
export const DELETE_ACCOUNT_ANCHOR = "excluir-conta";
/**
 * A seção de exclusão dentro do app. A página pública /excluir-conta leva para
 * cá depois do login, e o pedido de aceite dos termos (TermsGate) não bloqueia
 * este endereço: ninguém precisa aceitar os termos para excluir a conta.
 */
export const DELETE_ACCOUNT_SETTINGS_PATH = `/app/settings#${DELETE_ACCOUNT_ANCHOR}`;
/** Interruptor do Asafe em Usuário › Perfil (AssistantSettings). */
export const ASAFE_ALLOW_LABEL = "Permitir que o Asafe use meus dados";

/* Asafe (assistente no WhatsApp): o que os documentos e o aviso de IA do app
   (src/lib/assistantAiConsent.ts) dizem sobre o provedor e a retenção. */
/** Provedor de IA do Asafe (edge function whatsapp-assistant, openai.ts). */
export const ASAFE_AI_PROVIDER = "OpenAI (Estados Unidos)";
/** O +Louvor apaga as perguntas e respostas do Asafe depois disto (assistant_purge). */
export const ASAFE_HISTORY_RETENTION_DAYS = 30;
/**
 * Retenção no provedor, conforme a política pública da API da OpenAI (chamada
 * com store: false). Conferir com o jurídico a cada versão do aviso.
 */
export const ASAFE_PROVIDER_RETENTION =
  "A conversa é enviada à OpenAI sem pedido de armazenamento. Pela política da API da OpenAI, os dados podem ficar guardados por até 30 dias para segurança e não são usados para treinar modelos.";

/** Rotas públicas (fora de /app, sem login). Use sempre estes caminhos nos links. */
export const LEGAL_PATHS = {
  privacy: "/privacidade",
  terms: "/termos",
  support: "/suporte",
  deleteAccount: "/excluir-conta",
} as const;

export type LegalDocKind = "terms" | "privacy";

/** Endereços públicos para as fichas das lojas (App Store Connect / Play Console). */
export const LEGAL_PUBLIC_URLS = {
  privacy: `${LEGAL_SITE_URL}${LEGAL_PATHS.privacy}`,
  terms: `${LEGAL_SITE_URL}${LEGAL_PATHS.terms}`,
  support: `${LEGAL_SITE_URL}${LEGAL_PATHS.support}`,
  deleteAccount: `${LEGAL_SITE_URL}${LEGAL_PATHS.deleteAccount}`,
} as const;

export const LEGAL_PLACEHOLDER_MARK = "PREENCHER"; // check-legal-placeholders: ignore

/** Valor ainda não definido (aparece destacado nas páginas e bloqueia o checklist de release). */
export function isLegalPlaceholder(value: string | null | undefined): boolean {
  return !!value && value.includes(LEGAL_PLACEHOLDER_MARK);
}

/** "2026-10-03" -> "3 de outubro de 2026" (sem depender do fuso do aparelho). */
export function formatLegalDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------
   Aceite dos termos
   ------------------------------------------------------------------ */

export interface TermsAcceptance {
  terms_version: string | null;
  privacy_version: string | null;
  terms_accepted_at?: string | null;
}

/** O perfil já aceitou as versões vigentes dos dois documentos? */
export function hasCurrentAcceptance(record: TermsAcceptance | null | undefined): boolean {
  return !!record && record.terms_version === TERMS_VERSION && record.privacy_version === PRIVACY_VERSION;
}

/**
 * Rotas em que o aceite é obrigatório: o app logado e o painel da plataforma.
 * Páginas públicas (login, cadastro, convite, links públicos, os próprios
 * documentos e /excluir-conta) nunca são bloqueadas. A seção de exclusão da
 * conta dentro do app (DELETE_ACCOUNT_SETTINGS_PATH) também não: quem não
 * concorda com os termos precisa conseguir excluir a conta sem aceitá-los.
 */
export function requiresTermsAcceptance(pathname: string, hash = ""): boolean {
  if (`${pathname.replace(/\/+$/, "")}${hash}` === DELETE_ACCOUNT_SETTINGS_PATH) return false;
  return ["/app", "/admin"].some((root) => pathname === root || pathname.startsWith(`${root}/`));
}

/**
 * Aceite feito antes de existir sessão (cadastro com Google, que sai do app e
 * volta pelo redirecionamento). O TermsGate grava no perfil na primeira sessão.
 *
 * A anotação não diz de quem é: por isso só vale para uma conta CRIADA depois
 * dela (created_at do GoTrue), nunca para uma conta antiga que entre no mesmo
 * aparelho (ex.: tablet da igreja). O TermsGate também a apaga ao sair da conta.
 */
const PENDING_KEY = "louvor-legal-pending-acceptance";
const PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Folga para a diferença entre o relógio do aparelho e o do servidor. */
const PENDING_CLOCK_SKEW_MS = 10 * 60 * 1000;

export function rememberPendingAcceptance(now = Date.now()): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ terms: TERMS_VERSION, privacy: PRIVACY_VERSION, at: now }));
  } catch {
    /* sem storage: o TermsGate pede o aceite na primeira sessão */
  }
}

/**
 * Há um aceite do cadastro, recente e das versões vigentes, que valha para esta
 * conta? accountCreatedAt = session.user.created_at.
 */
export function hasPendingAcceptance(accountCreatedAt: string | null | undefined, now = Date.now()): boolean {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw || !accountCreatedAt) return false;
    const p = JSON.parse(raw) as { terms?: string; privacy?: string; at?: number };
    if (p.terms !== TERMS_VERSION || p.privacy !== PRIVACY_VERSION || typeof p.at !== "number") return false;
    if (now - p.at < 0 || now - p.at > PENDING_MAX_AGE_MS) return false;
    const created = Date.parse(accountCreatedAt);
    return Number.isFinite(created) && created >= p.at - PENDING_CLOCK_SKEW_MS && created <= p.at + PENDING_MAX_AGE_MS;
  } catch {
    return false;
  }
}

export function clearPendingAcceptance(): void {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* ignora */
  }
}

/**
 * Registro do aceite no cadastro por e-mail (user_metadata do GoTrue). Cobre o
 * caso de confirmação de e-mail: a sessão só surge depois, talvez em outro aparelho.
 */
export function legalAcceptanceMetadata(now = new Date()) {
  return {
    legal_acceptance: { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION, accepted_at: now.toISOString() },
  };
}

export function metadataHasCurrentAcceptance(metadata: Record<string, unknown> | null | undefined): boolean {
  const a = metadata?.legal_acceptance as { terms_version?: unknown; privacy_version?: unknown } | undefined;
  return !!a && a.terms_version === TERMS_VERSION && a.privacy_version === PRIVACY_VERSION;
}
