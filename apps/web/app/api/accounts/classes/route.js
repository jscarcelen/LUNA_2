/**
 * Classes with a join code (a teacher's class = a group of students + a 6-letter code). The caller is always the
 * logged-in account; whose classes are read or changed is never taken from the body.
 *
 * GET  /api/accounts/classes  (teacher) -> { classes: [{ id, name, code, enabled, schoolConsent, schoolConsentAt, members: [{ id, displayName, email }] }] }
 * POST /api/accounts/classes  Body:
 *        { action: "create", name, schoolConsent?: boolean }   (teacher; schoolConsent = "the school holds parental consent for under-14s")
 *      | { action: "regenerate", groupId }                      (teacher; the old code stops working)
 *      | { action: "enable" | "disable", groupId }              (teacher)
 *      | { action: "join", code }                               (student; links to the teacher already accepted and adds them to the class)
 * Wrong codes are rate limited per address and per account (lib/accountLimits.js). Until
 * supabase/migrations/202610140001_class_codes.sql is applied every call answers `503 { setupNeeded: true, migration }`.
 */
import { LinkError } from "../../../../lib/accountsCore.js";
import { clientIp, errorResponse, json, rejectCrossSite, rejectUnconfigured, requireAccount } from "../../../../lib/accountsApi.js";
import { createClass, joinClassByCode, listClasses, regenerateClassCode, setClassEnabled } from "../../../../lib/classesRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const unconfigured = rejectUnconfigured();
  if (unconfigured) return unconfigured;
  try {
    const found = await requireAccount(request);
    if (found.response) return found.response;
    return json(await listClasses(found.account));
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
    const groupId = String(body?.groupId || "");
    if (action === "create") return json(await createClass(account, { name: body?.name, schoolConsent: body?.schoolConsent === true }));
    if (action === "regenerate") return json(await regenerateClassCode(account, groupId));
    if (action === "enable" || action === "disable") return json(await setClassEnabled(account, groupId, action === "enable"));
    if (action === "join") {
      const joined = await joinClassByCode(account, body?.code, { address: clientIp(request) });
      return json({ joined: { className: joined.className, teacherName: joined.teacherName, approval: joined.approval } });
    }
    throw new LinkError("bad_action", "Unknown action.");
  } catch (error) {
    return errorResponse(error);
  }
}
