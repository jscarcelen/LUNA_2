import { VerifyEmailScreen } from "../../components/auth/TokenScreens";
import { VERIFICATION_MIGRATION } from "../../lib/accountsCore.js";
import { supportsVerification } from "../../lib/accountsRepository.js";
import { peekToken } from "../../lib/accountTokens.js";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";

export const dynamic = "force-dynamic";
// The address carries a one-time token: never send it on as a Referer.
export const metadata = { title: "Confirm your email · LUNA", referrer: "no-referrer", robots: { index: false, follow: false } };

/** The link from the confirmation email. Looking at the page does not use the token up; the button does. */
export default async function VerifyEmailPage({ searchParams }) {
  const params = (await searchParams) || {};
  const token = String((Array.isArray(params.token) ? params.token[0] : params.token) || "");
  let state = "invalid";
  if (isSupabaseConfigured()) {
    try {
      if (!(await supportsVerification())) state = "setup";
      else if ((await peekToken(token, "verify_email")).ok) state = "ready";
    } catch {
      state = "invalid";
    }
  }
  return <VerifyEmailScreen token={token} state={state} migration={VERIFICATION_MIGRATION} />;
}
