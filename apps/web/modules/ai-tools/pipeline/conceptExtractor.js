/**
 * conceptExtractor — extracts a knowledge graph from a reference document.
 *
 * Called at document upload time (async, non-blocking).
 * One structured-output call per document (~500–800 tokens for a typical study guide).
 * GPT-4o-mini is sufficient.
 */

const MODEL = process.env.LUNA_CONCEPT_MODEL || process.env.LUNA_AGENT_MODEL || "gpt-4o-mini";

const MAX_CONCEPTS = 20;
const MAX_DEPTH = 5;

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    concepts: {
      type: "array",
      description: `Concept TREE in pre-order (every concept appears AFTER its parent). First item is the single root. Maximum ${MAX_CONCEPTS}.`,
      maxItems: MAX_CONCEPTS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name:           { type: "string",  description: "Short, precise concept name (max 60 chars). Unique within the list." },
          parent:         { type: ["string", "null"], description: "EXACT name of this concept's single parent concept (the broader idea it is a part of). null ONLY for the root (first item)." },
          description:    { type: "string",  description: "One sentence: what this concept is." },
          topic:          { type: "string",  description: "Name of the level-2 branch this concept sits under (the root's own name for the root and for level-2 concepts)." },
          bloom_level:    { type: "string",  enum: ["remember", "understand", "apply", "analyse", "evaluate", "create"], description: "Highest Bloom's taxonomy level typically tested for this concept." },
          difficulty:     { type: "number",  description: "Estimated difficulty 0.0 (trivial) to 1.0 (expert-level)." },
          importance:     { type: "number",  description: "How central is this concept to the subject 0.0 to 1.0." },
          question_types: { type: "array",   items: { type: "string", enum: ["multiple_choice", "true_false", "open_text", "calculation", "matching", "fill_blanks", "flashcard"] }, description: "Question types that make sense for this concept." },
          source_pages:   { type: "array",   items: { type: "number" }, description: "Page numbers in the source document that cover this concept (empty if unknown)." },
        },
        required: ["name", "parent", "description", "topic", "bloom_level", "difficulty", "importance", "question_types", "source_pages"],
      },
    },
  },
  required: ["concepts"],
};

const SYSTEM_PROMPT = `You are a curriculum analyst. Turn an educational document into a CONCEPT TREE: an outline of the subject, exactly like a table of contents where each idea sits under the broader idea it belongs to.

THE TREE (hard rules):
1. Exactly ONE root: the overall subject. Its "parent" is null. It is the first item.
2. Every other concept has exactly ONE "parent": the exact name of a concept that appears EARLIER in the list. No exceptions, no cycles, no concept without a parent.
3. Depth: up to ${MAX_DEPTH} levels counting the root (root = level 1). Use the depth the material actually needs: most branches 3-4 levels, a few can reach 5 when the document drills down (e.g. a technique with a specific variant).
4. Level 2 = the 3-6 major areas of the subject. Level 3+ = the specific ideas, methods, formulas and skills inside each area.
5. A parent is a BROADER idea that CONTAINS its children ("Volatility" contains "Variance"). It is NOT "something you must learn first". Never use a sibling as a parent.
6. Group related things under one parent instead of listing them side by side. Do NOT make a flat list: if a parent would have more than 5 children, introduce an intermediate grouping concept.
7. At most ${MAX_CONCEPTS} concepts in total, including the root. Fewer is better; keep only distinct, testable ideas. Follow the document's own headings and structure when they exist.
   Spend the budget on DEPTH where the document drills down: the 2-3 richest areas should reach level 4 (and level 5 for a specialised variant) instead of every area stopping at level 3 with many siblings. Minor areas can stay short.
8. Names are short and specific ("Variance", not "Variance as a measure of data dispersion") and unique.
9. Output in PRE-ORDER: root, then the first level-2 area, then everything under it (depth first), then the next level-2 area, and so on.
10. "topic" = the name of the level-2 area the concept belongs to (for the root and for level-2 concepts, the root's own name).

EXAMPLE (Statistics) - this is the shape and depth expected:
  Statistics
    Sample explanation
      Mean
      Median
    Volatility
      Variance
      Standard deviation
    Variable correlation
      Correlation
      Covariance
      Conditional probabilities
        Pivot table
    Data transformation
      Log transformation
        Natural logarithm

As JSON, "Pivot table" has parent "Conditional probabilities", which has parent "Variable correlation", which has parent "Statistics" (the root, parent null).`;

/**
 * Guarantees a valid tree whatever the model returned: one root, one existing earlier parent per
 * concept, unique names, depth <= MAX_DEPTH, at most MAX_CONCEPTS. Because parents always precede
 * children, truncating the list can never orphan a node.
 */
function normalizeTree(items) {
  const out = [];
  const indexByName = new Map();
  const depth = [];
  for (const item of items) {
    const name = String(item?.name || "").trim();
    const key = name.toLowerCase();
    if (!name || indexByName.has(key)) continue;

    let parentIdx = -1;
    if (out.length > 0) {
      const wanted = String(item?.parent || "").trim().toLowerCase();
      parentIdx = indexByName.has(wanted) ? indexByName.get(wanted) : 0;
      while (depth[parentIdx] >= MAX_DEPTH) parentIdx = indexByName.get(String(out[parentIdx].parent || "").toLowerCase()) ?? 0;
    }

    indexByName.set(key, out.length);
    depth.push(parentIdx < 0 ? 1 : depth[parentIdx] + 1);
    out.push({ ...item, name, parent: parentIdx < 0 ? null : out[parentIdx].name });
    if (out.length >= MAX_CONCEPTS) break;
  }
  return out;
}

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
  const rawConcepts = normalizeTree(Array.isArray(raw.concepts) ? raw.concepts : []);

  // Shape into DB-ready rows (parent -> child edges are written after insert as
  // concept_prerequisites: prerequisite = parent, concept = child).
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
    _prerequisite_names: c.parent ? [c.parent] : [],
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
