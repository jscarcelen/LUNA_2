/**
 * Who may read a student's concepts and mastery. Two cases:
 *  - no `studentId` in the request: the signed-in account reads its own data (workspace ownership is checked by
 *    `denyUnlessOwner`, as before); the client-side learner id ("anonymous") is never used;
 *  - a `studentId`: the read-only student performance view of a teacher or parent. Allowed only through the same
 *    accepted teacher_student / parent_student link that opens `/api/accounts/linked/workspaces`, and only for a
 *    workspace that belongs to that student. Every refusal is the same 404 as "no such item".
 * The pure decision is separate from the lookups so it can be tested without a database.
 */
import { NextResponse } from "next/server";
import { hasGuardianPowers } from "./accountsCore.js";
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { freshSessionFromRequest } from "./session.js";
import { findAccountById, getAcceptedLink } from "./accountsRepository.js";

/**
 * @param {{ viewer: {id: string, role: string}|null, student: {id: string, role: string}|null, link: object|null, workspaceOwnerId: string|null }} facts
 * @returns {{ ok: true, ownerUserId: string } | { ok: false, status: number, error: string }}
 */
export function decideLinkedStudentRead({ viewer, student, link, workspaceOwnerId }) {
  const refuse = { ok: false, status: 404, error: "That student is not connected to you." };
  if (!viewer || !student) return refuse;
  if (viewer.id === student.id) return refuse; // reading yourself never goes through this door
  if (!hasGuardianPowers(link, viewer.role, student.role)) return refuse;
  if (!workspaceOwnerId || workspaceOwnerId !== student.id) return refuse;
  return { ok: true, ownerUserId: student.id };
}

/**
 * For a request that names `studentId`: `{ ownerUserId }` when the signed-in teacher/parent may read that student's
 * workspace, or `{ response }` (404/401) when not. Returns null when the request names no student.
 */
export async function resolveLinkedStudentRead(request, { studentId, workspaceId }) {
  const wanted = String(studentId || "").trim();
  if (!wanted) return null;
  const session = await freshSessionFromRequest(request);
  const viewer = session ? await findAccountById(session.accountId) : null;
  const student = viewer ? await findAccountById(wanted) : null;
  const link = viewer && student ? await getAcceptedLink(viewer.id, student.id) : null;
  let workspaceOwnerId = null;
  if (viewer && student && workspaceId) {
    const { data, error } = await createSupabaseAdminClient().from("workspaces").select("owner_user_id").eq("id", workspaceId).maybeSingle();
    if (error) throw error;
    workspaceOwnerId = data?.owner_user_id || null;
  }
  if (!viewer) return { response: NextResponse.json({ error: "Please log in." }, { status: 401 }) };
  const verdict = decideLinkedStudentRead({ viewer, student, link, workspaceOwnerId });
  if (!verdict.ok) return { response: NextResponse.json({ error: verdict.error }, { status: verdict.status }) };
  return { ownerUserId: verdict.ownerUserId };
}
