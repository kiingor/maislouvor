import { beforeEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "@/test/memoryStorage";
import {
  clearPendingAcceptance,
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
    expect(TERMS_VERSION).toBe("2026-10-03");
    expect(PRIVACY_VERSION).toBe("2026-10-03");
    expect(LEGAL_PATHS).toEqual({ privacy: "/privacidade", terms: "/termos", support: "/suporte", deleteAccount: "/excluir-conta" });
    expect(formatLegalDate("2026-10-03")).toBe("3 de outubro de 2026");
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

  it("compares both document versions", () => {
    expect(hasCurrentAcceptance({ terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION })).toBe(true);
    expect(hasCurrentAcceptance({ terms_version: TERMS_VERSION, privacy_version: "2025-01-01" })).toBe(false);
    expect(hasCurrentAcceptance({ terms_version: null, privacy_version: null })).toBe(false);
    expect(hasCurrentAcceptance(null)).toBe(false);
  });

  it("keeps a pending sign-up acceptance for a limited time", () => {
    const now = Date.UTC(2026, 9, 3, 12);
    expect(hasPendingAcceptance(now)).toBe(false);
    rememberPendingAcceptance(now);
    expect(hasPendingAcceptance(now + 60_000)).toBe(true);
    expect(hasPendingAcceptance(now + 3 * 60 * 60 * 1000)).toBe(false);
    clearPendingAcceptance();
    expect(hasPendingAcceptance(now)).toBe(false);
  });

  it("reads the acceptance stored in the account metadata", () => {
    expect(metadataHasCurrentAcceptance(legalAcceptanceMetadata())).toBe(true);
    expect(metadataHasCurrentAcceptance({ legal_acceptance: { terms_version: "2025-01-01", privacy_version: PRIVACY_VERSION } })).toBe(false);
    expect(metadataHasCurrentAcceptance({})).toBe(false);
    expect(metadataHasCurrentAcceptance(undefined)).toBe(false);
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
    const terms = all(termsOfUse);
    expect(terms).toMatch(/Tolerância zero/);
    expect(terms).toMatch(/24 horas/);
    expect(terms).toMatch(/stdeula/);
    expect(terms).toMatch(/youtube\.com\/t\/terms/);
  });
});
