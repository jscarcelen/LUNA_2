/**
 * attemptsRepository — persist attempt data to the new relational tables.
 *
 * Server-side only (admin client). Dual-writes during transition:
 * the caller still saves the JSON blob document; this adds the relational rows.
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { classifyError } from "../modules/performance/errors.js";
import { updateConceptState } from "../modules/performance/masteryEngine.js";

/**
 * Save a graded attempt and its per-question results.
 * Also updates student_concept_state for each concept that has a question mapping.
 *
 * @param {object} attempt      - graded Attempt object from gradeActivity()
 * @param {object} context
 *   @param {string}  context.learnerId          - localStorage learner ID string
 *   @param {string}  context.ownerUserId
 *   @param {string}  context.activityDocumentId - documents.id of the activity
 *   @param {string}  [context.subjectId]
 * @returns {Promise<{ attemptId: string|null, error: string|null }>}
 */
export async function saveAttempt(attempt, context = {}) {
  const supabase = createSupabaseAdminClient();
  const { learnerId, ownerUserId, activityDocumentId, subjectId } = context;

  if (!learnerId || !ownerUserId || !activityDocumentId) {
    return { attemptId: null, error: "Missing required context (learnerId, ownerUserId, activityDocumentId)" };
  }

  // 1. Insert the attempt header
  const { data: attemptRow, error: attemptErr } = await supabase
    .from("attempts")
    .insert({
      owner_user_id:        ownerUserId,
      learner_id:           learnerId,
      activity_document_id: activityDocumentId,
      subject_id:           subjectId || null,
      at:                   attempt.at || new Date().toISOString(),
      score:                attempt.total > 0 ? attempt.score / attempt.total : null,
      total:                attempt.total,
      duration_ms:          attempt.durationMs || null,
    })
    .select("id")
    .single();

  if (attemptErr) {
    console.error("[attemptsRepository] Failed to insert attempt:", attemptErr.message);
    return { attemptId: null, error: attemptErr.message };
  }

  const attemptId = attemptRow.id;

  // 2. Look up concept IDs for questions in this activity (best-effort; no failure if missing)
  const questionIds = attempt.results.map((r) => r.id);
  const { data: mappings } = await supabase
    .from("question_concept_map")
    .select("question_id, concept_id")
    .eq("activity_document_id", activityDocumentId)
    .in("question_id", questionIds);

  const conceptByQuestion = {};
  for (const m of mappings || []) {
    conceptByQuestion[m.question_id] = m.concept_id;
  }

  // 3. Insert per-question results with persisted error classification
  const resultRows = attempt.results.map((r) => {
    const errorType = r.correct === false
      ? classifyError({
          kind:       r.kind,
          correct:    r.correct,
          confidence: r.confidence,
          ms:         r.ms,
          given:      r.given,
          expected:   r.expected,
          skill:      r.skill,
        })
      : null;

    return {
      attempt_id:     attemptId,
      question_id:    r.id,
      question_prompt: String(r.prompt || "").slice(0, 500),
      concept_id:     conceptByQuestion[r.id] || null,
      topic:          r.topic || null,
      difficulty:     r.difficulty || null,
      skill:          r.skill || null,
      correct:        r.correct,
      given:          String(r.given ?? "").slice(0, 500),
      expected:       String(r.expected ?? "").slice(0, 500),
      duration_ms:    r.ms || null,
      confidence:     r.confidence || null,
      error_type:     errorType,
      error_severity: errorType ? 0.7 : null, // simplified; could be refined later
    };
  });

  const { error: resultsErr } = await supabase.from("attempt_results").insert(resultRows);
  if (resultsErr) {
    console.warn("[attemptsRepository] Failed to insert attempt_results:", resultsErr.message);
  }

  // 4. Update student_concept_state for each concept touched
  const conceptIds = [...new Set(resultRows.map((r) => r.concept_id).filter(Boolean))];
  if (conceptIds.length > 0) {
    await updateConceptStatesFromResults(
      supabase,
      learnerId,
      ownerUserId,
      conceptIds,
      resultRows,
      activityDocumentId
    );
  }

  return { attemptId, error: null };
}

/**
 * Internal: update student_concept_state rows for each concept touched in this attempt.
 */
async function updateConceptStatesFromResults(
  supabase,
  learnerId,
  ownerUserId,
  conceptIds,
  resultRows,
  activityDocumentId
) {
  // Fetch existing states and concept metadata in parallel
  const [{ data: existingStates }, { data: concepts }] = await Promise.all([
    supabase
      .from("student_concept_state")
      .select("*")
      .eq("learner_id", learnerId)
      .in("concept_id", conceptIds),
    supabase
      .from("concepts")
      .select("id, difficulty")
      .in("id", conceptIds),
  ]);

  const stateByConceptId = {};
  for (const s of existingStates || []) {
    stateByConceptId[s.concept_id] = s;
  }
  const difficultyByConceptId = {};
  for (const c of concepts || []) {
    difficultyByConceptId[c.id] = c.difficulty;
  }

  // Group results by concept
  const resultsByConceptId = {};
  for (const r of resultRows) {
    if (!r.concept_id) continue;
    if (!resultsByConceptId[r.concept_id]) resultsByConceptId[r.concept_id] = [];
    resultsByConceptId[r.concept_id].push(r);
  }

  const upserts = [];
  for (const conceptId of conceptIds) {
    const results = resultsByConceptId[conceptId] || [];
    const prev    = stateByConceptId[conceptId] ?? {};

    // Merge all results for this concept in this attempt
    let state = { ...prev };
    for (const r of results) {
      state = {
        ...state,
        ...updateConceptState(state, {
          correct:    r.correct,
          confidence: r.confidence,
          error_type: r.error_type,
          _concept_difficulty: difficultyByConceptId[conceptId] ?? 0.5,
        }),
      };
    }

    upserts.push({
      learner_id:    learnerId,
      concept_id:    conceptId,
      owner_user_id: ownerUserId,
      ...state,
    });
  }

  if (upserts.length > 0) {
    const { error } = await supabase
      .from("student_concept_state")
      .upsert(upserts, { onConflict: "learner_id,concept_id" });
    if (error) {
      console.warn("[attemptsRepository] Failed to upsert student_concept_state:", error.message);
    }
  }
}

/**
 * Fetch all attempts for a learner, optionally filtered by subject.
 * @param {string} learnerId
 * @param {object} [opts]
 *   @param {string} [opts.subjectId]
 *   @param {number} [opts.limit=50]
 * @returns {Promise<object[]>}
 */
export async function getAttempts(learnerId, opts = {}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("attempts")
    .select("*, attempt_results(*)")
    .eq("learner_id", learnerId)
    .order("at", { ascending: false })
    .limit(opts.limit ?? 50);

  if (opts.subjectId) query = query.eq("subject_id", opts.subjectId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}
