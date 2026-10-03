import { LegalDocumentPage } from "@/components/legal/LegalPage";
import { termsOfUse } from "@/content/legal/terms";
import { TERMS_VERSION } from "@/lib/legal";

/** /termos — pública, sem login. */
export default function TermsOfUse() {
  return <LegalDocumentPage content={termsOfUse} version={TERMS_VERSION} />;
}
