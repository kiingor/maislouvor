import { LegalDocumentPage } from "@/components/legal/LegalPage";
import { supportPage } from "@/content/legal/support";

/** /suporte — pública, sem login (URL de suporte das fichas da App Store e do Google Play). */
export default function Support() {
  return <LegalDocumentPage content={supportPage} />;
}
