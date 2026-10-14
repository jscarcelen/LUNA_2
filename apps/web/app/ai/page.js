import { LegalPage } from "../../components/legal/LegalPage";
import { aiNotice } from "../../lib/legalTexts.js";

export const metadata = { title: "AI notice · LUNA" };

export default function Page() {
  return <LegalPage doc={aiNotice()} />;
}
