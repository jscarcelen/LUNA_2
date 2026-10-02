import { chunkDocuments, DEFAULT_CHUNK_WORDS, DEFAULT_OVERLAP_WORDS } from "./chunking.js";
import { selectChunksWithinBudget } from "./retrieval.js";
import { loadWorkspaceTreeForAi } from "./workspaceSource.js";
import { validateOutput } from "../../agent-studio/engine/validate";
import { buildJsonSchema as buildBlockJsonSchema, BLOCKS } from "../blocks/blockRegistry.js";

export const AGENT_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "Luna 3 Mini (Recommended, low cost)", tier: "cheap" },
  { value: "gpt-4o", label: "Luna 3 Pro (Upgrade, higher quality)", tier: "upgrade" },
  { value: "gpt-4.1", label: "Luna 3 Max (Upgrade, most capable)", tier: "upgrade" }
];

const DEFAULT_AGENT_MODEL = process.env.LUNA_AGENT_MODEL || AGENT_MODEL_OPTIONS[0].value;

/**
 * Hard ceiling on the number of cards/flashcards returned by any single generation.
 * A document with 200 concepts would otherwise produce a 200-card set that overwhelms
 * young learners. Set to 30 so every set fits in one study session.
 * Callers can opt into a lower cap via config.maxItems; they cannot exceed this ceiling.
 */
export const FLASHCARD_MAX_ITEMS = 30;

/**
 * Returns true when the generation looks like a flashcard/card set based on the agent name,
 * instructions, or field names — used to apply FLASHCARD_MAX_ITEMS automatically.
 */
function looksLikeFlashcards(config) {
  const text = `${config.name || ""} ${config.instructions || ""} ${(config.template?.fields || []).map((f) => f.name).join(" ")}`.toLowerCase();
  return /flashcard|flash card|\bcard\b|\bcards\b|vocabulary|vocab/.test(text);
}
const FIELD_TYPES = ["string", "number", "boolean", "array"];

export function isAgentLlmConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function collectScopedDocuments(workspaces, scope = {}) {
  const workspaceFilter = String(scope.workspaceId || "").trim();
  const subjectFilter = String(scope.subjectId || "").trim();
  const documentIds = new Set((scope.documentIds || []).filter(Boolean));
  const matches = [];

  for (const workspace of workspaces) {
    if (workspaceFilter && workspace.id !== workspaceFilter) continue;
    for (const subject of workspace.subjects || []) {
      if (subjectFilter && subject.id !== subjectFilter) continue;
      for (const document of subject.documents || []) {
        if (document.sourceType === "generated") continue;
        if (String(document.reviewStatus || "approved") !== "approved") continue;
        if (documentIds.size && !documentIds.has(document.id)) continue;
        matches.push({ ...document, workspaceId: workspace.id, subjectId: subject.id });
      }
    }
  }

  return matches;
}

function buildJsonSchemaFromFields(fields = []) {
  const properties = {};
  const required = [];
  // Fields marked "once" (a title) are written once per document, next to the list of items.
  const rootProperties = {};
  const rootRequired = [];

  for (const field of fields) {
    const name = String(field?.name || "").trim();
    if (!name || name === "_source") continue; // _source is system-injected below
    const type = FIELD_TYPES.includes(field?.type) ? field.type : "string";
    const schema = type === "array" ? { type: "array", items: { type: "string" } } : { type };
    if (field?.description) schema.description = String(field.description);
    if (field?.repeatScope === "once") {
      rootProperties[name] = schema;
      rootRequired.push(name);
    } else {
      properties[name] = schema;
      required.push(name);
    }
  }

  // System field: the model fills this with the sourceId of the chunk it drew from (e.g. "S3").
  // Never shown as a user-configured field; resolved to full metadata in runAgentGeneration.
  properties["_source"] = { type: "string", description: "The sourceId of the reference chunk this item was primarily drawn from (e.g. S3). Use the sourceId values from referenceMaterial." };
  required.push("_source");

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      ...rootProperties,
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties,
          required
        }
      }
    },
    required: [...rootRequired, "items"]
  };
}

/**
 * Whole chunks — selection already happened within the material budget; truncating here would hide content.
 * Each chunk gets a short sourceId (S1, S2…) so the model can cite which one each item came from.
 */
function buildChunksContext(chunks, maxChunks = 40) {
  return chunks.slice(0, maxChunks).map((chunk, index) => ({
    sourceId: `S${index + 1}`,
    documentName: chunk.documentName,
    section: chunk.section || "",
    headingPath: Array.isArray(chunk.headingPath) ? chunk.headingPath.join(" > ") : "",
    chunkIndex: (chunk.chunkIndex || 0) + 1,
    content: String(chunk.content || "")
  }));
}

/** The passages a run read, for citing where each answer comes from (chunkIndex is 1-based, as shown to people). */
function sourcesFromChunks(chunks = []) {
  return chunks.slice(0, 40).map((chunk) => ({
    documentId: chunk.documentId || "",
    documentName: chunk.documentName || "",
    chunkIndex: (chunk.chunkIndex || 0) + 1,
    heading: Array.isArray(chunk.headingPath) && chunk.headingPath.length ? chunk.headingPath.join(" › ") : String(chunk.section || ""),
    content: String(chunk.content || "").slice(0, 1200)
  }));
}

/* ---------------------------------------------------------------- cost estimate */

/** USD per 1M tokens (input, output). Kept here so the estimate and the credits ledger agree. */
export const MODEL_PRICING = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1": { input: 2, output: 8 }
};

export function approxTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function buildUserMessage(config, chunks, styleChunks) {
  return JSON.stringify({
    task: "Generate agent output",
    agentInstructions: config.instructions || "",
    outputFields: (config.template?.fields || []).map((field) => ({ name: field.name, meaning: field.description || field.label || field.name })),
    agentKnowledge: config.knowledgeText
      ? { note: "Background notes and examples from the agent creator. Use them to understand the expected style and level; never copy their content or layout into the output, and always respect the output schema (one element per item).", text: String(config.knowledgeText) }
      : null,
    contextPrompt: config.contextPrompt || "",
    questionAnswers: Array.isArray(config.questionAnswers) ? config.questionAnswers : [],
    outputExample: config.outputExample || "",
    refinementPrompt: config.refinementPrompt || "",
    previousOutput: config.previousOutput || null,
    sourcingInstruction: "Each referenceMaterial entry has a sourceId (S1, S2…). For every item you generate, set _source to the sourceId of the chunk it was primarily drawn from. If an item spans multiple chunks, pick the most relevant one.",
    referenceMaterial: buildChunksContext(chunks),
    styleExamples: styleChunks.length
      ? { note: "Imitate the format, tone and difficulty of these examples. Do not take content from them.", samples: buildChunksContext(styleChunks, 4) }
      : null
  });
}

/** Expected output size from the schema and the requested count (number inputs / count rules), in tokens. */
function estimateOutputTokens(config) {
  const fields = Array.isArray(config.template?.fields) ? config.template.fields : [];
  const perItem = fields.filter((field) => field.repeatScope !== "once");
  const once = fields.filter((field) => field.repeatScope === "once");
  let count = 0;
  for (const entry of config.questionAnswers || []) {
    const n = Number(String(entry.answer || "").trim());
    if (Number.isFinite(n) && n > 0 && n < 500 && /how many|number|count|cu[aá]nt|n[uú]mero/i.test(entry.question || "")) { count = n; break; }
  }
  if (!count) {
    const match = /(\d{1,3})\s+(items|questions|bullets|cards|flashcards|words|points|key)/i.exec(config.instructions || "");
    count = match ? Number(match[1]) : 5;
  }
  const richness = (field) => (/rich|paragraph|summary|explanation|text/i.test(`${field.type} ${field.name} ${field.description}`) ? 160 : 35);
  const perItemTokens = perItem.reduce((sum, field) => sum + richness(field), 0) + 8;
  const onceTokens = once.reduce((sum, field) => sum + richness(field), 0);
  return Math.max(120, Math.round(count * perItemTokens + onceTokens + 30));
}

/** Loads, chunks and selects the material an agent run reads. Shared by the run and the estimate. */
async function prepareMaterial(config, emit = () => {}) {
  emit({ step: "scope", status: "start" });
  const workspaces = await loadWorkspaceTreeForAi();
  // Agent Studio specs use material only when explicitly selected (opt-in); legacy agents keep subject-wide scope.
  const explicitOnly = Boolean(config.spec) && !(config.scope?.documentIds || []).length;
  const scopedDocuments = explicitOnly ? [] : collectScopedDocuments(workspaces, config.scope || {});
  const styleDocumentIds = Array.isArray(config.scope?.styleDocumentIds) ? config.scope.styleDocumentIds.filter(Boolean) : [];
  const styleDocuments = styleDocumentIds.length
    ? collectScopedDocuments(workspaces, { workspaceId: config.scope?.workspaceId, documentIds: styleDocumentIds })
    : [];
  emit({ step: "scope", status: "end", documentCount: scopedDocuments.length, styleDocumentCount: styleDocuments.length });

  emit({ step: "chunk", status: "start" });
  const chunking = { chunkWords: DEFAULT_CHUNK_WORDS, overlapWords: DEFAULT_OVERLAP_WORDS };
  const chunks = scopedDocuments.length ? chunkDocuments(scopedDocuments, chunking) : [];
  const styleChunks = styleDocuments.length ? chunkDocuments(styleDocuments, chunking).slice(0, 4) : [];
  emit({ step: "chunk", status: "end", chunkCount: chunks.length });

  emit({ step: "retrieve", status: "start" });
  const selection = chunks.length
    ? selectChunksWithinBudget(chunks, { topicPrompt: config.instructions, title: config.name, scope: config.scope || {} })
    : { chunks: [], truncated: false, totalChars: 0 };
  emit({ step: "retrieve", status: "end", chunkCount: selection.chunks.length, truncated: selection.truncated });
  return { scopedDocuments, styleDocuments, chunks, rankedChunks: selection.chunks, styleChunks, truncated: selection.truncated };
}

/**
 * Estimates what a run will cost before it happens: tokens in (instructions + material + answers),
 * tokens out (from the schema and requested count) and USD at list price.
 */
export async function estimateAgentRun(config) {
  const fields = Array.isArray(config?.template?.fields) ? config.template.fields : [];
  const material = await prepareMaterial(config);
  const schema = injectSourceFieldIntoSchema(config.outputJsonSchema || buildJsonSchemaFromFields(fields));
  const model = String(config.model || "").trim() || DEFAULT_AGENT_MODEL;
  const inputTokens = approxTokens(buildUserMessage(config, material.rankedChunks, material.styleChunks)) + approxTokens(JSON.stringify(schema)) + 120;
  const outputTokens = estimateOutputTokens(config);
  const price = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o-mini"];
  const costUsd = (inputTokens * price.input + outputTokens * price.output) / 1e6;
  return {
    model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: Number(costUsd.toFixed(5)),
    documentCount: material.scopedDocuments.length,
    chunkCount: material.rankedChunks.length,
    truncated: material.truncated,
    llmConfigured: isAgentLlmConfigured()
  };
}

function creativityToTemperature(creativity = "medium") {
  const normalized = String(creativity || "medium").trim().toLowerCase();
  if (normalized === "low") return 0.2;
  if (normalized === "high") return 0.9;
  return 0.55;
}

function parseJsonFromContent(content) {
  const text = String(content || "").trim();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function readOpenAiStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;
  let finishReason = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let event = null;
      try {
        event = JSON.parse(data);
      } catch {
        continue;
      }
      if (event.usage) usage = event.usage;
      if (event.choices?.[0]?.finish_reason) finishReason = event.choices[0].finish_reason;
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) {
        content += delta;
        if (typeof onToken === "function") onToken(delta, content);
        // Runaway guard: a model stuck repeating whitespace/separators never closes the JSON.
        if (content.length > 400 && /^(\s|-){200,}$/.test(content.slice(-200))) {
          await reader.cancel().catch(() => {});
          return { content, usage, finishReason: "length" };
        }
      }
    }
  }

  return { content, usage, finishReason };
}

async function callOpenAiAgent(config, chunks, schema, { onToken, styleChunks = [], maxTokens = 6000 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
  }
  const model = String(config.model || "").trim() || DEFAULT_AGENT_MODEL;
  const streaming = typeof onToken === "function";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: creativityToTemperature(config.creativity),
      max_tokens: maxTokens,
      stream: streaming,
      ...(streaming ? { stream_options: { include_usage: true } } : {}),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "agent_generation_result",
          strict: true,
          schema
        }
      },
      messages: [
        {
          role: "system",
          content: "You are a configurable AI agent runtime. Follow the operator's instructions and the user's question answers. Use the supplied reference material or context prompt as the source content, and the output example as a formatting guide. Output only valid JSON matching the schema."
        },
        {
          role: "user",
          content: buildUserMessage(config, chunks, styleChunks)
        }
      ]
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || "OpenAI agent generation failed");
  }

  let content = "";
  let usage = null;
  let finishReason = "";
  if (streaming) {
    ({ content, usage, finishReason } = await readOpenAiStream(response, onToken));
  } else {
    const payload = await response.json();
    content = payload.choices?.[0]?.message?.content;
    usage = payload.usage || null;
    finishReason = payload.choices?.[0]?.finish_reason || "";
  }

  const parsed = parseJsonFromContent(content);
  // A list is optional: an agent may return only once-per-document fields (e.g. title + summary).
  const expectsItems = Boolean(schema?.properties?.items);
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !expectsItems && !Array.isArray(parsed.items)) parsed.items = [];
  if (!parsed || !Array.isArray(parsed.items)) {
    if (finishReason === "length") {
      throw new Error("The model ran out of space before finishing the output. Ask for fewer items or shorter text.");
    }
    if (finishReason === "content_filter") {
      throw new Error("The model declined to produce this output (content filter).");
    }
    throw new Error(`Agent response could not be parsed into structured output (finish: ${finishReason || "unknown"}, ${String(content || "").length} chars)`);
  }

  const { items, ...root } = parsed;
  return { items, root, model, usage };
}

/**
 * Builds a human-readable per-block-type description for inclusion in the system prompt.
 * Each entry shows the exact `type` string, example JSON, and per-field descriptions
 * so the model knows precisely what IDs and fields to use.
 */
function buildBlockSchemaSummary(selectedBlockIds) {
  const lines = [];
  for (const id of selectedBlockIds) {
    const block = BLOCKS[id];
    if (!block) continue;
    const fields = block.aiFields;
    const example = { type: id };
    for (const [name, def] of Object.entries(fields)) {
      if (def.example !== undefined) {
        example[name] = def.example;
      } else if (def.type === "string[]" || def.type === "string[4]") {
        example[name] = ["..."];
      } else if (def.type === "boolean") {
        example[name] = true;
      } else if (def.type === "number") {
        example[name] = 1;
      } else {
        example[name] = "...";
      }
    }
    lines.push(`type: "${id}" — ${block.label}: ${block.description}`);
    lines.push(`  Example: ${JSON.stringify(example)}`);
    for (const [name, def] of Object.entries(fields)) {
      const req = def.required ? "required" : "optional";
      lines.push(`  • ${name} (${def.type}, ${req}): ${def.description}`);
    }
    if (Object.keys(fields).length === 0) {
      lines.push("  (no additional fields)");
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/**
 * Makes a fast, cheap GPT call to rewrite vague user instructions into a precise numbered ruleset
 * plus a concrete JSON skeleton showing the exact items array structure the content agent must follow.
 * Returns the enhanced rules string, or falls back to rawInstructions on any failure.
 */
async function enhanceOutputInstructions(rawInstructions, selectedBlockIds, blockSchemaSummary) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !String(rawInstructions || "").trim()) return rawInstructions || "";
  try {
    const systemMsg = `You are a prompt engineer for a structured-content AI. Your job is to turn vague user instructions into a PRECISE ruleset + a CONCRETE JSON SKELETON.

RULES FOR YOUR OUTPUT:
1. Start with numbered rules that enforce exact counts, ordering, and field values.
2. End with a JSON skeleton showing the complete "items" array structure using PLACEHOLDER values like "{{heading text}}", "{{bullet text 1}}", etc.
3. Interpret "divided by divider" / "divider between each" as: place a {"type":"divider"} BETWEEN each content block (not at the end).
   Example: 3 bullets divided by dividers → bullet → divider → bullet → divider → bullet (5 items total).
4. Interpret "single bullet point" or "one item per bullet" as: one {"type":"bullet_list","items":["{{text}}"]} per bullet.
   bullet_list items array can have 1–8 entries; use 1 when each bullet is a standalone point.
5. Extract exact numeric counts and enforce them (e.g. "exactly 3" → produce exactly 3, never 2 or 4).
6. Only use block types from the ALLOWED list provided.
Output only the ruleset + JSON skeleton. No preamble, no explanation.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        max_tokens: 500,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: `Instructions: ${rawInstructions}\n\nAvailable blocks:\n${blockSchemaSummary}` }
        ]
      })
    });
    if (!response.ok) return rawInstructions;
    const payload = await response.json();
    const enhanced = payload.choices?.[0]?.message?.content;
    return enhanced && enhanced.trim() ? enhanced.trim() : rawInstructions;
  } catch {
    return rawInstructions;
  }
}

/**
 * Block-based generation: calls OpenAI expecting a flat JSON array of block objects.
 * Used when the agent spec carries `output.selectedBlocks`.
 */
async function callOpenAiAgentBlocks(config, chunks, blockSchema, selectedBlockIds, { onToken, styleChunks = [], maxTokens = 6000 } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
  }
  const model = String(config.model || "").trim() || DEFAULT_AGENT_MODEL;
  const streaming = typeof onToken === "function";

  const blockSchemaSummary = buildBlockSchemaSummary(selectedBlockIds);
  const rawInstructions = config.instructions || "Generate content based on the reference material.";
  // Enhance vague instructions into a precise numbered ruleset before the main generation call.
  // Falls back silently to rawInstructions on any failure so the pipeline is never broken.
  const enhancedRules = await enhanceOutputInstructions(rawInstructions, selectedBlockIds, blockSchemaSummary);

  const systemPrompt = `You are a content generation assistant creating structured educational content.

TASK: ${rawInstructions}

OUTPUT FORMAT
Return a JSON object with one key "items" whose value is an array of block objects.
Each block MUST have a "type" field set to one of the exact IDs listed below — no other type values are valid.
Fields not relevant to a given block type should be set to null.
Do not include markdown fences, commentary, or any text outside the JSON object.

ALLOWED BLOCK TYPES
(Use these exact "type" strings — do not invent alternatives like "title", "h1", "list", "text", etc.)

${blockSchemaSummary}

COMPOSITION RULES (follow exactly)
${enhancedRules}

Additional hard rules:
- Never use a block type that is not in the ALLOWED BLOCK TYPES list above.
- Never omit a required field; set optional fields to null if unused.`;

  const userMessage = JSON.stringify({
    task: "Generate content blocks",
    contextPrompt: config.contextPrompt || "",
    questionAnswers: Array.isArray(config.questionAnswers) ? config.questionAnswers : [],
    referenceMaterial: buildChunksContext(chunks),
    styleExamples: styleChunks.length
      ? { note: "Imitate the format, tone and difficulty of these examples.", samples: buildChunksContext(styleChunks, 4) }
      : null,
  });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: creativityToTemperature(config.creativity),
      max_tokens: maxTokens,
      stream: streaming,
      ...(streaming ? { stream_options: { include_usage: true } } : {}),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "block_array_result",
          strict: false,
          // OpenAI json_schema top-level must be an object — wrap the array inside.
          schema: {
            type: "object",
            properties: { items: blockSchema },
            required: ["items"],
            additionalProperties: false
          }
        }
      },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ]
    })
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error?.message || "OpenAI block generation failed");
  }

  let content = "";
  let usage = null;
  let finishReason = "";
  if (streaming) {
    ({ content, usage, finishReason } = await readOpenAiStream(response, onToken));
  } else {
    const payload = await response.json();
    content = payload.choices?.[0]?.message?.content;
    usage = payload.usage || null;
    finishReason = payload.choices?.[0]?.finish_reason || "";
  }

  let parsed = null;
  try {
    const text = String(content || "").trim();
    const obj = JSON.parse(text);
    // Response may be wrapped { items: [...] } (json_schema object wrapper) or a bare array.
    parsed = Array.isArray(obj) ? obj : (Array.isArray(obj?.items) ? obj.items : null);
  } catch {
    const match = String(content || "").match(/\[[\s\S]*\]/);
    if (match) {
      try { parsed = JSON.parse(match[0]); } catch { /* ignore */ }
    }
  }

  if (!Array.isArray(parsed)) {
    if (finishReason === "length") throw new Error("The model ran out of space. Ask for fewer blocks.");
    if (finishReason === "content_filter") throw new Error("The model declined to produce this output (content filter).");
    throw new Error(`Block generation response could not be parsed as an array (finish: ${finishReason || "unknown"}, ${String(content || "").length} chars)`);
  }

  return { blocks: parsed, model, usage };
}

function generateAgentOutputLocally(chunks, fields, config = {}) {
  const answerText = (Array.isArray(config.questionAnswers) ? config.questionAnswers : [])
    .map((entry) => String(entry?.answer ?? ""))
    .join(". ");
  const sampleText = [
    chunks.map((chunk) => String(chunk.content || "")).join(" "),
    String(config.contextPrompt || ""),
    answerText
  ].join(" ").trim();
  const sentences = sampleText.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean);
  const itemCount = sentences.length ? Math.min(6, Math.max(2, Math.ceil(sentences.length / 3))) : 3;
  const items = [];

  for (let index = 0; index < itemCount; index += 1) {
    const item = {};
    for (const field of fields) {
      const name = String(field?.name || "").trim();
      if (!name) continue;
      if (field.type === "number") {
        item[name] = index + 1;
      } else if (field.type === "boolean") {
        item[name] = index % 2 === 0;
      } else if (field.type === "array") {
        item[name] = sentences.length ? [sentences[index % sentences.length].slice(0, 80)] : [];
      } else {
        item[name] = sentences.length
          ? sentences[index % sentences.length].slice(0, 120)
          : `Sample ${name} ${index + 1}`;
      }
    }
    item["_source"] = "";
    items.push(item);
  }

  return { items, model: "local-heuristic-v1" };
}

/**
 * Ensures the _source field is in the items schema regardless of whether the schema came from
 * buildJsonSchemaFromFields (already injected) or from an Agent Studio spec (outputJsonSchema).
 * Safe to call on any schema shape; returns the schema unchanged if items isn't an object schema.
 */
function injectSourceFieldIntoSchema(schema) {
  try {
    const itemsSchema = schema?.properties?.items?.items;
    if (!itemsSchema || itemsSchema.type !== "object") return schema;
    if (itemsSchema.properties?._source) return schema; // already there
    return {
      ...schema,
      properties: {
        ...schema.properties,
        items: {
          ...schema.properties.items,
          items: {
            ...itemsSchema,
            properties: {
              ...itemsSchema.properties,
              _source: { type: "string", description: "The sourceId of the reference chunk this item was primarily drawn from (e.g. S3)." }
            },
            required: [...(itemsSchema.required || []), "_source"]
          }
        }
      }
    };
  } catch {
    return schema;
  }
}

/**
 * Runs one agent generation. `onProgress` (optional) receives step events so callers can
 * stream a live "building" state to the UI:
 *   { step: "scope" | "chunk" | "retrieve" | "generate" | "done", status: "start" | "end", ...meta }
 *   { step: "generate", status: "token", chars, delta }
 */
export async function runAgentGeneration(config, { onProgress } = {}) {
  const emit = (event) => {
    if (typeof onProgress === "function") onProgress(event);
  };

  // ── Block-based generation path ──────────────────────────────────────
  // When the agent spec uses the new block registry (output.selectedBlocks), we bypass
  // the legacy field/template system and return a flat array of typed block objects.
  const selectedBlockEntries = config.output?.selectedBlocks || config.spec?.output?.selectedBlocks || [];
  const selectedBlockIds = selectedBlockEntries.map((e) => e.blockId || e).filter(Boolean);
  if (selectedBlockIds.length > 0) {
    const blockSchema = buildBlockJsonSchema(selectedBlockIds.length > 0 ? selectedBlockIds : ["heading", "paragraph", "bullet_list"]);
    const { scopedDocuments: blockDocs, rankedChunks: blockChunks, styleChunks: blockStyleChunks } = await prepareMaterial(config, emit);
    let blockResult = null;
    let blockFallback = "";
    const blockModel = String(config.model || "").trim() || DEFAULT_AGENT_MODEL;
    emit({ step: "generate", status: "start", model: isAgentLlmConfigured() ? blockModel : "local-heuristic-v1" });
    if (isAgentLlmConfigured()) {
      try {
        blockResult = await callOpenAiAgentBlocks(config, blockChunks, blockSchema, selectedBlockIds, {
          styleChunks: blockStyleChunks,
          onToken: (delta, content) => emit({ step: "generate", status: "token", delta, chars: content.length })
        });
      } catch (err) {
        emit({ step: "generate", status: "retry", reason: String(err.message || err) });
        try {
          blockResult = await callOpenAiAgentBlocks({ ...config, creativity: "low" }, blockChunks, blockSchema, selectedBlockIds, { styleChunks: blockStyleChunks, maxTokens: 3000 });
        } catch (retryErr) {
          blockFallback = String(retryErr.message || retryErr);
        }
      }
    }
    if (!blockResult) {
      // Minimal local fallback for block-based generation
      blockResult = {
        blocks: [{ type: "heading", text: config.name || "Generated Content", level: 1 }, { type: "paragraph", text: "Content could not be generated. Please check your OpenAI API key." }],
        model: "local-heuristic-v1"
      };
    }
    emit({ step: "generate", status: "end", model: blockResult.model, blockCount: blockResult.blocks.length, fallbackReason: blockFallback });
    emit({ step: "done", status: "end", blocks: blockResult.blocks, model: blockResult.model, usage: blockResult.usage || null, fallbackReason: blockFallback, referenceDocumentCount: blockDocs.length, referenceChunkCount: blockChunks.length });
    return {
      blocks: blockResult.blocks,
      items: blockResult.blocks, // alias for backward compat (LivePreviewPane ignores unknown shapes)
      data: {},
      model: blockResult.model,
      usage: blockResult.usage || null,
      fallbackReason: blockFallback,
      checks: [],
      referenceDocumentCount: blockDocs.length,
      referenceChunkCount: blockChunks.length,
      sources: sourcesFromChunks(blockChunks),
      isBlockOutput: true,
    };
  }
  // ── Legacy field/template generation path ────────────────────────────

  const fields = Array.isArray(config?.template?.fields) ? config.template.fields : [];
  if (!fields.length) {
    throw new Error("Add at least one output field before generating output.");
  }

  const { scopedDocuments, rankedChunks, styleChunks } = await prepareMaterial(config, emit);

  const baseSchema = config.outputJsonSchema || buildJsonSchemaFromFields(fields);
  // Always ensure _source is in the item schema so the model can cite which chunk each item came from.
  // When the schema came from the Agent Studio (outputJsonSchema), inject it there too.
  const schema = injectSourceFieldIntoSchema(baseSchema);

  let result = null;
  let fallbackReason = "";

  const model = String(config.model || "").trim() || DEFAULT_AGENT_MODEL;
  emit({ step: "generate", status: "start", model: isAgentLlmConfigured() ? model : "local-heuristic-v1" });
  if (isAgentLlmConfigured()) {
    try {
      result = await callOpenAiAgent(config, rankedChunks, schema, {
        styleChunks,
        onToken: (delta, content) => emit({ step: "generate", status: "token", delta, chars: content.length })
      });
    } catch (error) {
      // A single retry at low temperature, non-streaming, before giving up on the model: small models
      // occasionally loop or truncate structured output.
      emit({ step: "generate", status: "retry", reason: String(error.message || error) });
      try {
        result = await callOpenAiAgent({ ...config, creativity: "low" }, rankedChunks, schema, { styleChunks, maxTokens: 3000 });
      } catch (retryError) {
        fallbackReason = String(retryError.message || retryError);
      }
    }
  }

  if (!result) {
    result = generateAgentOutputLocally(rankedChunks, fields, config);
  }
  emit({ step: "generate", status: "end", model: result.model, itemCount: result.items.length, fallbackReason });

  // Document data (date, topic…) is copied from the user's choices, never generated.
  if (config.spec && Array.isArray(config.spec.outputSchema)) {
    result.root = { ...(result.root || {}) };
    const slugify = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const inputs = Array.isArray(config.spec.inputs) ? config.spec.inputs : [];
    for (const field of config.spec.outputSchema) {
      if (!field.fromInputId) continue;
      const input = inputs.find((item) => item.id === field.fromInputId);
      const answered = config.inputValues?.[field.fromInputId];
      const fromQuestions = input ? (config.questionAnswers || []).find((entry) => entry.question === input.name)?.answer : undefined;
      const value = answered !== undefined && answered !== "" ? answered : fromQuestions !== undefined && fromQuestions !== "" ? fromQuestions : input?.default;
      result.root[slugify(field.name)] = value === undefined || value === null ? "" : Array.isArray(value) ? value.join(", ") : value;
    }
  }

  // Resolve _source labels (S1, S2…) to full source metadata on each item.
  // buildChunksContext uses the same indexing, so S1 = rankedChunks[0], S2 = rankedChunks[1], etc.
  const chunkContextForResolution = buildChunksContext(rankedChunks);
  const sourceIdMap = new Map(chunkContextForResolution.map((entry) => [entry.sourceId, entry]));
  result.items = result.items.map((item) => {
    const rawSourceId = String(item._source || "").trim();
    const resolved = rawSourceId ? sourceIdMap.get(rawSourceId) : null;
    return {
      ...item,
      _sourceResolved: resolved
        ? { documentName: resolved.documentName, section: resolved.section, headingPath: resolved.headingPath }
        : null
    };
  });

  // Enforce a hard cap on item count.
  // config.maxItems allows callers to request a tighter limit (e.g. 10 targeted questions).
  // The global FLASHCARD_MAX_ITEMS ceiling applies automatically when the generation looks like
  // flashcards — prevents a 100-card set from being produced for a large document.
  const autoMax = looksLikeFlashcards(config) ? FLASHCARD_MAX_ITEMS : Infinity;
  const effectiveMax = Math.min(Number(config.maxItems) > 0 ? Number(config.maxItems) : Infinity, autoMax);
  if (Number.isFinite(effectiveMax) && result.items.length > effectiveMax) {
    emit({ step: "generate", status: "capped", originalCount: result.items.length, cappedTo: effectiveMax });
    result.items = result.items.slice(0, effectiveMax);
  }

  // Agent Studio specs carry validation rules — structural checks the creator can rely on.
  let checks = [];
  if (config.spec) {
    emit({ step: "validate", status: "start" });
    checks = validateOutput(config.spec, { ...(result.root || {}), items: result.items }, config.inputValues || {});
    emit({ step: "validate", status: "end", passed: checks.filter((check) => check.ok).length, total: checks.length });
  }

  const payload = {
    items: result.items,
    // Once-per-document fields (e.g. a title) returned alongside the items.
    data: { ...(result.root || {}), items: result.items },
    model: result.model,
    usage: result.usage || null,
    fallbackReason,
    checks,
    referenceDocumentCount: scopedDocuments.length,
    referenceChunkCount: rankedChunks.length,
    // The passages the answer came from: used to link each question back to its source material.
    sources: sourcesFromChunks(rankedChunks)
  };
  emit({ step: "done", status: "end", ...payload });
  return payload;
}
