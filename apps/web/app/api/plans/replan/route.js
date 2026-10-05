/**
 * POST /api/plans/replan
 * Checks whether a study plan needs adjustment after a new attempt.
 * Returns { shouldReplan, reasons, suggestedItems[] }
 *
 * Body: { planDocumentId, learnerId, ownerUserId, workspaceId }
 */
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../../lib/supabaseClient.js";
import { ownerUserIdForFresh } from "../../../../lib/session.js";
import { denyUnlessOwner } from "../../../../lib/resourceAccess.js";
import { getSubjectStates } from "../../../../lib/studentStateRepository.js";
import { shouldReplan, planProgress } from "../../../../modules/plans/replanDetector.js";
import { selectResource, getDominantError } from "../../../../modules/performance/resourcePolicy.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(request) {
  try {
    const body = await request.json();
    const planDocumentId = String(body?.planDocumentId || "").trim();
    const learnerId      = String(body?.learnerId      || "").trim();
    const ownerUserId    = await ownerUserIdForFresh(request); // session account or the demo owner, never the body
    const workspaceId    = String(body?.workspaceId    || "").trim();

    if (!planDocumentId || !learnerId || !workspaceId) {
      return NextResponse.json({ shouldReplan: false, reason: "Missing parameters." });
    }

    const denied = await denyUnlessOwner(request, { workspaceId, documentId: planDocumentId });
    if (denied) return denied;

    const supabase = createSupabaseAdminClient();

    // 1. Fetch the plan document
    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .select("id, content, tags")
      .eq("id", planDocumentId)
      .maybeSingle();

    if (docErr || !doc) {
      return NextResponse.json({ shouldReplan: false, reason: "Plan document not found." });
    }

    let plan;
    try {
      plan = JSON.parse(String(doc.content || "{}"));
    } catch {
      return NextResponse.json({ shouldReplan: false, reason: "Could not parse plan." });
    }

    // 2. Get current concept states for this learner + workspace
    const { stateByConceptId } = await getSubjectStates(learnerId, workspaceId);

    // 3. Run the replan detector
    const detection = shouldReplan(
      { ...plan, items: Array.isArray(plan.items) ? plan.items : [] },
      stateByConceptId
    );

    if (!detection.shouldReplan) {
      return NextResponse.json({ shouldReplan: false });
    }

    // 4. Generate suggested new plan items for the weakest concepts
    const weakConcepts = Object.entries(stateByConceptId)
      .filter(([, s]) => (s.mastery ?? 0) < 0.6)
      .sort(([, a], [, b]) => (a.mastery ?? 0) - (b.mastery ?? 0))
      .slice(0, 3);

    // Fetch concept metadata
    const conceptIds = weakConcepts.map(([id]) => id);
    const { data: concepts } = conceptIds.length
      ? await supabase.from("concepts").select("id, name, topic, difficulty, importance").in("id", conceptIds)
      : { data: [] };

    const conceptById = {};
    for (const c of concepts || []) conceptById[c.id] = c;

    const examDate = plan.deadlines?.[0]?.date || plan.examDate || null;
    const daysUntilExam = examDate
      ? Math.max(0, (new Date(examDate) - Date.now()) / 86400000)
      : 365;

    const suggestedItems = weakConcepts
      .map(([conceptId, state]) => {
        const concept = conceptById[conceptId];
        if (!concept) return null;
        const rec = selectResource(state, { daysUntilExam });
        const today = new Date();
        const due   = new Date(today);
        due.setDate(today.getDate() + (daysUntilExam <= 3 ? 1 : daysUntilExam <= 7 ? 2 : 3));

        return {
          conceptId,
          conceptName: concept.name,
          topic:       concept.topic,
          kind:        rec.kind,
          minutes:     rec.durationMinutes,
          reason:      rec.reason,
          title:       `${rec.kind.replace(/_/g, " ")}: ${concept.name}`,
          dueDate:     due.toISOString().slice(0, 10),
          dominantError: getDominantError(state),
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      shouldReplan:   true,
      reasons:        detection.reasons,
      suggestedItems,
      progress:       planProgress(plan.items || [], examDate),
    });
  } catch (err) {
    console.error("[api/plans/replan]", err);
    return NextResponse.json({ shouldReplan: false, error: err.message }, { status: 500 });
  }
}
