import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { privacyPolicy } from "@/content/legal/privacy";
import { termsOfUse } from "@/content/legal/terms";
import { formatLegalDate, LEGAL_EFFECTIVE_DATE, LEGAL_PATHS, PRIVACY_VERSION, TERMS_VERSION, type LegalDocKind } from "@/lib/legal";
import { LegalDocumentView } from "./LegalDocumentView";
import { scrollToLegalSection } from "./scrollToLegalSection";

const DOCS = {
  terms: { content: termsOfUse, version: TERMS_VERSION },
  privacy: { content: privacyPolicy, version: PRIVACY_VERSION },
} as const;

const SHEET_PREFIX = "folha-";

/**
 * Termos ou Política numa folha por cima da tela (cadastro): a pessoa lê e volta
 * ao formulário sem perder o que digitou. Links entre os dois documentos trocam
 * o conteúdo da folha; os demais links navegam normalmente.
 */
export default function LegalDocumentSheet({ doc, onClose }: { doc: LegalDocKind | null; onClose: () => void }) {
  const [current, setCurrent] = useState<LegalDocKind>(doc ?? "terms");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (doc) setCurrent(doc);
  }, [doc]);

  const handleInternalLink = (path: string) => {
    const [route, hash] = path.split("#");
    const next = route === LEGAL_PATHS.terms ? "terms" : route === LEGAL_PATHS.privacy ? "privacy" : null;
    if (!next) return false;
    if (next !== current) {
      setCurrent(next);
      contentRef.current?.scrollTo?.({ top: 0 });
    }
    if (hash) requestAnimationFrame(() => scrollToLegalSection(`${SHEET_PREFIX}${hash}`));
    return true;
  };

  const { content, version } = DOCS[current];

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent ref={contentRef} className="sm:max-h-[calc(100dvh-64px)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-headline">{content.title}</DialogTitle>
          <DialogDescription className="sr-only">Versão {version}</DialogDescription>
        </DialogHeader>
        <div className="px-1 pb-2">
          <LegalDocumentView
            content={content}
            updatedAt={formatLegalDate(LEGAL_EFFECTIVE_DATE)}
            version={version}
            idPrefix={SHEET_PREFIX}
            hideTitle
            onInternalLink={handleInternalLink}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
