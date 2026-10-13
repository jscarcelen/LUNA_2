/**
 * GET /api/student/patterns?workspaceId=
 * Returns detected transversal skill patterns for the signed-in owner (session account or demo owner; a learnerId param is ignored) in a workspace.
 */
import { NextResponse } from "next/server";
import { denyUnlessOwner } from "../../../../lib/resourceAccess.js";
import { ownerUserIdForFresh } from "../../../../lib/session.js";
import { getSubjectStates } from "../../../../lib/studentStateRepository.js";
import { getConceptGraph } from "../../../../lib/conceptsRepository.js";
import { detectTransversalPatterns } from "../../../../modules/performance/patternDetector.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const workspaceId = String(searchParams.get("workspaceId") || "").trim();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required." },
        { status: 400 }
      );
    }

    const denied = await denyUnlessOwner(request, { workspaceId });
    if (denied) return denied;

    const [{ stateByConceptId }, { conceptById }] = await Promise.all([
      getSubjectStates(await ownerUserIdForFresh(request), workspaceId),
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
