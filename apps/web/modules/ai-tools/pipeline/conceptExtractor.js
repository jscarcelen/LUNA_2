/**
 * conceptExtractor — extracts a knowledge graph from a reference document.
 *
 * Called at document upload time (async, non-blocking).
 * One structured-output call per document (~500–800 tokens for a typical study guide).
 * GPT-4o-mini is sufficient.
 */

const MODEL = process.env.LUNA_CONCEPT_MODEL || process.env.LUNA_AGENT_MODEL || "gpt-4o";

const MAX_CONCEPTS = 20;
const MAX_DEPTH = 6;

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

const SYSTEM_PROMPT = `You are a curriculum analyst. Turn the educational document in the user message into a CONCEPT TREE: a MECE decomposition of the subject into the knowledge and skills a student can be tested on and whose mastery can be tracked. Return the JSON schema you are given, with the concepts in pre-order.

<what_counts_as_a_concept>
Every node must pass the tracking test: "Could a teacher write a question about this, and could a student get it right or wrong?" A node that fails the test stays out of the tree, because the platform tracks mastery per concept and an untestable node can never be marked right or wrong.
- Valid: "Revenue recognition", "Current ratio", "Double-entry bookkeeping", "Variance", "Depreciation".
- Not concepts, so skipped: document-structure or filler labels such as "Examples", "Key elements", "Key accounts", "Overview", "Introduction", "Summary", "Definitions", "Account structure", "Case study", "Exercises", "Notes", "Other", "Miscellaneous", "Basics", "Fundamentals"; a worked example; a company name; a page or chapter title that names no idea; a vague heading. Where the document has such a heading, use the real ideas inside it instead.
- Names make sense on their own, outside their parent, because they are shown and tracked without the tree: "Revenue recognition", not "Recognition"; "Current ratio", not "Ratio".
- Every concept is traceable to the document: it is taught or used there. Concepts the document does not cover stay out, even when they belong to the subject.
</what_counts_as_a_concept>

<tree_rules>
1. Exactly ONE root: the overall subject. Its "parent" is null and it is the first item.
2. Every other concept has exactly ONE "parent": the exact name of a concept that appears EARLIER in the list. There are no cycles and no concept without a parent.
3. A parent is a BROADER concept that CONTAINS its children ("Cost" contains "Expense recognition"). It is not "something you must learn first", and a sibling is never a parent.
4. MECE at every level. The children of any node are:
   - Mutually exclusive: no overlap between siblings, and the same idea never appears twice anywhere in the tree.
   - Collectively exhaustive: together they cover the whole of the parent as far as the document treats it. Ask "what are the complete, non-overlapping parts of this parent?" and use the natural split of the domain (an income statement splits into Revenue and Cost; an equation into its terms; a process into its stages; a classification into its classes).
   Siblings sit at the same level of abstraction, so a specific item never stands next to its own category.
5. Depth: up to ${MAX_DEPTH} levels counting the root (root = level 1). Keep splitting a concept into its MECE parts for as long as the document treats those parts as separate ideas. Prefer a deeper tree with 2-5 children per node over a wide flat one: a node with more than 5 children gets its children grouped under intermediate concepts, and a node with a single child is merged with it or given its missing sibling.
6. Level 2 holds the 3-6 major areas of the subject. Deeper levels hold progressively more specific ideas, methods, formulas and skills.
7. At most ${MAX_CONCEPTS} concepts in total, including the root. Spend them where the document goes deepest and leave out minor material rather than adding vague nodes, because a short precise tree tracks better than a long fuzzy one. Follow the document's own structure when it is sound.
8. Names are short and specific, unique, and written in the document's language, because students see them in that language.
9. Output in PRE-ORDER: root, then the first level-2 area, then everything under it (depth first), then the next level-2 area, and so on.
10. "topic" is the name of the level-2 area the concept belongs to; for the root and for level-2 concepts it is the root's own name.
</tree_rules>

<field_guidance>
- description: one sentence saying what the concept is, taken from how the document treats it.
- bloom_level: the highest level the document's own exercises or wording call for, from remember to create; definitions alone are "remember", worked calculations are "apply".
- difficulty: about 0.2 for introductory ideas, 0.5 for standard course content, 0.8 for advanced or multi-step material.
- importance: high (0.8-1.0) for the root's major areas and ideas many other concepts depend on, low (0.2-0.4) for side topics.
- question_types: only the types that make sense for this concept (calculation for formulas, matching for classifications, and so on).
- source_pages: the page numbers where the document covers the concept when the text marks pages, otherwise an empty list.
</field_guidance>

The examples below show STRUCTURE and DEPTH only. Use only concepts that the document actually covers, and never copy example content.

<example name="Financial Statements">
MECE splits, deep where the material is rich:
  Financial Statements
    Income Statement
      Revenue
        Revenue recognition
        Sales returns and discounts
      Cost
        Expense recognition
        Depreciation and amortization
        Cost of goods sold
      Cash vs accrual basis
    Balance Sheet
      Assets
        Current assets
        Non-current assets
      Liabilities
      Equity
        Retained earnings
    Financial Ratios
      Liquidity
        Current ratio
</example>

<example name="Statistics">
  Statistics
    Central tendency
      Mean
      Median
    Dispersion
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

As JSON, "Pivot table" has parent "Conditional probabilities", which has parent "Variable correlation", which has parent "Statistics" (the root, parent null).
</example>

Before you answer, check the tree: one root with a null parent; every other parent appears earlier in the list; no name repeats; no filler label is present; no concept has a single child; there are at most ${MAX_CONCEPTS} concepts and ${MAX_DEPTH} levels; every concept is covered in the document. Fix what fails, then answer.`;

/**
 * Guarantees a valid tree whatever the model returned: one root, one existing earlier parent per
 * concept, unique names, depth <= MAX_DEPTH, at most MAX_CONCEPTS. Because parents always precede
 * children, truncating the list can never orphan a node.
 */
const GENERIC_LABEL = /^(examples?|key (elements?|points?|accounts?|terms?)|overview|introduction|summary|conclusions?|definitions?|account structure|case stud(y|ies)|exercises?|notes?|other|others|miscellaneous|basics|fundamentals)$/i;

function normalizeTree(items) {
  const out = [];
  const indexByName = new Map();
  const depth = [];
  const redirect = new Map(); // dropped generic label -> its parent name, so its children re-attach upward
  for (const item of items) {
    const name = String(item?.name || "").trim();
    const key = name.toLowerCase();
    if (!name || indexByName.has(key)) continue;
    if (out.length > 0 && GENERIC_LABEL.test(name)) {
      redirect.set(key, String(item?.parent || "").trim().toLowerCase());
      continue;
    }

    let parentIdx = -1;
    if (out.length > 0) {
      let wanted = String(item?.parent || "").trim().toLowerCase();
      for (let hops = 0; redirect.has(wanted) && hops < 5; hops++) wanted = redirect.get(wanted);
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
        { role: "user", content: `<document>\n${truncated}\n</document>\n\nExtract the concept tree of this document now.` },
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
