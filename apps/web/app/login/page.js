import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LoginScreen } from "../../components/auth/LoginScreen";
import { SetupNotice } from "../../modules/accounts/SetupNotice";
import { isSetupNeededError } from "../../lib/accountsCore.js";
import { findAccountById } from "../../lib/accountsRepository.js";
import { freshSessionFromRequest } from "../../lib/session.js";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Log in · LUNA" };

/** Only same-site paths: `?next=` must never become an open redirect. */
const safeNext = (value) => (typeof value === "string" && /^\/[A-Za-z0-9/_-]*(\?page=[a-z-]{1,30})?$/.test(value) && !value.startsWith("//") ? value : "/platform");

export default async function LoginPage({ searchParams }) {
  const params = (await searchParams) || {};
  const next = safeNext(Array.isArray(params.next) ? params.next[0] : params.next);
  const mode = (Array.isArray(params.mode) ? params.mode[0] : params.mode) === "signup" ? "signup" : "signin";

  if (isSupabaseConfigured()) {
    const session = await freshSessionFromRequest({ headers: await headers() });
    if (session) {
      let account = null;
      try {
        account = await findAccountById(session.accountId);
      } catch (error) {
        if (isSetupNeededError(error)) return <div className="tw-scope" style={{ maxWidth: 560, margin: "15vh auto", padding: 16 }}><SetupNotice /></div>;
        throw error;
      }
      if (account) redirect(next);
    }
  }
  return <LoginScreen initialMode={mode} next={next} />;
}
