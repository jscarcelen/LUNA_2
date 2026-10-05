/**
 * GET /api/student/patterns?learnerId=&workspaceId=
 * Returns detected transversal skill patterns for a learner in a workspace.
 */
import { NextResponse } from "next/server";
import { denyUnlessOwner } from "../../../../lib/resourceAccess.js";
import { getSubjectStates } from "../../../../lib/studentStateRepository.js";
import { getConceptGraph } from "../../../../lib/conceptsRepository.js";
import { detectTransversalPatterns } from "../../../../modules/performance/patternDetector.js";

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

    const denied = await denyUnlessOwner(request, { workspaceId });
    if (denied) return denied;

    const [{ stateByConceptId }, { conceptById }] = await Promise.all([
      getSubjectStates(learnerId, workspaceId),
      getConceptGraph(workspaceId),
    ]);

    const patterns = detectTransversalPatterns(stateByConceptId, conceptById);

    return NextResponse.json({ patterns });
  } catch (err) {
    console.error("[api/student/patterns]", err);
    return NextResponse.json(
      { error: err.message || "Failed to detect patterns." },
      { status: 500 }
    );
  }
}
