import { LegalPage } from "../../components/legal/LegalPage";
import { privacyPolicy } from "../../lib/legalTexts.js";

export const metadata = { title: "Privacy Policy · LUNA" };

export default function Page() {
  return <LegalPage doc={privacyPolicy()} />;
}
