/**
 * GET /api/student/recommendations?workspaceId=&examDate=&topN=
 * Returns today's recommended study items for the signed-in owner (session account or demo owner; a learnerId param is ignored), ranked by priority.
 *
 * Each item includes:
 *   concept { id, name, topic, difficulty, importance }
 *   state   { mastery, attempts_total, dominant_error, next_review_at, ... }
 *   priority  (0–1+)
 *   recommended { kind, durationMinutes, reason }
 */
import { NextResponse } from "next/server";
import { denyUnlessOwner } from "../../../../lib/resourceAccess.js";
import { ownerUserIdForFresh } from "../../../../lib/session.js";
import { getRecommendations } from "../../../../lib/studentStateRepository.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = String(searchParams.get("workspaceId") || "").trim();
    const examDate    = searchParams.get("examDate") || null;
    const topN        = Math.min(10, Math.max(1, Number(searchParams.get("topN") || 5)));

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required." },
        { status: 400 }
      );
    }

    const denied = await denyUnlessOwner(request, { workspaceId });
    if (denied) return denied;

    const recommendations = await getRecommendations(await ownerUserIdForFresh(request), workspaceId, { examDate, topN });

    return NextResponse.json({ recommendations });
  } catch (err) {
    console.error("[api/student/recommendations]", err);
    return NextResponse.json(
      { error: err.message || "Failed to fetch recommendations." },
      { status: 500 }
    );
  }
}
