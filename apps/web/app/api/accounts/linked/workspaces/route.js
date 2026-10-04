/**
 * GET /api/accounts/linked/workspaces?accountId=<student id>
 * The workspace tree of a student the caller is connected to (accepted link), for the read-only
 * "My students" / "My children" performance views. Only teachers and parents, only students they are
 * linked to; uploaded material and private notes are reduced to their names (redactTreeForGuardian).
 */
import { linkedStudentWorkspaces } from "../../../../../lib/accountsRepository.js";
import { errorResponse, json, rejectUnconfigured, requireAccount } from "../../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const accountId = new URL(request.url).searchParams.get("accountId") || "";
    const result = await linkedStudentWorkspaces(found.account, accountId);
    // The same answer for "no such student" and "not your student".
    if (!result) return json({ error: "That student is not connected to you." }, 404);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
