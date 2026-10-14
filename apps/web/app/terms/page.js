import { LegalPage } from "../../components/legal/LegalPage";
import { termsOfService } from "../../lib/legalTexts.js";

export const metadata = { title: "Terms of Service · LUNA" };
export const dynamic = "force-dynamic";

/** English by default, Spanish with ?lang=es. */
export default async function Page({ searchParams }) {
  const params = (await searchParams) || {};
  const lang = (Array.isArray(params.lang) ? params.lang[0] : params.lang) === "es" ? "es" : "en";
  return <LegalPage doc={termsOfService(lang)} lang={lang} />;
}
