/**
 * GET /api/student/mastery?learnerId=&workspaceId=
 * Returns all student_concept_state rows for a learner in a workspace,
 * enriched with concept metadata.
 */
import { NextResponse } from "next/server";
import { getSubjectStates } from "../../../../lib/studentStateRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const learnerId   = String(searchParams.get("learnerId")   || "").trim();
    const workspaceId = String(searchParams.get("workspaceId") || "").trim();

    if (!learnerId || !workspaceId) {
      return NextResponse.json(
        { error: "learnerId and workspaceId are required." },
        { status: 400 }
      );
    }

    const { stateByConceptId, states } = await getSubjectStates(learnerId, workspaceId);

    // Summary statistics
    const masteries = states.map((s) => s.mastery ?? 0);
    const avgMastery = masteries.length
      ? masteries.reduce((a, b) => a + b, 0) / masteries.length
      : 0;

    const dueForReview = states.filter(
      (s) => s.next_review_at && new Date(s.next_review_at) <= new Date()
    ).length;

    return NextResponse.json({
      states,
      stateByConceptId,
      summary: {
        conceptCount:  states.length,
        avgMastery:    Math.round(avgMastery * 100) / 100,
        dueForReview,
        masteredCount: states.filter((s) => (s.mastery ?? 0) >= 0.8).length,
        weakCount:     states.filter((s) => (s.mastery ?? 0) < 0.5).length,
      },
    });
  } catch (err) {
    console.error("[api/student/mastery]", err);
    return NextResponse.json({ error: err.message || "Failed to fetch mastery." }, { status: 500 });
  }
}
