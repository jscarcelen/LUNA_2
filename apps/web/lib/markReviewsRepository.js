/**
 * Human review of AI marks. A student asks for one question's mark to be looked at again; a teacher linked to that student
 * (teacher_student link only: parents can read, peers see nothing) confirms the mark or overrides it. An override replaces the
 * stored result, so the student's score and mastery data follow what the teacher decided.
 * Needs migration 202610130004_mark_reviews.sql (until then every call fails with isSetupNeededError-style errors the routes map to 503).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { findAccountById, getAcceptedLink } from "./accountsRepository.js";
import { hasGuardianPowers } from "./accountsCore.js";

export const MARK_REVIEWS_MIGRATION = "202610130004_mark_reviews.sql";
const COLUMNS = "id, owner_user_id, activity_document_id, question_id, question_prompt, given, expected, ai_correct, status, student_note, final_correct, teacher_note, reviewer_id, requested_at, reviewed_at";
const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export const isReviewsTableMissing = (error) => /mark_reviews/.test(String(error?.message || "")) && /does not exist|schema cache|relation/i.test(String(error?.message || ""));

export class ReviewError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

/** The student asks for a review of one question (asking again updates the note and re-opens it). */
export async function requestReview(studentId, { activityDocumentId, questionId, questionPrompt, given, expected, aiCorrect, note }) {
  const doc = clip(activityDocumentId, 80);
  const question = clip(questionId, 120);
  if (!doc || !question) throw new ReviewError("Say which question you want reviewed.");
  const row = {
    owner_user_id: studentId,
    activity_document_id: doc,
    question_id: question,
    question_prompt: clip(questionPrompt, 500),
    given: clip(given, 500),
    expected: clip(expected, 500),
    ai_correct: typeof aiCorrect === "boolean" ? aiCorrect : null,
    student_note: clip(note, 500),
    status: "requested",
    final_correct: null,
    teacher_note: null,
    reviewer_id: null,
    reviewed_at: null,
    requested_at: new Date().toISOString()
  };
  const { data, error } = await createSupabaseAdminClient().from("mark_reviews").upsert(row, { onConflict: "owner_user_id,activity_document_id,question_id" }).select(COLUMNS).single();
  if (error) throw error;
  return data;
}

/** A student's own reviews of one activity (so the results screen can show "asked" / "teacher said"). */
export async function listOwnReviews(studentId, activityDocumentId) {
  const { data, error } = await createSupabaseAdminClient().from("mark_reviews").select(COLUMNS).eq("owner_user_id", studentId).eq("activity_document_id", clip(activityDocumentId, 80));
  if (error) throw error;
  return data || [];
}

async function assertViewerOfStudent(viewer, studentId, { mustDecide = false } = {}) {
  if (viewer.role !== "teacher" && viewer.role !== "parent") throw new ReviewError("That student is not connected to you.", 404);
  if (mustDecide && viewer.role !== "teacher") throw new ReviewError("Only a teacher can review a mark.", 403);
  const student = await findAccountById(studentId);
  if (!student || student.role !== "student") throw new ReviewError("That student is not connected to you.", 404);
  const link = await getAcceptedLink(viewer.id, student.id);
  if (!hasGuardianPowers(link, viewer.role, student.role)) throw new ReviewError("That student is not connected to you.", 404);
  return student;
}

/** Reviews of a linked student, open ones first. */
export async function listStudentReviews(viewer, studentId) {
  await assertViewerOfStudent(viewer, studentId);
  const { data, error } = await createSupabaseAdminClient().from("mark_reviews").select(COLUMNS).eq("owner_user_id", studentId).order("requested_at", { ascending: false }).limit(100);
  if (error) throw error;
  return [...(data || [])].sort((a, b) => Number(b.status === "requested") - Number(a.status === "requested"));
}

/**
 * The teacher's decision. `correct` true/false = what counts from now on; it is "confirmed" when it equals the AI mark, else "overridden".
 * The student's stored result and attempt score are updated to match.
 */
export async function decideReview(viewer, reviewId, { correct, note }) {
  if (typeof correct !== "boolean") throw new ReviewError("Choose right or wrong.");
  const client = createSupabaseAdminClient();
  const { data: review, error } = await client.from("mark_reviews").select(COLUMNS).eq("id", clip(reviewId, 80)).maybeSingle();
  if (error) throw error;
  if (!review) throw new ReviewError("That review does not exist.", 404);
  await assertViewerOfStudent(viewer, review.owner_user_id, { mustDecide: true });
  const status = review.ai_correct === correct ? "confirmed" : "overridden";
  const { data: updated, error: updateError } = await client.from("mark_reviews")
    .update({ status, final_correct: correct, teacher_note: clip(note, 500), reviewer_id: viewer.id, reviewed_at: new Date().toISOString() })
    .eq("id", review.id).select(COLUMNS).single();
  if (updateError) throw updateError;
  if (status === "overridden") await applyOverride(client, updated);
  return updated;
}

/** Best effort: the latest stored attempt of that activity takes the teacher's mark for that question. */
async function applyOverride(client, review) {
  try {
    const { data: attempts } = await client.from("attempts").select("id, total").eq("owner_user_id", review.owner_user_id).eq("activity_document_id", review.activity_document_id).order("at", { ascending: false }).limit(1);
    const attempt = attempts?.[0];
    if (!attempt) return;
    const patch = { correct: review.final_correct };
    if (review.final_correct) { patch.error_type = null; patch.error_severity = null; patch.failed_skill = null; }
    let { error } = await client.from("attempt_results").update(patch).eq("attempt_id", attempt.id).eq("question_id", review.question_id);
    if (error && /failed_skill/.test(String(error.message))) {
      delete patch.failed_skill;
      ({ error } = await client.from("attempt_results").update(patch).eq("attempt_id", attempt.id).eq("question_id", review.question_id));
    }
    if (error) return;
    const { data: rows } = await client.from("attempt_results").select("correct").eq("attempt_id", attempt.id);
    const total = attempt.total || rows?.length || 0;
    if (total > 0) await client.from("attempts").update({ score: (rows || []).filter((row) => row.correct).length / total }).eq("id", attempt.id);
  } catch (error) {
    console.warn("[markReviews] could not update the stored result:", error?.message || error);
  }
}
