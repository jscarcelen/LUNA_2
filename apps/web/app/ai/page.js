import { LegalPage } from "../../components/legal/LegalPage";
import { aiNotice } from "../../lib/legalTexts.js";

export const metadata = { title: "AI notice · LUNA" };
export const dynamic = "force-dynamic";

/** English by default, Spanish with ?lang=es. */
export default async function Page({ searchParams }) {
  const params = (await searchParams) || {};
  const lang = (Array.isArray(params.lang) ? params.lang[0] : params.lang) === "es" ? "es" : "en";
  return <LegalPage doc={aiNotice(lang)} lang={lang} />;
}
