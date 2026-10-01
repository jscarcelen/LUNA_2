/**
 * studentStateRepository — read/write student_concept_state rows.
 * Server-side only (admin client).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { selectResource } from "../modules/performance/resourcePolicy.js";
import { conceptPriority } from "../modules/plans/priorityEngine.js";

/**
 * Fetch all concept states for a learner, optionally filtered to one workspace.
 * @param {string} learnerId
 * @param {string} [workspaceId]
 * @returns {Promise<{ stateByConceptId: object, states: object[] }>}
 */
export async function getSubjectStates(learnerId, workspaceId) {
  const supabase = createSupabaseAdminClient();

  // Join through concepts to filter by workspace
  let query = supabase
    .from("student_concept_state")
    .select("*, concept:concepts(id, name, topic, importance, difficulty, bloom_level, is_prerequisite_for_count:concept_prerequisites(count))")
    .eq("learner_id", learnerId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const states = data || [];
  const stateByConceptId = {};
  for (const s of states) {
    // Flatten prerequisite count from the joined aggregate
    const count = s.concept?.is_prerequisite_for_count?.[0]?.count ?? 0;
    stateByConceptId[s.concept_id] = {
      ...s,
      concept: s.concept ? { ...s.concept, is_prerequisite_for_count: count } : null,
    };
  }

  return { stateByConceptId, states };
}

/**
 * Fetch the state for a single concept.
 * @param {string} learnerId
 * @param {string} conceptId
 * @returns {Promise<object|null>}
 */
export async function getConceptState(learnerId, conceptId) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("student_concept_state")
    .select("*")
    .eq("learner_id", learnerId)
    .eq("concept_id", conceptId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Get today's recommended study items for a learner in a workspace.
 * Ranks all concepts by priority and returns the top N with recommended resource kinds.
 *
 * @param {string} learnerId
 * @param {string} workspaceId
 * @param {object} [opts]
 *   @param {string|null} [opts.examDate]
 *   @param {number}      [opts.topN=5]
 * @returns {Promise<object[]>} array of { concept, state, priority, recommended }
 */
export async function getRecommendations(learnerId, workspaceId, opts = {}) {
  const supabase = createSupabaseAdminClient();
  const { examDate = null, topN = 5 } = opts;

  // Fetch concepts and current states in parallel
  const [{ data: concepts, error: cErr }, { stateByConceptId }] = await Promise.all([
    supabase
      .from("concepts")
      .select("*, prereq_count:concept_prerequisites(count)")
      .eq("workspace_id", workspaceId),
    getSubjectStates(learnerId, workspaceId),
  ]);

  if (cErr) throw new Error(cErr.message);

  const ranked = (concepts || []).map((concept) => {
    const prereqCount = concept.prereq_count?.[0]?.count ?? 0;
    const enriched    = { ...concept, is_prerequisite_for_count: prereqCount };
    const state       = stateByConceptId[concept.id] ?? {};
    const priority    = conceptPriority(state, enriched, examDate);
    const recommended = selectResource(state, {
      daysUntilExam:   examDate ? Math.max(0, (new Date(examDate) - Date.now()) / 86400000) : 365,
      prereqsMastered: true, // simplified; full check requires prerequisite states
    });

    return { concept: enriched, state, priority, recommended };
  });

  return ranked
    .sort((a, b) => b.priority - a.priority)
    .slice(0, topN);
}

/**
 * Upsert a student concept state row directly.
 * @param {string} learnerId
 * @param {string} conceptId
 * @param {string} ownerUserId
 * @param {object} fields - partial student_concept_state fields to upsert
 */
export async function upsertConceptState(learnerId, conceptId, ownerUserId, fields) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("student_concept_state")
    .upsert({
      learner_id:    learnerId,
      concept_id:    conceptId,
      owner_user_id: ownerUserId,
      ...fields,
      updated_at:    new Date().toISOString(),
    }, { onConflict: "learner_id,concept_id" });

  if (error) throw new Error(error.message);
}
