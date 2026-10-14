import { LegalPage } from "../../components/legal/LegalPage";
import { privacyPolicy } from "../../lib/legalTexts.js";

export const metadata = { title: "Privacy Policy · LUNA" };
export const dynamic = "force-dynamic";

/** English by default, Spanish with ?lang=es. */
export default async function Page({ searchParams }) {
  const params = (await searchParams) || {};
  const lang = (Array.isArray(params.lang) ? params.lang[0] : params.lang) === "es" ? "es" : "en";
  return <LegalPage doc={privacyPolicy(lang)} lang={lang} />;
}
