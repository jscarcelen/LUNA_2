/**
 * Groups of students (teacher / parent): cluster the students you are connected to, so work, exam dates and
 * performance views can address many at once. The caller is the logged-in account; a group is only ever visible
 * to its owner (anyone else gets the same 404 as for a group that does not exist) and a member must be a student
 * the owner is connected to as their teacher / parent, accepted, at all times (lib/groupsRepository.js).
 *
 * GET  /api/accounts/groups  -> { groups: [{ id, name, colour, memberIds, memberCount }], students: [{ id, displayName, email }] }
 * POST /api/accounts/groups  Body:
 *        { action: "create", name, colour?, memberIds?: [] }
 *      | { action: "update", groupId, name?, colour? }
 *      | { action: "delete", groupId }                         (never deletes or disconnects a student)
 *      | { action: "addMembers", groupId, memberIds: [] }
 *      | { action: "removeMembers", groupId, memberIds: [] }
 *      | { action: "setMemberGroups", memberId, groupIds: [] } (the per-student "Groups…" choice)
 * Until supabase/migrations/202610070001_groups_exam_dates.sql is applied every call answers
 * `503 { setupNeeded: true, migration }`.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { addMembers, createGroup, deleteGroup, listGroups, removeMembers, setMemberGroups, updateGroup } from "../../../../lib/groupsRepository.js";
import { errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const list = (value) => (Array.isArray(value) ? value.map((entry) => String(entry || "")) : []);

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    return json(await listGroups(found.account));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  const blocked = rejectCrossSite(request) || rejectUnconfigured();
  if (blocked) return blocked;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    const { account } = found;
    let body;
    try {
      body = await request.json();
    } catch {
      throw new LinkError("bad_request", "Send JSON.");
    }
    const action = String(body?.action || "");
    let result;
    if (action === "create") result = { group: await createGroup(account, { name: body?.name, colour: body?.colour, memberIds: list(body?.memberIds) }) };
    else if (action === "update") result = { group: await updateGroup(account, String(body?.groupId || ""), { name: body?.name, colour: body?.colour }) };
    else if (action === "delete") result = await deleteGroup(account, String(body?.groupId || ""));
    else if (action === "addMembers") result = await addMembers(account, String(body?.groupId || ""), list(body?.memberIds));
    else if (action === "removeMembers") result = await removeMembers(account, String(body?.groupId || ""), list(body?.memberIds));
    else if (action === "setMemberGroups") result = await setMemberGroups(account, String(body?.memberId || ""), list(body?.groupIds));
    else throw new LinkError("bad_action", "Unknown action.");
    return json({ ...result, ...(await listGroups(account)) });
  } catch (error) {
    return errorResponse(error);
  }
}
