import { LegalDocumentPage } from "@/components/legal/LegalPage";
import { privacyPolicy } from "@/content/legal/privacy";
import { PRIVACY_VERSION } from "@/lib/legal";

/** /privacidade — pública, sem login (link exigido pelas lojas e pela LGPD). */
export default function PrivacyPolicy() {
  return <LegalDocumentPage content={privacyPolicy} version={PRIVACY_VERSION} />;
}
