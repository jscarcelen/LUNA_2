/**
 * POST /api/activities/grade
 *
 * Marks the written (open) answers of one attempt with a model, in ONE call.
 *
 * Body: { items: [{ id, question, expectedAnswer, givenAnswer, context?, skill?, topic?, qkind?, options?, skills?, steps?,
 *                    work?: { text, image (downscaled data URL), full } }], language? }
 *       A wrong answer that comes with working is always read by the model, which also names the skill that failed.
 *       (or a single { question, expectedAnswer, givenAnswer, context?, language? }).
 * Reply: { graded: "ai" | "local" | "mixed", results: [{ id, verdict: "correct" | "close" | "incorrect",
 *          score 0..1, makesSense, feedback, errorCause: "knowledge" | "analytical" | "accuracy" | null,
 *          quantitative, causeReason, failedSkill (a skills-taxonomy id or ""), workVerdict, graded: "ai" | "local" }], model, usage, note }
 *
 * Blank, identical and number-for-number answers are settled without the model; with no OPENAI_API_KEY
 * or if the model call fails everything is graded by the local comparison and says `graded: "local"`.
 * The route never answers with an error for a grading problem: the learner must not be blocked.
 */
import { NextResponse } from "next/server";
import { MAX_ITEMS, gradeAnswers } from "../../../../modules/activities/gradeBatch.js";
import { denyAnonymousAi } from "../../../../lib/aiAccess.js";
import { meteredAi } from "../../../../lib/aiUsage.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = meteredAi("grading", async function POST(request) {
  const blocked = await denyAnonymousAi(request);
  if (blocked) return blocked;
  let body = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with the answers to check." }, { status: 400 });
  }
  const single = body && !Array.isArray(body) && !Array.isArray(body.items);
  const items = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : body ? [body] : [];
  if (!items.length) return NextResponse.json({ error: "No answers to check." }, { status: 400 });
  const language = String(body?.language || (single ? "" : items[0]?.language) || "").trim().slice(0, 40);

  try {
    const graded = await gradeAnswers(items.slice(0, MAX_ITEMS), { language });
    return NextResponse.json({ ...graded, ...(single ? { result: graded.results[0] } : {}), count: graded.results.length });
  } catch (error) {
    // Grading must never be what breaks the player: say it could not be done and let the client grade locally.
    return NextResponse.json({ graded: "local", results: [], note: String(error?.message || "The checker is not available.").slice(0, 200) });
  }
});
