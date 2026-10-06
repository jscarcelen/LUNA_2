/**
 * GET /api/accounts/linked/members?groupId=<group>&offset=0&limit=10
 * GET /api/accounts/linked/members?studentIds=<id>,<id>&offset=0&limit=10
 * The workspaces of the members of one of MY groups (or of an explicit list of my students), in one call, a PAGE at
 * a time: a student's tree is heavy, so the page asks again while `hasMore` (`nextOffset`). Each student is
 * authorised on their own accepted teacher_student / parent_student link, with the same privacy rules as
 * /api/accounts/linked/workspaces (uploaded material and private notes reduced to names); a student who is not (or
 * no longer) connected is counted in `skipped` and never returned. A group that is not mine answers 404.
 *   -> { members: [{ student, workspaces }], total, offset, nextOffset, hasMore, skipped, group? }
 */
import { linkedStudentWorkspaces } from "../../../../../lib/accountsRepository.js";
import { groupMemberEvidence } from "../../../../../lib/groupsRepository.js";
import { MAX_GROUP_MEMBERS, MAX_MEMBERS_PAGE_SIZE, MEMBERS_PAGE_SIZE } from "../../../../../modules/accounts/groups.js";
import { errorResponse, json, rejectUnconfigured, requireAccount } from "../../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const params = new URL(request.url).searchParams;
    const studentIds = String(params.get("studentIds") || "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, MAX_GROUP_MEMBERS);
    const result = await groupMemberEvidence(found.account, {
      groupId: String(params.get("groupId") || ""),
      studentIds,
      offset: Number(params.get("offset")) || 0,
      limit: Math.min(Number(params.get("limit")) || MEMBERS_PAGE_SIZE, MAX_MEMBERS_PAGE_SIZE)
    }, linkedStudentWorkspaces);
    return json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
