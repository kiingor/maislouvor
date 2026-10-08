import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memoryStorage";
import {
  clearPendingAcceptance,
  DELETE_ACCOUNT_SETTINGS_PATH,
  formatLegalDate,
  hasCurrentAcceptance,
  hasPendingAcceptance,
  isLegalPlaceholder,
  LEGAL_PATHS,
  legalAcceptanceMetadata,
  metadataHasCurrentAcceptance,
  PRIVACY_VERSION,
  rememberPendingAcceptance,
  requiresTermsAcceptance,
  TERMS_VERSION,
} from "./legal";
import { privacyPolicy } from "@/content/legal/privacy";
import { termsOfUse } from "@/content/legal/terms";
import { supportPage } from "@/content/legal/support";
import type { LegalBlock, LegalDocumentContent } from "@/content/legal/types";

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

describe("legal constants", () => {
  it("publishes the agreed versions and public paths", () => {
    expect(TERMS_VERSION).toBe("2026-10-07");
    expect(PRIVACY_VERSION).toBe("2026-10-08");
    expect(LEGAL_PATHS).toEqual({ privacy: "/privacidade", terms: "/termos", support: "/suporte", deleteAccount: "/excluir-conta" });
    expect(formatLegalDate("2026-10-07")).toBe("7 de outubro de 2026");
    expect(isLegalPlaceholder("PREENCHER: CNPJ")).toBe(true);
    expect(isLegalPlaceholder("contato@maislouvor.com")).toBe(false);
  });

  it("gates only the signed-in app and the platform admin", () => {
    for (const path of ["/app", "/app/home", "/app/cultos/1/present", "/admin", "/admin/tickets/2"]) {
      expect(requiresTermsAcceptance(path)).toBe(true);
    }
    for (const path of ["/", "/login", "/signup", "/privacidade", "/termos", "/suporte", "/excluir-conta", "/invite/x", "/playlist/x", "/culto/x", "/baixar", "/application", "/administrar"]) {
      expect(requiresTermsAcceptance(path)).toBe(false);
    }
  });

  it("never gates the in-app account deletion section", () => {
    expect(DELETE_ACCOUNT_SETTINGS_PATH).toBe("/app/settings#excluir-conta");
    expect(requiresTermsAcceptance("/app/settings", "#excluir-conta")).toBe(false);
    expect(requiresTermsAcceptance("/app/settings/", "#excluir-conta")).toBe(false);
    expect(requiresTermsAcceptance("/app/settings")).toBe(true);
    expect(requiresTermsAcceptance("/app/settings", "#outra-secao")).toBe(true);
    expect(requiresTermsAcceptance("/app/home", "#excluir-conta")).toBe(true);
  });

  it("compares both document versions", () => {
    expect(hasCurrentAcceptance({ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION })).toBe(true);
    expect(hasCurrentAcceptance({ terms_version: TERMS_VERSION, privacy_version: "2025-01-01" })).toBe(false);
    expect(hasCurrentAcceptance({ terms_version: null, privacy_version: null })).toBe(false);
    expect(hasCurrentAcceptance(null)).toBe(false);
  });

  it("keeps a pending sign-up acceptance for a limited time", () => {
    const now = Date.UTC(2026, 9, 3, 12);
    const createdAt = new Date(now + 30_000).toISOString();
    expect(hasPendingAcceptance(createdAt, now)).toBe(false);
    rememberPendingAcceptance(now);
    expect(hasPendingAcceptance(createdAt, now + 60_000)).toBe(true);
    expect(hasPendingAcceptance(createdAt, now + 3 * 60 * 60 * 1000)).toBe(false);
    clearPendingAcceptance();
    expect(hasPendingAcceptance(createdAt, now)).toBe(false);
  });

  it("applies a pending sign-up acceptance only to an account created after it", () => {
    const now = Date.UTC(2026, 9, 3, 12);
    rememberPendingAcceptance(now);
    const later = now + 5 * 60_000;
    // Conta nova (relógio do servidor um pouco atrás do aparelho ainda vale).
    expect(hasPendingAcceptance(new Date(now + 20_000).toISOString(), later)).toBe(true);
    expect(hasPendingAcceptance(new Date(now - 2 * 60_000).toISOString(), later)).toBe(true);
    // Conta antiga entrando no mesmo aparelho (ex.: tablet da igreja): não herda o aceite.
    expect(hasPendingAcceptance("2026-05-10T10:00:00Z", later)).toBe(false);
    expect(hasPendingAcceptance(new Date(now - 60 * 60_000).toISOString(), later)).toBe(false);
    // Sem data de criação, nada é presumido.
    expect(hasPendingAcceptance(undefined, later)).toBe(false);
    expect(hasPendingAcceptance("não é data", later)).toBe(false);
  });

  it("reads the acceptance stored in the account metadata", () => {
    expect(metadataHasCurrentAcceptance(legalAcceptanceMetadata())).toBe(true);
    expect(metadataHasCurrentAcceptance({ legal_acceptance: { terms_version: "2025-01-01", privacy_version: PRIVACY_VERSION } })).toBe(false);
    expect(metadataHasCurrentAcceptance({})).toBe(false);
    expect(metadataHasCurrentAcceptance(undefined)).toBe(false);
  });
});

describe("server-side versions", () => {
  // Todas as migrações, como texto; vale a última que define legal_current_versions().
  const migrations = import.meta.glob("../../supabase/migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

  it("match TERMS_VERSION and PRIVACY_VERSION (accept_terms only accepts the server's versions)", () => {
    const defining = Object.keys(migrations)
      .sort()
      .filter((file) => /FUNCTION\s+public\.legal_current_versions\(\)/i.test(migrations[file]));
    expect(defining.length).toBeGreaterThan(0);
    const latest = migrations[defining[defining.length - 1]];
    const body = latest.slice(latest.search(/FUNCTION\s+public\.legal_current_versions\(\)/i));
    const match = body.match(/jsonb_build_object\(\s*'terms'\s*,\s*'([^']+)'\s*,\s*'privacy'\s*,\s*'([^']+)'\s*\)/);
    expect(match).not.toBeNull();
    expect({ terms: match![1], privacy: match![2] }).toEqual({ terms: TERMS_VERSION, privacy: PRIVACY_VERSION });
  });
});

describe("legal documents content", () => {
  const docs: [string, LegalDocumentContent][] = [
    ["privacy", privacyPolicy],
    ["terms", termsOfUse],
    ["support", supportPage],
  ];
  const texts = (block: LegalBlock): string[] => {
    if (typeof block === "string") return [block];
    if (Array.isArray(block)) return block;
    if ("note" in block) return [block.note];
    return block.faq.flatMap((item) => [item.q, item.a]);
  };

  it.each(docs)("%s has unique anchors, balanced markup and only known internal links", (_name, doc) => {
    const ids = doc.sections.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);

    const known = new Set<string>([...Object.values(LEGAL_PATHS), "/app/sugestoes"]);
    for (const text of doc.sections.flatMap((s) => s.blocks.flatMap(texts))) {
      expect((text.match(/\*\*/g) ?? []).length % 2).toBe(0);
      for (const [, , href] of text.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
        if (href.startsWith("/")) expect(known.has(href.split("#")[0])).toBe(true);
        else expect(href).toMatch(/^(https:\/\/|mailto:)/);
      }
      // Link malformado (ex.: espaço no endereço) apareceria como texto cru.
      expect(text).not.toMatch(/\]\([^)]*\s[^)]*\)/);
    }
  });

  it("covers what the stores require", () => {
    const all = (doc: LegalDocumentContent) => doc.sections.flatMap((s) => s.blocks.flatMap(texts)).join("\n");
    const privacy = all(privacyPolicy);
    expect(privacy).toMatch(/OpenAI \(Estados Unidos\)/);
    expect(privacy).toMatch(/Não vendemos/);
    expect(privacy).toContain("(/excluir-conta)");
    expect(privacy).toMatch(/Qualquer pessoa com o link/);
    // Apple 5.1.1(i): terceiros com proteção igual à desta política.
    expect(privacy).toMatch(/proteção igual ou superior à descrita nesta Política/);
    // Asafe (opt-in por pessoa): só reconhece quem permite, com a tolerância de
    // quem já usava; nomes de quem não permite não vão à OpenAI (escala sem nome).
    expect(privacy).toMatch(/só de quem permite o uso dos próprios dados/);
    expect(privacy).toMatch(/Não existe período de uso sem consentimento/);
    expect(privacy).toMatch(/Nomes de outras pessoas só vão quando elas permitem/);
    expect(privacy).not.toMatch(/seu nome pode ser enviado quando um colega consulta uma escala/);
    // LGPD art. 11: participar de uma equipe de louvor revela convicção religiosa.
    expect(privacy).toMatch(/convicção religiosa/);
    expect(privacy).toMatch(/Não informe dados de saúde/);
    // Exclusão: rascunhos apagados e o que fica (prova de denúncias, sem ligação com a conta).
    expect(privacy).toMatch(/rascunhos de músicas que você não chegou a cadastrar/);
    expect(privacy).toMatch(/denúncias do chat que envolvem você, com a cópia da mensagem denunciada/);
    // Chat: filtro automático e quem vê as denúncias.
    expect(privacy).toMatch(/filtro automático/);
    expect(privacy).toMatch(/A pessoa denunciada não é avisada/);
    const terms = all(termsOfUse);
    expect(terms).toMatch(/Tolerância zero/);
    expect(terms).toMatch(/24 horas/);
    expect(terms).toMatch(/Usuários bloqueados/);
    expect(terms).toMatch(/sem essa permissão, ele não reconhece a pessoa/);
    expect(terms).toMatch(/stdeula/);
    expect(terms).toMatch(/youtube\.com\/t\/terms/);
  });
});
