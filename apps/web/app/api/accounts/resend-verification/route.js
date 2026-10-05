/**
 * POST /api/accounts/resend-verification — mails a fresh confirmation link to the logged-in account (older
 * links stop working). Rate limited per account and per address. When no email provider is configured the
 * answer says so (`mailSetupNeeded`) and never carries the link, except outside production as `devPreview`.
 */
import { limits } from "../../../../lib/accountLimits.js";
import { isEmailVerified } from "../../../../lib/accountsCore.js";
import { sendVerificationEmail } from "../../../../lib/accountFlows.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured, rejectUnlessVerificationReady, requireAccount } from "../../../../lib/accountsApi.js";
import { publicBaseUrl } from "../../../../lib/mailer.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const perAccount = limits.resendByAccount;
const perAddress = limits.resendByAddress;

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured() || (await rejectUnlessVerificationReady());
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const { account } = found;
    if (isEmailVerified(account)) return json({ ok: true, alreadyVerified: true });
    const ip = clientIp(request);
    if (perAccount.isBlocked(account.id) || perAddress.isBlocked(ip)) return json({ error: "You asked for several emails already. Check your inbox and spam folder, or try again in an hour." }, 429);
    perAccount.fail(account.id);
    perAddress.fail(ip);
    const confirmation = await sendVerificationEmail(account, publicBaseUrl(request));
    return json({ ok: true, confirmation });
  } catch (error) {
    return errorResponse(error);
  }
}
