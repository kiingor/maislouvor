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
export const TERMS_VERSION = "2026-10-03";
export const PRIVACY_VERSION = "2026-10-03";
/** Data de vigência exibida nos documentos (AAAA-MM-DD). */
export const LEGAL_EFFECTIVE_DATE = "2026-10-03";

export const APP_NAME = "+Louvor";
export const LEGAL_SITE_URL = "https://maislouvor.com";

// Identificação do controlador (LGPD, art. 9º, III).
export const LEGAL_ENTITY_NAME = "PREENCHER: razão social ou nome completo do responsável";
export const LEGAL_DOCUMENT = "PREENCHER: CNPJ ou CPF";
export const LEGAL_ADDRESS = "PREENCHER: endereço completo para correspondência";

// Contatos. Use caixas de e-mail que alguém lê todos os dias úteis.
export const PRIVACY_EMAIL = "PREENCHER: e-mail de privacidade (ex.: privacidade@maislouvor.com)";
export const SUPPORT_EMAIL = "PREENCHER: e-mail de suporte (ex.: suporte@maislouvor.com)";
/** Encarregado pelo tratamento de dados pessoais (DPO), art. 41 da LGPD. */
export const DPO_NAME = "PREENCHER: nome do encarregado (DPO)";

// Operadores que ainda não estão identificados no código.
export const INFRA_PROVIDER = "PREENCHER: empresa da VPS (hospedagem) e país do datacenter";
export const EMAIL_PROVIDER = "PREENCHER: provedor de envio de e-mails (SMTP)";
/** Quanto tempo uma cópia de segurança pode guardar dados já excluídos. */
export const BACKUP_RETENTION = "PREENCHER: prazo de rotação dos backups (ex.: 30 dias)";

/** Prazo de resposta do suporte (compromisso exibido na página /suporte). */
export const SUPPORT_RESPONSE_TIME = "até 2 dias úteis";
/** Prazo para analisar denúncias de conteúdo (exigência da App Store, 1.2). */
export const REPORT_REVIEW_TIME = "24 horas";
/** Idade mínima para ter conta. De 13 a 17 anos, só com autorização do responsável. */
export const MIN_AGE = 13;

// Rótulos de telas citados nos documentos (mudou a tela? ajuste aqui).
/** Onde fica a exclusão de conta no app (DeleteAccountSection, branch de exclusão de conta). */
export const DELETE_ACCOUNT_IN_APP = "Usuário › Meu usuário › Excluir minha conta";
/** Interruptor do Asafe em Usuário › Meu usuário (branch do consentimento do Asafe). */
export const ASAFE_ALLOW_LABEL = "Permitir que o Asafe use meus dados";

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
 * Páginas públicas (login, cadastro, convite, links públicos e os próprios
 * documentos) nunca são bloqueadas.
 */
export function requiresTermsAcceptance(pathname: string): boolean {
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
