/**
 * studentStateRepository — read/write student_concept_state rows.
 * Server-side only (admin client).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { selectResource } from "../modules/performance/resourcePolicy.js";
import { conceptPriority } from "../modules/plans/priorityEngine.js";

// concept_prerequisites points at concepts twice (concept_id, prerequisite_id), so every embed names its foreign key.
// "Is a prerequisite for" = rows whose prerequisite_id is this concept.
const PREREQ_FOR_COUNT = "concept_prerequisites!concept_prerequisites_prerequisite_id_fkey(count)";

/**
 * Fetch the concept states of one owner (an account, or the demo owner) in one workspace.
 * Rows are scoped by owner_user_id, which the server sets from the session when an attempt is saved;
 * the client-side learner id ("anonymous" for most browsers) is never used to decide whose data is read.
 * @param {string} ownerUserId  from ownerUserIdFor / ownerUserIdForFresh, never from the request
 * @param {string} workspaceId
 * @returns {Promise<{ stateByConceptId: object, states: object[] }>}
 */
export async function getSubjectStates(ownerUserId, workspaceId) {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("student_concept_state")
    .select(`*, concept:concepts!inner(id, workspace_id, name, topic, importance, difficulty, bloom_level, is_prerequisite_for_count:${PREREQ_FOR_COUNT})`)
    .eq("owner_user_id", ownerUserId)
    .eq("concept.workspace_id", workspaceId);
  if (error) throw new Error(error.message);

  // One row per concept: the demo owner can hold several browser learner ids, keep the most recent.
  const latest = new Map();
  for (const row of data || []) {
    const kept = latest.get(row.concept_id);
    if (!kept || String(row.updated_at || "") > String(kept.updated_at || "")) latest.set(row.concept_id, row);
  }
  const states = [...latest.values()];
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
 * @param {string} ownerUserId  from the session, never from the request
 * @param {string} workspaceId
 * @param {object} [opts]
 *   @param {string|null} [opts.examDate]
 *   @param {number}      [opts.topN=5]
 * @returns {Promise<object[]>} array of { concept, state, priority, recommended }
 */
export async function getRecommendations(ownerUserId, workspaceId, opts = {}) {
  const supabase = createSupabaseAdminClient();
  const { examDate = null, topN = 5 } = opts;

  // Fetch concepts and current states in parallel
  const [{ data: concepts, error: cErr }, { stateByConceptId }] = await Promise.all([
    supabase
      .from("concepts")
      .select(`*, prereq_count:${PREREQ_FOR_COUNT}`)
      .eq("workspace_id", workspaceId),
    getSubjectStates(ownerUserId, workspaceId),
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
