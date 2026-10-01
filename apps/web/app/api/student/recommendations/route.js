/**
 * GET /api/student/recommendations?learnerId=&workspaceId=&examDate=&topN=
 * Returns today's recommended study items for a learner, ranked by priority.
 *
 * Each item includes:
 *   concept { id, name, topic, difficulty, importance }
 *   state   { mastery, attempts_total, dominant_error, next_review_at, ... }
 *   priority  (0–1+)
 *   recommended { kind, durationMinutes, reason }
 */
import { NextResponse } from "next/server";
import { getRecommendations } from "../../../../lib/studentStateRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const learnerId   = String(searchParams.get("learnerId")   || "").trim();
    const workspaceId = String(searchParams.get("workspaceId") || "").trim();
    const examDate    = searchParams.get("examDate") || null;
    const topN        = Math.min(10, Math.max(1, Number(searchParams.get("topN") || 5)));

    if (!learnerId || !workspaceId) {
      return NextResponse.json(
        { error: "learnerId and workspaceId are required." },
        { status: 400 }
      );
    }

    const recommendations = await getRecommendations(learnerId, workspaceId, { examDate, topN });

    return NextResponse.json({ recommendations });
  } catch (err) {
    console.error("[api/student/recommendations]", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch recommendations." },
      { status: 500 }
    );
  }
}
