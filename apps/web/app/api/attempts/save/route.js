/**
 * POST /api/attempts/save
 * Saves a graded attempt to the relational DB tables (attempts + attempt_results + student_concept_state).
 * Called non-blocking from the client after ActivityPlayer submits.
 *
 * Body: { attempt, learnerId, ownerUserId, activityDocumentId, subjectId? }
 */
import { NextResponse } from "next/server";
import { saveAttempt } from "../../../../lib/attemptsRepository.js";
import { ownerUserIdFor } from "../../../../lib/session.js";
import { denyUnlessOwner } from "../../../../lib/resourceAccess.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const { attempt, learnerId, activityDocumentId, subjectId } = body;

    if (!attempt || !learnerId || !activityDocumentId) {
      return NextResponse.json(
        { error: "attempt, learnerId, and activityDocumentId are required." },
        { status: 400 }
      );
    }

    // The owner comes from the session (a real account) or is the demo owner; a body value is never trusted.
    const resolvedOwner = ownerUserIdFor(request);
    const denied = await denyUnlessOwner(request, { documentId: String(activityDocumentId) });
    if (denied) return denied;

    const result = await saveAttempt(attempt, {
      learnerId:           String(learnerId),
      ownerUserId:         resolvedOwner,
      activityDocumentId:  String(activityDocumentId),
      subjectId:           subjectId || null,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ attemptId: result.attemptId, saved: true });
  } catch (err) {
    console.error("[api/attempts/save]", err);
    return NextResponse.json({ error: err.message || "Save failed." }, { status: 500 });
  }
}
