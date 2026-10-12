/**
 * GET /api/accounts/me — the logged-in account (401 + `account: null` when nobody is), plus whether an
 * under-13 student still needs a parent to accept a connection.
 */
import { ownAccount } from "../../../../lib/accountsCore.js";
import { listLinkedAccounts, readAccountProfile } from "../../../../lib/accountsRepository.js";
import { errorResponse, json, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const { account } = found;
    const needsParent = account.role === "student" && account.under_13 && !(await listLinkedAccounts(account.id, { role: "parent" })).length;
    const profile = await readAccountProfile(account.id).catch(() => ({ age: null, plan: "free", ready: false }));
    return json({ account: ownAccount(account), needsParent, profile });
  } catch (error) {
    return errorResponse(error);
  }
}
