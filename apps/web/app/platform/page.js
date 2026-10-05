import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { SetupNotice } from "../../modules/accounts/SetupNotice";
import { isSetupNeededError, publicAccount } from "../../lib/accountsCore.js";
import { findAccountById } from "../../lib/accountsRepository.js";
import { sessionFromRequest } from "../../lib/session.js";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "LUNA" };

const Centered = ({ children }) => <div className="tw-scope" style={{ maxWidth: 560, margin: "15vh auto", padding: 16 }}>{children}</div>;

/**
 * The real platform: the same app as the demo (/app), but for the logged-in account. Its role and name
 * come from the account, its workspaces are its own, and there is no role switcher. Nobody logged in
 * is sent to the log in page.
 */
export default async function PlatformPage() {
  if (!isSupabaseConfigured()) {
    return <Centered><p>Accounts are stored in Supabase, which is not configured here (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY). The demo at <a href="/app">/app</a> does not need it.</p></Centered>;
  }
  const session = sessionFromRequest({ headers: await headers() });
  if (!session) redirect("/login");
  let account;
  try {
    account = await findAccountById(session.accountId);
  } catch (error) {
    if (isSetupNeededError(error)) return <Centered><SetupNotice /></Centered>;
    throw error;
  }
  if (!account) redirect("/login");
  return <AppShell account={publicAccount(account)} />;
}
