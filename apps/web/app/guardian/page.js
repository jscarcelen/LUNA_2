import { GuardianConsentScreen } from "../../components/auth/TokenScreens";
import { LEGAL_MIGRATION } from "../../lib/accountsCore.js";
import { supportsLegal } from "../../lib/accountsRepository.js";
import { peekGuardianRequest } from "../../lib/guardianConsent.js";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";

export const dynamic = "force-dynamic";
// The address carries a one-time token: never send it on as a Referer, and keep the page out of search engines.
export const metadata = { title: "Parent or guardian consent · LUNA", referrer: "no-referrer", robots: { index: false, follow: false } };

/** The link from the email to a parent/guardian. Looking at the page does not use the link up; the buttons do. */
export default async function GuardianPage({ searchParams }) {
  const params = (await searchParams) || {};
  const token = String((Array.isArray(params.token) ? params.token[0] : params.token) || "");
  let state = "invalid";
  let studentName = "";
  if (isSupabaseConfigured()) {
    try {
      if (!(await supportsLegal())) state = "setup";
      else {
        const found = await peekGuardianRequest(token);
        if (found) { state = "ready"; studentName = found.studentName; }
      }
    } catch {
      state = "invalid";
    }
  }
  return <GuardianConsentScreen token={token} studentName={studentName} state={state} migration={LEGAL_MIGRATION} />;
}
