import { BLOCKS } from "../ai-tools/blocks/blockRegistry.js";
import { chunkDocuments } from "../ai-tools/pipeline/chunking.js";
import { selectTopChunks } from "../ai-tools/pipeline/retrieval.js";
import { bestSentences, headingFor, terms } from "../activities/engine/activity";

/**
 * The things the assistant can do. Reading tools run on the server and return what they found;
 * "propose_*" tools change nothing: they put a card in front of the user, who decides.
 */

export const BUILTIN_AGENTS = [
  { key: "quiz", name: "Quiz Generator", description: "Questions from the material — multiple choice, true/false, short answer — as a quiz or an exam (interactive and printable).", options: "count, difficulty (Easy/Medium/Hard/Mixed), types, language, focus" },
  { key: "flashcards", name: "Vocabulary Flashcards", description: "Flashcards pairing a word with its translation or definition; playable as a flip deck and printable one side per page.", options: "count, language 1, language 2, difficulty, topic" }
];

const BLOCK_IDS = Object.keys(BLOCKS);

export const CHAT_TOOLS = [
  { type: "function", function: { name: "list_documents", description: "List the documents the assistant can read right now (name, id, subject, folder). Use it to find a document the user names or to pick material to generate from.", parameters: { type: "object", properties: { query: { type: "string", description: "Optional words to filter by document name" } } } } },
  { type: "function", function: { name: "search_material", description: "Search the user's material for passages that answer a question. ALWAYS use this before answering anything about the content of their documents. Returns numbered passages P1, P2…; cite them in your answer as [P1].", parameters: { type: "object", properties: { query: { type: "string", description: "What to look for, in the words of the document" }, documentIds: { type: "array", items: { type: "string" }, description: "Restrict to these documents (optional)" } }, required: ["query"] } } },
  { type: "function", function: { name: "list_agents", description: "List the agents that can generate material (built in and the user's own) with what each one needs.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "propose_run_agent", description: "Offer to run an existing agent to generate material (quiz, flashcards, a user's own agent). Shows the user a card to approve; nothing runs until they do. Ask this BEFORE writing the material yourself whenever an agent fits.", parameters: { type: "object", properties: { agent: { type: "string", description: "Agent key from list_agents: quiz, flashcards or agent:<id>" }, title: { type: "string", description: "A specific title for the result" }, sourceDocumentIds: { type: "array", items: { type: "string" }, description: "Documents to generate from (ids from list_documents)" }, options: { type: "object", description: "Answers to the agent's questions, e.g. {count: 10, difficulty: 'Medium', types: ['Multiple choice'], language: 'English', focus: 'cash flow'}" }, why: { type: "string", description: "One sentence: why this agent fits" } }, required: ["agent", "title"] } } },
  { type: "function", function: { name: "propose_document", description: "Write a document (summary, study guide, notes, glossary…) from the material and show it to the user to preview and save. It is laid out with Luna's default document template. Use only when no agent fits, or the user asked for a document.", parameters: { type: "object", properties: { title: { type: "string" }, blocks: { type: "array", description: "The document, in order", items: { type: "object", properties: { type: { type: "string", enum: ["heading", "paragraph", "bullet_list", "callout", "vocabulary"] }, text: { type: "string" }, level: { type: "number", description: "Heading level 1–4" }, title: { type: "string" }, items: { type: "array", items: { type: "string" } }, callout_type: { type: "string", description: "info, tip, warning or note" }, word: { type: "string" }, translation: { type: "string" }, example: { type: "string" } }, required: ["type"] } } }, required: ["title", "blocks"] } } },
  { type: "function", function: { name: "propose_new_agent", description: "When what the user does is a repeatable process that no existing agent can do, offer to turn it into a new agent. Shows the prompt for the user to review; they can save it and edit it later in AI agents.", parameters: { type: "object", properties: { name: { type: "string" }, purpose: { type: "string", description: "One sentence for people choosing it" }, instructions: { type: "string", description: "The agent's prompt: what it must do with the material, the style and the rules" }, inputs: { type: "array", description: "ONLY what the person running it chooses each time (language, length, focus…). The source material is NOT an input: it is always selected separately", items: { type: "object", properties: { name: { type: "string" }, type: { type: "string", enum: ["text", "number", "choice", "toggle", "language"] }, options: { type: "array", items: { type: "string" } }, default: { type: "string" } }, required: ["name", "type"] } }, output_blocks: { type: "array", description: "Which block kinds it may write", items: { type: "string", enum: BLOCK_IDS } } }, required: ["name", "purpose", "instructions", "output_blocks"] } } },
  { type: "function", function: { name: "log_unsupported_request", description: "Record a request Luna cannot do yet (new template components or formats, or anything outside the existing components, agents and tools) so the Luna team can work on it. Then tell the user exactly: 'This task is not covered by Luna now, but your request is taken and the Luna team will work on it.'", parameters: { type: "object", properties: { summary: { type: "string", description: "What the user asked for, in one or two sentences" } }, required: ["summary"] } } }
];

const clip = (value, max) => String(value ?? "").slice(0, max);
const norm = (value) => String(value || "").toLowerCase();

/** The documents the assistant may read, given the scope and what the user referenced. */
export function documentsInScope(tree, scope = {}, referenced = []) {
  const refs = new Set((referenced || []).filter(Boolean));
  const folderIds = new Set((scope.folderIds || []).filter(Boolean));
  const out = [];
  for (const workspace of tree) {
    if (scope.workspaceId && workspace.id !== scope.workspaceId) continue;
    for (const subject of workspace.subjects || []) {
      const foldersById = new Map((subject.folders || []).map((folder) => [folder.id, folder]));
      for (const document of subject.documents || []) {
        if (document.sourceType === "generated" && !(document.tags || []).includes("resource")) continue;
        if (String(document.reviewStatus || "approved") !== "approved") continue;
        const inFolder = !folderIds.size || (document.folderIds || []).some((id) => folderIds.has(id));
        const inSubject = !scope.subjectId || subject.id === scope.subjectId;
        const picked = refs.has(document.id);
        // Focus narrows to the chosen subject / folders; documents the user referenced are always in.
        if (scope.focus && !(picked || (inSubject && inFolder))) continue;
        out.push({ ...document, workspaceId: workspace.id, subjectId: subject.id, subjectName: subject.name, folderName: (document.folderIds || []).map((id) => foldersById.get(id)?.name).filter(Boolean).join(" / ") });
      }
    }
  }
  return out;
}

export function agentsInScope(tree, workspaceId) {
  const out = [];
  for (const workspace of tree) {
    if (workspaceId && workspace.id !== workspaceId) continue;
    for (const subject of workspace.subjects || []) {
      for (const document of subject.documents || []) {
        if (document.sourceType !== "generated" || !(document.tags || []).includes("ai-agent")) continue;
        let parsed = {};
        try { parsed = JSON.parse(String(document.content || "{}")); } catch { parsed = {}; }
        out.push({ key: `agent:${document.id}`, name: String(parsed.name || document.name).replace(/\.agent\.json$/, ""), description: clip(parsed.tagline || parsed.description || parsed.instructions, 220), inputs: (parsed.questions || []).map((question) => question.text).slice(0, 8) });
      }
    }
  }
  return out;
}

/**
 * Runs one tool call. `ctx` carries the documents in scope, the agents, the passages found so far
 * (so citations can be resolved) and the cards to show the user.
 */
export async function executeTool(name, args, ctx) {
  switch (name) {
    case "list_documents": {
      const q = norm(args.query);
      const docs = ctx.documents.filter((document) => !q || norm(document.name).includes(q) || norm(document.folderName).includes(q));
      return { count: docs.length, documents: docs.slice(0, 60).map((document) => ({ id: document.id, name: document.name, subject: document.subjectName, folder: document.folderName || "", kind: document.sourceType === "generated" ? "generated resource" : "uploaded" })) };
    }
    case "search_material": {
      const wanted = new Set((args.documentIds || []).filter(Boolean));
      const docs = ctx.documents.filter((document) => document.sourceType !== "generated" && (!wanted.size || wanted.has(document.id)));
      if (!docs.length) return { passages: [], note: "There is no readable material in scope. Ask the user to choose or upload a document." };
      const chunks = ctx.chunksFor(docs);
      const top = selectTopChunks(chunks, { topicPrompt: String(args.query || ""), title: "", questionCount: 3 }).slice(0, 7);
      const keys = terms(`${args.query || ""} ${ctx.question || ""}`);
      const passages = top.map((chunk) => {
        const number = ctx.passages.length + 1;
        const passage = { n: `P${number}`, documentId: chunk.documentId, documentName: chunk.documentName, chunkIndex: chunk.chunkIndex + 1, heading: Array.isArray(chunk.headingPath) ? chunk.headingPath.join(" › ") : "", page: chunk.page ?? null, content: clip(chunk.content, 3800) };
        passage.extract = bestSentences(passage.content, keys);
        passage.heading = headingFor(passage, passage.extract) || passage.heading;
        ctx.passages.push(passage);
        return passage;
      });
      return { passages: passages.map((passage) => ({ id: passage.n, document: passage.documentName, section: passage.heading, page: passage.page, text: clip(passage.content, 1800) })) };
    }
    case "list_agents":
      return { agents: [...BUILTIN_AGENTS, ...ctx.agents] };
    case "propose_run_agent": {
      const known = [...BUILTIN_AGENTS, ...ctx.agents].find((agent) => agent.key === args.agent);
      if (!known) return { error: `Unknown agent "${args.agent}". Call list_agents and use one of its keys.` };
      const sources = (args.sourceDocumentIds || []).map((id) => ctx.documents.find((document) => document.id === id)).filter(Boolean);
      ctx.actions.push({ id: `a${ctx.actions.length + 1}`, type: "run_agent", agent: known.key, agentName: known.name, title: clip(args.title, 120), sourceDocumentIds: sources.map((document) => document.id), sourceNames: sources.map((document) => document.name), options: args.options && typeof args.options === "object" ? args.options : {}, why: clip(args.why, 240) });
      return { shown: true, note: "A card with this agent run is now shown to the user, who decides whether to run it. Briefly say what it will do and stop; do not write the material yourself." };
    }
    case "propose_document": {
      const blocks = (Array.isArray(args.blocks) ? args.blocks : []).filter((block) => block && typeof block.type === "string").slice(0, 80);
      if (!blocks.length) return { error: "The document has no blocks." };
      ctx.actions.push({ id: `a${ctx.actions.length + 1}`, type: "document", title: clip(args.title, 140), blocks });
      return { shown: true, note: "The document is shown to the user with Preview and Save. Say in a sentence what it contains and stop." };
    }
    case "propose_new_agent": {
      const outputBlocks = (Array.isArray(args.output_blocks) ? args.output_blocks : []).filter((id) => BLOCK_IDS.includes(id));
      ctx.actions.push({ id: `a${ctx.actions.length + 1}`, type: "new_agent", name: clip(args.name, 80), purpose: clip(args.purpose, 240), instructions: clip(args.instructions, 4000), inputs: (Array.isArray(args.inputs) ? args.inputs : []).slice(0, 8), outputBlocks: outputBlocks.length ? outputBlocks : ["document_header", "heading", "paragraph", "bullet_list"] });
      return { shown: true, note: "The proposed agent and its prompt are shown to the user, who can save it. Explain in a sentence why an agent fits and stop." };
    }
    case "log_unsupported_request": {
      await ctx.recordRequest(clip(args.summary, 600));
      return { recorded: true, say: "This task is not covered by Luna now, but your request is taken and the Luna team will work on it." };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export function chunkCache() {
  const cache = new Map();
  return (documents) => documents.flatMap((document) => {
    if (!cache.has(document.id)) cache.set(document.id, chunkDocuments([{ ...document, documentId: document.id, documentName: document.name }]));
    return cache.get(document.id);
  });
}
