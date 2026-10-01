/**
 * conceptsRepository — CRUD for the concepts knowledge graph.
 * Server-side only (uses admin client).
 */
import { createSupabaseAdminClient } from "./supabaseClient.js";
import { extractConcepts, insertPrerequisiteEdges } from "../modules/ai-tools/pipeline/conceptExtractor.js";

/**
 * Fetch all concepts for a workspace, optionally filtered by document.
 * @param {string} workspaceId
 * @param {object} [opts]
 *   @param {string} [opts.documentId]
 *   @param {string} [opts.ownerUserId]
 * @returns {Promise<object[]>}
 */
export async function getConcepts(workspaceId, opts = {}) {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("concepts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("importance", { ascending: false });

  if (opts.documentId)  query = query.eq("source_document_id", opts.documentId);
  if (opts.ownerUserId) query = query.eq("owner_user_id", opts.ownerUserId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Fetch the concept graph for a workspace: concepts + their prerequisites.
 * Returns { conceptById, prerequisites } where prerequisites is { conceptId: conceptId[] }.
 * @param {string} workspaceId
 * @returns {Promise<{ conceptById: object, prerequisites: object }>}
 */
export async function getConceptGraph(workspaceId) {
  const supabase = createSupabaseAdminClient();
  const [{ data: concepts, error: cErr }, { data: edges, error: eErr }] = await Promise.all([
    supabase.from("concepts").select("*").eq("workspace_id", workspaceId),
    supabase
      .from("concept_prerequisites")
      .select("concept_id, prerequisite_id, strength")
      .in("concept_id", (await supabase.from("concepts").select("id").eq("workspace_id", workspaceId)).data?.map((c) => c.id) || []),
  ]);

  if (cErr) throw new Error(cErr.message);

  const conceptById = {};
  for (const c of concepts || []) {
    conceptById[c.id] = { ...c, prerequisites: [], prerequisite_for: [] };
  }
  for (const edge of edges || []) {
    if (conceptById[edge.concept_id]) {
      conceptById[edge.concept_id].prerequisites.push(edge.prerequisite_id);
    }
    if (conceptById[edge.prerequisite_id]) {
      conceptById[edge.prerequisite_id].prerequisite_for = [
        ...(conceptById[edge.prerequisite_id].prerequisite_for || []),
        edge.concept_id,
      ];
    }
  }

  // Add is_prerequisite_for_count to each concept
  for (const c of Object.values(conceptById)) {
    c.is_prerequisite_for_count = (c.prerequisite_for || []).length;
  }

  return { conceptById, prerequisites: eErr ? {} : Object.fromEntries((edges || []).map((e) => [e.concept_id, e.prerequisite_id])) };
}

/**
 * Extract concepts from a document and save them to the DB.
 * Non-blocking — callers should await but not let it block the upload response.
 *
 * @param {string} documentId
 * @param {string} workspaceId
 * @param {string} ownerUserId
 * @param {string} documentText - full extracted text of the document
 */
export async function extractAndSaveConcepts(documentId, workspaceId, ownerUserId, documentText) {
  try {
    const supabase = createSupabaseAdminClient();

    // Delete any existing concepts for this document (idempotent re-extraction)
    await supabase.from("concepts").delete().eq("source_document_id", documentId);

    const { concepts } = await extractConcepts(documentText, { documentId, workspaceId, ownerUserId });
    if (!concepts.length) return;

    // Remove internal _prerequisite_names field before insert
    const rows = concepts.map(({ _prerequisite_names: _, ...rest }) => rest);

    const { data: inserted, error } = await supabase
      .from("concepts")
      .insert(rows)
      .select("id, name");

    if (error) {
      console.error("[conceptsRepository] Failed to insert concepts:", error.message);
      return;
    }

    // Re-attach prerequisite names to inserted rows for edge resolution
    const withNames = (inserted || []).map((row, i) => ({
      ...row,
      _prerequisite_names: concepts[i]?._prerequisite_names || [],
    }));

    await insertPrerequisiteEdges(withNames, supabase);
    console.log(`[conceptsRepository] Extracted ${inserted?.length} concepts from document ${documentId}`);
  } catch (err) {
    console.error("[conceptsRepository] Concept extraction failed:", err.message);
  }
}
