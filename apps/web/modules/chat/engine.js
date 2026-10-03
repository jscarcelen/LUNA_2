import { MODEL_PRICING, approxTokens, openAiFetch, resolveAgentModel } from "../ai-tools/pipeline/agentBuilder.js";
import { loadWorkspaceTreeForAi } from "../ai-tools/pipeline/workspaceSource.js";
import { LUNA_GUIDE } from "./knowledge.js";
import { readChatStream } from "./stream.js";
import { CHAT_TOOLS, agentsInScope, chunkCache, documentsInScope, executeTool } from "./tools.js";
import { sourcesFromPassages } from "./sources.js";

/** The chat runs on Luna 3 Pro at least. */
export const chatModel = () => resolveAgentModel(process.env.LUNA_CHAT_MODEL);

/** Above this many tokens the user is asked before the request runs (≈ $0.10 on Luna 3 Pro). */
export const CONFIRM_ABOVE_TOKENS = 30000;
const MAX_STEPS = 5;
const MAX_HISTORY = 18;

export function buildSystemPrompt(ctx) {
  const scopeLine = ctx.scope.focus
    ? `The user has FOCUSED the assistant: only ${ctx.scope.label || "the chosen subject/folders"} (${ctx.documents.length} documents) are in scope.`
    : `No focus: the whole workspace is in scope (${ctx.documents.length} documents).`;
  const referenced = ctx.referenced.length ? `The user pointed at these documents — prefer them: ${ctx.referenced.map((document) => `${document.name} [${document.id}]`).join("; ")}.` : "";
  const docList = ctx.documents.slice(0, 40).map((document) => `- ${document.name} [${document.id}] (${document.sourceType === "generated" ? "generated" : "uploaded"}; ${document.subjectName}${document.folderName ? ` / ${document.folderName}` : ""})`).join("\n") || "(no documents in scope)";
  return `You are Luna's assistant: a patient tutor, a document writer, an agent runner and an agent builder, for learners and teachers. Answer in the user's language. Be concise, structured and warm; use Markdown (short paragraphs, bullet lists, **bold** for key terms, tables when comparing).

SCOPE
${scopeLine} ${referenced}
Documents in scope:
${docList}
When the user names material loosely ("my accounting notes"), match it to this list yourself; only ask which one if several plausible documents exist. Use these ids for sourceDocumentIds and documentIds.

HOW YOU WORK
1. Questions about the CONTENT of the user's material: call search_material first, answer only from the passages, and cite each claim as [P1], [P2]… (the numbers returned by the tool). If the passages do not contain the answer, say so plainly — never invent content or citations.
2. Questions about LUNA itself (where is something, how do I run an agent, what is a lunas…): answer from the guide below with a short numbered walkthrough that names the exact sidebar items and buttons. If the guide does not cover it, say you are not sure instead of guessing.
3. Wanting material generated (quiz, exam, flashcards, game, summary, guide, document): first call list_agents (and list_documents if the material is not obvious). If an agent fits, call propose_run_agent — that asks the user's permission with a card; do not write the material yourself. If no agent fits and they want something to keep (document, summary, study guide, glossary, notes), call search_material and then propose_document with the full content — do not write the whole document in the chat. Choose sensible options from what they said; ask ONE short question only if something essential is missing (which material, or how many).
4. If the user is describing a process they will repeat (or you did something repeatable that no existing agent can do), offer to turn it into an agent with propose_new_agent: write its prompt clearly (what to do with the material, the style, the rules) and its inputs.
5. Luna can only use its existing components, agents and tools. It can NOT create new template components or formats yet. For such requests, or anything else Luna cannot do, call log_unsupported_request and tell the user exactly: "This task is not covered by Luna now, but your request is taken and the Luna team will work on it."
6. Never claim to have run, saved or created anything: the cards you propose do that only after the user approves.
7. After a tool shows a card, write one or two sentences and stop.

${LUNA_GUIDE}`;
}

/** What a request will cost, estimated before anything is sent to the model. */
export function estimateChat({ system, history, hasMaterial }) {
  const base = approxTokens(system) + history.reduce((sum, message) => sum + approxTokens(message.content), 0);
  // One or two model calls (tool use re-sends the conversation), plus ~7k tokens of retrieved passages when there is material.
  const calls = hasMaterial ? 2 : 1;
  const input = base * calls + (hasMaterial ? 7000 : 0);
  const output = 900;
  const model = chatModel();
  const price = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o"];
  const tokens = input + output;
  return { tokens, inputTokens: input, outputTokens: output, costUsd: Number(((input * price.input + output * price.output) / 1e6).toFixed(4)), model, needsConfirm: tokens > CONFIRM_ABOVE_TOKENS };
}

function trimHistory(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && (message.role === "user" || message.role === "assistant") && String(message.content || "").trim())
    .slice(-MAX_HISTORY)
    .map((message) => ({ role: message.role, content: String(message.content).slice(0, 8000) }));
}

/**
 * One turn of the conversation. `emit` receives events: estimate, confirm, status, delta, sources,
 * actions, usage, error, done. Nothing is sent to the model until the estimate is accepted when it is large.
 */
export async function runChat({ messages, scope = {}, referencedDocumentIds = [], confirmed = false, emit, recordRequest }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { emit({ type: "error", error: "The assistant needs an OpenAI key (OPENAI_API_KEY) to answer." }); return; }

  const tree = await loadWorkspaceTreeForAi();
  const documents = documentsInScope(tree, scope, referencedDocumentIds);
  const referenced = documents.filter((document) => (referencedDocumentIds || []).includes(document.id));
  const history = trimHistory(messages);
  const lastUser = [...history].reverse().find((message) => message.role === "user")?.content || "";
  const ctx = { scope, documents, referenced, agents: agentsInScope(tree, scope.workspaceId), passages: [], actions: [], question: lastUser, chunksFor: chunkCache(), recordRequest: recordRequest || (async () => {}) };
  const system = buildSystemPrompt(ctx);

  const estimate = estimateChat({ system, history, hasMaterial: documents.some((document) => document.sourceType !== "generated") });
  emit({ type: "estimate", ...estimate });
  if (estimate.needsConfirm && !confirmed) { emit({ type: "confirm", ...estimate }); emit({ type: "done" }); return; }

  const model = chatModel();
  const conversation = [{ role: "system", content: system }, ...history];
  const usage = { prompt: 0, completion: 0 };
  let finalText = "";

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const last = step === MAX_STEPS - 1;
    const response = await openAiFetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, temperature: 0.3, max_tokens: 2400, stream: true, stream_options: { include_usage: true }, messages: conversation, ...(last ? {} : { tools: CHAT_TOOLS, tool_choice: "auto" }) })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      emit({ type: "error", error: payload.error?.message || "The assistant could not answer." });
      return;
    }
    const result = await readChatStream(response, (text) => emit({ type: "delta", text }));
    usage.prompt += result.usage?.prompt_tokens || 0;
    usage.completion += result.usage?.completion_tokens || 0;
    finalText += result.content;

    if (!result.toolCalls.length) break;
    conversation.push({ role: "assistant", content: result.content || null, tool_calls: result.toolCalls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments || "{}" } })) });
    for (const call of result.toolCalls) {
      let args = {};
      try { args = JSON.parse(call.arguments || "{}"); } catch { args = {}; }
      emit({ type: "status", text: statusFor(call.name, args) });
      let output;
      try { output = await executeTool(call.name, args, ctx); } catch (error) { output = { error: String(error.message || error) }; }
      conversation.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(output).slice(0, 24000) });
    }
  }

  const cited = new Set([...finalText.matchAll(/\[P(\d+)\]/g)].map((match) => `P${match[1]}`));
  const sources = sourcesFromPassages(ctx.passages.filter((passage) => cited.has(passage.n)));
  if (sources.length) emit({ type: "sources", sources });
  if (ctx.actions.length) emit({ type: "actions", actions: ctx.actions });
  const price = MODEL_PRICING[model] || MODEL_PRICING["gpt-4o"];
  emit({ type: "usage", model, promptTokens: usage.prompt, completionTokens: usage.completion, totalTokens: usage.prompt + usage.completion, costUsd: Number(((usage.prompt * price.input + usage.completion * price.output) / 1e6).toFixed(5)) });
  emit({ type: "done" });
}

function statusFor(name, args) {
  switch (name) {
    case "search_material": return `Searching your material for “${String(args.query || "").slice(0, 60)}”…`;
    case "list_documents": return "Looking through your documents…";
    case "list_agents": return "Checking which agents can do this…";
    case "propose_run_agent": return "Preparing the agent run…";
    case "propose_document": return "Writing the document…";
    case "propose_new_agent": return "Drafting the agent…";
    default: return "Working…";
  }
}
