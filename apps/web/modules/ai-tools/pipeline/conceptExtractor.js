/**
 * conceptExtractor — extracts a knowledge graph from a reference document.
 *
 * Called at document upload time (async, non-blocking).
 * One structured-output call per document (~500–800 tokens for a typical study guide).
 * GPT-4o-mini is sufficient.
 */

const MODEL = process.env.LUNA_CONCEPT_MODEL || process.env.LUNA_AGENT_MODEL || "gpt-4o-mini";

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    concepts: {
      type: "array",
      description: "All distinct, testable concepts found in the document.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name:           { type: "string",  description: "Short, precise concept name (max 60 chars)." },
          description:    { type: "string",  description: "One sentence: what this concept is." },
          topic:          { type: "string",  description: "The broader topic this concept belongs to (use headings from the document)." },
          bloom_level:    { type: "string",  enum: ["remember", "understand", "apply", "analyse", "evaluate", "create"], description: "Highest Bloom's taxonomy level typically tested for this concept." },
          difficulty:     { type: "number",  description: "Estimated difficulty 0.0 (trivial) to 1.0 (expert-level)." },
          importance:     { type: "number",  description: "How central is this concept to the subject 0.0 to 1.0." },
          question_types: { type: "array",   items: { type: "string", enum: ["multiple_choice", "true_false", "open_text", "calculation", "matching", "fill_blanks", "flashcard"] }, description: "Question types that make sense for this concept." },
          source_pages:   { type: "array",   items: { type: "number" }, description: "Page numbers in the source document that cover this concept (empty if unknown)." },
          prerequisites:  { type: "array",   items: { type: "string" }, description: "Names of OTHER concepts in this list that must be understood first. Use exact names." },
        },
        required: ["name", "description", "topic", "bloom_level", "difficulty", "importance", "question_types", "source_pages", "prerequisites"],
      },
    },
  },
  required: ["concepts"],
};

const SYSTEM_PROMPT = `You are a curriculum analyst. You read an educational document and identify the distinct, testable concepts it covers.

Rules:
- A concept is something a student could be directly tested on (not a chapter title or administrative heading).
- Each concept name should be specific and unique — "Photosynthesis" not "Biology", "Newton's Third Law" not "Physics laws".
- difficulty and importance are 0.0–1.0 floats.
- prerequisites: list only concepts that appear WITHIN THIS SAME DOCUMENT. Use exact names.
- Aim for 5–25 concepts per document. Do not over-fragment (definitions are not separate concepts) or under-fragment (a chapter is not one concept).
- source_pages: use 1-indexed page numbers. If you cannot determine them, use an empty array.`;

/**
 * Extract concepts from a document's text content.
 *
 * @param {string} documentText  - full text of the document (first 12,000 chars used)
 * @param {object} opts
 *   @param {string}  opts.documentId   - documents.id
 *   @param {string}  opts.workspaceId  - workspaces.id
 *   @param {string}  opts.ownerUserId
 *   @param {string}  [opts.apiKey]     - OpenAI key (falls back to process.env.OPENAI_API_KEY)
 * @returns {Promise<{ concepts: object[], raw: object }>}
 *   concepts: array ready to insert into the concepts table
 *   raw: raw LLM output for debugging
 */
export async function extractConcepts(documentText, opts = {}) {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("No OpenAI API key configured.");

  const truncated = String(documentText || "").slice(0, 12000);
  if (truncated.length < 100) return { concepts: [], raw: null };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: {
        type: "json_schema",
        json_schema: { name: "concept_extraction", strict: true, schema: EXTRACTION_SCHEMA },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `DOCUMENT TEXT:\n\n${truncated}` },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "Concept extraction LLM request failed");
  }

  const raw = JSON.parse(payload.choices?.[0]?.message?.content || "{}");
  const rawConcepts = Array.isArray(raw.concepts) ? raw.concepts : [];

  // Build a name → index map for resolving prerequisite names to indices
  const nameToIndex = {};
  rawConcepts.forEach((c, i) => { nameToIndex[c.name?.toLowerCase().trim()] = i; });

  // Shape into DB-ready rows (prerequisite IDs resolved after insert, stored as names for now)
  const concepts = rawConcepts.map((c) => ({
    source_document_id: opts.documentId || null,
    workspace_id:       opts.workspaceId || null,
    owner_user_id:      opts.ownerUserId || null,
    name:               String(c.name || "").slice(0, 120),
    description:        String(c.description || "").slice(0, 500),
    topic:              String(c.topic || "").slice(0, 120),
    bloom_level:        c.bloom_level || "understand",
    difficulty:         Math.min(1, Math.max(0, Number(c.difficulty) || 0.5)),
    importance:         Math.min(1, Math.max(0, Number(c.importance) || 0.5)),
    question_types:     Array.isArray(c.question_types) ? c.question_types : [],
    source_pages:       Array.isArray(c.source_pages) ? c.source_pages.map(Number).filter(Boolean) : [],
    // prerequisite names carried forward; resolved to UUIDs after DB insert
    _prerequisite_names: Array.isArray(c.prerequisites) ? c.prerequisites : [],
  }));

  return { concepts, raw };
}

/**
 * After inserting concepts, resolve prerequisite names to concept IDs and insert edges.
 *
 * @param {object[]} insertedConcepts - concepts rows that now have .id and .name
 * @param {object}   supabase - admin supabase client
 */
export async function insertPrerequisiteEdges(insertedConcepts, supabase) {
  const nameToId = {};
  for (const c of insertedConcepts) {
    nameToId[c.name.toLowerCase().trim()] = c.id;
  }

  const edges = [];
  for (const c of insertedConcepts) {
    for (const prereqName of (c._prerequisite_names || [])) {
      const prereqId = nameToId[prereqName.toLowerCase().trim()];
      if (prereqId && prereqId !== c.id) {
        edges.push({ concept_id: c.id, prerequisite_id: prereqId, strength: 1.0 });
      }
    }
  }

  if (!edges.length) return;

  const { error } = await supabase
    .from("concept_prerequisites")
    .upsert(edges, { onConflict: "concept_id,prerequisite_id" });

  if (error) console.warn("[conceptExtractor] Failed to insert prerequisite edges:", error.message);
}
