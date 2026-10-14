import { LegalPage } from "../../components/legal/LegalPage";
import { termsOfService } from "../../lib/legalTexts.js";

export const metadata = { title: "Terms of Service · LUNA" };

export default function Page() {
  return <LegalPage doc={termsOfService()} />;
}
