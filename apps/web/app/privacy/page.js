import { getServerLocale } from "../../lib/i18n/server.js";
import { LegalPage } from "../../components/legal/LegalPage";
import { privacyPolicy } from "../../lib/legalTexts.js";

export const metadata = { title: "Privacy Policy · LUNA" };
export const dynamic = "force-dynamic";

/** ?lang=es|en wins; otherwise the luna_lang cookie / Accept-Language (lib/i18n/server.js), default English. */
export default async function Page({ searchParams }) {
  const params = (await searchParams) || {};
  const asked = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const lang = asked === "es" || asked === "en" ? asked : await getServerLocale();
  return <LegalPage doc={privacyPolicy(lang)} lang={lang} />;
}
