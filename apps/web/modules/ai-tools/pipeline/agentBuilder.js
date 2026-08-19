import { chunkDocuments, DEFAULT_CHUNK_WORDS, DEFAULT_OVERLAP_WORDS } from "./chunking.js";
import { selectTopChunks } from "./retrieval.js";
import { loadWorkspaceTreeForAi } from "./workspaceSource.js";

export const AGENT_MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "Luna 3 Mini (Recommended, low cost)", tier: "cheap" },
  { value: "gpt-4o", label: "Luna 3 Pro (Upgrade, higher quality)", tier: "upgrade" },
  { value: "gpt-4.1", label: "Luna 3 Max (Upgrade, most capable)", tier: "upgrade" }
];

const DEFAULT_AGENT_MODEL = process.env.LUNA_AGENT_MODEL || AGENT_MODEL_OPTIONS[0].value;
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

  for (const field of fields) {
    const name = String(field?.name || "").trim();
    if (!name) continue;
    const type = FIELD_TYPES.includes(field?.type) ? field.type : "string";
    properties[name] = type === "array" ? { type: "array", items: { type: "string" } } : { type };
    required.push(name);
  }

  return {
    type: "object",
    additionalProperties: false,
    properties: {
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
    required: ["items"]
  };
}

function buildChunksContext(chunks, maxChunks = 12) {
  return chunks.slice(0, maxChunks).map((chunk) => ({
    documentName: chunk.documentName,
    chunkIndex: (chunk.chunkIndex || 0) + 1,
    content: String(chunk.content || "").slice(0, 1800)
  }));
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

async function callOpenAiAgent(config, chunks, schema) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable: OPENAI_API_KEY");
  }
  const model = String(config.model || "").trim() || DEFAULT_AGENT_MODEL;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: creativityToTemperature(config.creativity),
      max_tokens: 2600,
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
          content: "You are a configurable AI agent runtime. Follow the operator's instructions and only use the supplied reference material and output example as guidance. Output only valid JSON matching the schema."
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Generate agent output",
            agentInstructions: config.instructions || "",
            outputExample: config.outputExample || "",
            refinementPrompt: config.refinementPrompt || "",
            previousOutput: config.previousOutput || null,
            referenceMaterial: buildChunksContext(chunks)
          })
        }
      ]
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI agent generation failed");
  }

  const content = payload.choices?.[0]?.message?.content;
  const parsed = parseJsonFromContent(content);
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error("Agent response could not be parsed into structured output");
  }

  return { items: parsed.items, model };
}

function generateAgentOutputLocally(chunks, fields) {
  const sampleText = chunks.map((chunk) => String(chunk.content || "")).join(" ").trim();
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
    items.push(item);
  }

  return { items, model: "local-heuristic-v1" };
}

export async function runAgentGeneration(config) {
  const fields = Array.isArray(config?.template?.fields) ? config.template.fields : [];
  if (!fields.length) {
    throw new Error("Add at least one output field before generating output.");
  }

  const workspaces = await loadWorkspaceTreeForAi();
  const scopedDocuments = collectScopedDocuments(workspaces, config.scope || {});
  const chunking = { chunkWords: DEFAULT_CHUNK_WORDS, overlapWords: DEFAULT_OVERLAP_WORDS };
  const chunks = scopedDocuments.length ? chunkDocuments(scopedDocuments, chunking) : [];
  const rankedChunks = chunks.length
    ? selectTopChunks(chunks, {
      topicPrompt: config.instructions,
      title: config.name,
      questionCount: 6,
      scope: config.scope || {}
    })
    : [];

  const schema = buildJsonSchemaFromFields(fields);

  let result = null;
  let fallbackReason = "";

  if (isAgentLlmConfigured()) {
    try {
      result = await callOpenAiAgent(config, rankedChunks, schema);
    } catch (error) {
      fallbackReason = String(error.message || error);
    }
  }

  if (!result) {
    result = generateAgentOutputLocally(rankedChunks, fields);
  }

  return {
    items: result.items,
    model: result.model,
    fallbackReason,
    referenceDocumentCount: scopedDocuments.length,
    referenceChunkCount: rankedChunks.length
  };
}
