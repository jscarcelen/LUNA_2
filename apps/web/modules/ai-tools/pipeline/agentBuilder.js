import { chunkDocuments, DEFAULT_CHUNK_WORDS, DEFAULT_OVERLAP_WORDS } from "./chunking.js";
import { selectTopChunks } from "./retrieval.js";
import { loadWorkspaceTreeForAi } from "./workspaceSource.js";
import { validateOutput } from "../../agent-studio/engine/validate";

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
    if (field?.description) properties[name].description = String(field.description);
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

async function readOpenAiStream(response, onToken) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage = null;

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
      const delta = event.choices?.[0]?.delta?.content;
      if (delta) {
        content += delta;
        if (typeof onToken === "function") onToken(delta, content);
      }
    }
  }

  return { content, usage };
}

async function callOpenAiAgent(config, chunks, schema, { onToken, styleChunks = [] } = {}) {
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
      max_tokens: 2600,
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
          content: JSON.stringify({
            task: "Generate agent output",
            agentInstructions: config.instructions || "",
            outputFields: (config.template?.fields || []).map((field) => ({ name: field.name, meaning: field.description || field.label || field.name })),
            contextPrompt: config.contextPrompt || "",
            questionAnswers: Array.isArray(config.questionAnswers) ? config.questionAnswers : [],
            outputExample: config.outputExample || "",
            refinementPrompt: config.refinementPrompt || "",
            previousOutput: config.previousOutput || null,
            referenceMaterial: buildChunksContext(chunks),
            styleExamples: styleChunks.length
              ? { note: "Imitate the format, tone and difficulty of these examples. Do not take content from them.", samples: buildChunksContext(styleChunks, 4) }
              : null
          })
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
  if (streaming) {
    ({ content, usage } = await readOpenAiStream(response, onToken));
  } else {
    const payload = await response.json();
    content = payload.choices?.[0]?.message?.content;
    usage = payload.usage || null;
  }

  const parsed = parseJsonFromContent(content);
  if (!parsed || !Array.isArray(parsed.items)) {
    throw new Error("Agent response could not be parsed into structured output");
  }

  return { items: parsed.items, model, usage };
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
    items.push(item);
  }

  return { items, model: "local-heuristic-v1" };
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
  const fields = Array.isArray(config?.template?.fields) ? config.template.fields : [];
  if (!fields.length) {
    throw new Error("Add at least one output field before generating output.");
  }

  emit({ step: "scope", status: "start" });
  const workspaces = await loadWorkspaceTreeForAi();
  const scopedDocuments = collectScopedDocuments(workspaces, config.scope || {});
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
  const rankedChunks = chunks.length
    ? selectTopChunks(chunks, {
      topicPrompt: config.instructions,
      title: config.name,
      questionCount: 6,
      scope: config.scope || {}
    })
    : [];
  emit({ step: "retrieve", status: "end", chunkCount: rankedChunks.length });

  const schema = config.outputJsonSchema || buildJsonSchemaFromFields(fields);

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
      fallbackReason = String(error.message || error);
    }
  }

  if (!result) {
    result = generateAgentOutputLocally(rankedChunks, fields, config);
  }
  emit({ step: "generate", status: "end", model: result.model, itemCount: result.items.length, fallbackReason });

  // Agent Studio specs carry validation rules — structural checks the creator can rely on.
  let checks = [];
  if (config.spec) {
    emit({ step: "validate", status: "start" });
    checks = validateOutput(config.spec, { items: result.items }, config.inputValues || {});
    emit({ step: "validate", status: "end", passed: checks.filter((check) => check.ok).length, total: checks.length });
  }

  const payload = {
    items: result.items,
    model: result.model,
    usage: result.usage || null,
    fallbackReason,
    checks,
    referenceDocumentCount: scopedDocuments.length,
    referenceChunkCount: rankedChunks.length
  };
  emit({ step: "done", status: "end", ...payload });
  return payload;
}
