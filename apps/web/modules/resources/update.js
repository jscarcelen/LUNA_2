/**
 * Update a generated resource: "make the questions harder", "add a section on X", "shorter, in French".
 *
 * Luna runs the SAME agent again, with the same choices and material the resource was made with, plus
 * the user's words. The words first go through the prompt improver of Iterate (a precise brief with a
 * scope and targets), then the writer gets the brief together with the previous output and rewrites it.
 * Everything here is headless — no run page — so the workspace, the reader, Activities, the plan steps
 * and the chat can all offer "Update…" and show the same dialog (UpdateDialog.js).
 *
 * The pieces are the ones the run page uses: the agent comes from a built-in key or a saved agent
 * document (recompiled from its spec), the run config has the shape RunAgentPage builds, the improver is
 * /api/ai-tools/agent-builder/iterate, generation goes through /api/ai-tools/agent-builder/stream.
 *
 * Pure functions (resolve, build, decide, diff, versions, merge) are unit-tested; `updateResource` is the
 * only part that talks to the network, and takes `fetchImpl` so tests can fake it.
 */
import { QUIZ_AGENT } from "../ai-tools/tools/quiz-generator/quizAgent";
import { CONSOLIDATOR_AGENT } from "../ai-tools/tools/summary-consolidator/consolidatorAgent";
import { runConfigFromSpec } from "../agent-studio/engine/migrate";
import { runAgentStreaming } from "../ai-tools/tools/agent-builder/readAgentStream";
import { composeRefinementPrompt, describeResult } from "../ai-tools/pipeline/iterateContext";
import { MASTER_TAG } from "../ai-tools/pipeline/masterDocument";
import { attachSources, buildActivity } from "../activities/engine/activity";
import { blocksToActivityItems } from "../template-studio/output/outputDocument";
import { STEP_RECIPES, fieldDefs } from "../plans/execute";
import { parsePlan } from "../plans/plan";
import { isSharedDocument, sharedInfoOf } from "../accounts/shared";
import { attemptsFor, parseResource, trimSources } from "./resource";
import { resourceBlocks } from "./look";

/* ------------------------------------------------------------------------------------ constants */

export const MAX_VERSIONS = 5;
export const ASSISTANT_AGENT_NAME = "Luna assistant";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const norm = (value) => clean(value).toLowerCase().replace(/[.,;:!?"'()]/g, "");
const sameName = (a, b) => Boolean(clean(a)) && clean(a).toLowerCase() === clean(b).toLowerCase();

/** The agents Luna ships with, by the kind of resource they make. */
export const BUILTIN_AGENTS = [
  { id: "quiz", kind: "quiz", label: "Quiz Generator", agent: QUIZ_AGENT },
  { id: "flashcards", kind: "flashcards", label: STEP_RECIPES.flashcards.agent.name, agent: STEP_RECIPES.flashcards.agent },
  { id: "summary", kind: "summary", label: STEP_RECIPES.summary.agent.name, agent: STEP_RECIPES.summary.agent },
  { id: "consolidator", kind: "master", label: CONSOLIDATOR_AGENT.name, agent: CONSOLIDATOR_AGENT }
];

/** The same quick suggestions as Iterate, then the ones that fit the kind of resource. */
const COMMON_SUGGESTIONS = ["Focus more on…", "Make it shorter", "Add more detail", "Simpler language", "Add examples", "Cover the formulas"];
const KIND_SUGGESTIONS = {
  quiz: ["Make it harder", "More calculation questions", "Cover chapter 3 only", "Translate to Spanish"],
  flashcards: ["Make the cards harder", "Add 10 more cards", "Add an example to each card", "Translate to Spanish"],
  summary: ["Shorter", "Add examples", "Add formulas"],
  document: ["Shorter", "Add examples", "Add formulas"],
  master: ["Shorter", "Add examples", "Add formulas", "Add a section on…"]
};
export const suggestionsFor = (kind) => [...(KIND_SUGGESTIONS[kind] || KIND_SUGGESTIONS.document), ...COMMON_SUGGESTIONS];

/* ------------------------------------------------------------------------------------ what it is */

const isFlashcardSet = (resource) => {
  const questions = resource?.activity?.questions || [];
  return questions.length > 0 && questions.every((question) => question.kind === "flashcard");
};

/** quiz | flashcards | summary | document | master */
export function kindOfResource(resource, document = null) {
  if ((document?.tags || []).includes(MASTER_TAG) || resource?.master) return "master";
  if (isFlashcardSet(resource)) return "flashcards";
  if (resource?.activity?.questions?.length) return "quiz";
  if (/summary/i.test(String(resource?.meta?.agentName || ""))) return "summary";
  return "document";
}

const KIND_WORDS = { quiz: "question", flashcards: "card", summary: "section", document: "section", master: "section" };

/** "Quiz Generator · 10 questions · made from Accounting.pdf" */
export function describeResource(resource, document = null) {
  const kind = kindOfResource(resource, document);
  const count = resource?.activity?.questions?.length || (resourceBlocks(resource) || []).length || 0;
  const word = KIND_WORDS[kind];
  const names = (resource?.meta?.sourceNames || []).filter(Boolean);
  return [
    resource?.meta?.agentName || "Luna",
    count ? `${count} ${kind === "quiz" || kind === "flashcards" ? word : "block"}${count === 1 ? "" : "s"}` : "",
    names.length ? `made from ${names.slice(0, 3).join(", ")}${names.length > 3 ? ` +${names.length - 3}` : ""}` : ""
  ].filter(Boolean).join(" · ");
}

/** Resources the assistant wrote in chat have no agent to run again. */
export const canUpdateResource = (resource) => Boolean(resource) && !sameName(resource?.meta?.agentName, ASSISTANT_AGENT_NAME);

/* ------------------------------------------------------------------------------------ the agent */

/** A saved agent, recompiled from its spec exactly like the run page does, so recipe improvements apply. */
export function compileSavedAgent(content) {
  let parsed = JSON.parse(String(content || "{}"));
  if (parsed.spec && typeof parsed.spec === "object" && Array.isArray(parsed.spec.outputSchema)) {
    try {
      const { spec, ...rest } = parsed;
      const fresh = runConfigFromSpec(spec);
      parsed = { ...rest, ...fresh, scope: { ...fresh.scope, ...(rest.scope || {}) }, installedFrom: rest.installedFrom, outputStyles: rest.outputStyles, savedOutput: rest.savedOutput };
    } catch { /* keep the stored compiled config */ }
  }
  return parsed;
}

const builtinOfKind = (kind) => {
  const id = { quiz: "quiz", flashcards: "flashcards", summary: "summary", document: "summary", master: "consolidator" }[kind] || "summary";
  return BUILTIN_AGENTS.find((entry) => entry.id === id) || null;
};

/** The saved agents of a workspace: documents tagged `ai-agent`. */
export const agentDocumentsOf = (documents = []) => documents.filter((document) => document.sourceType === "generated" && (document.tags || []).includes("ai-agent"));

/**
 * Which agent made this resource.
 *  - ok: { status: "ok", source: "builtin" | "saved", agent, label, documentId }
 *  - missing: its saved agent was deleted (or never recorded and not found by name):
 *    { status: "missing", name, fallback: { id, label, agent } | null } — the dialog offers "Run it as a copy
 *    with the built-in agent of the same kind".
 *  - unsupported: written by the chat assistant, nothing to run again.
 */
export function resolveAgent({ resource, document = null, agentDocuments = [] }) {
  const meta = resource?.meta || {};
  const kind = kindOfResource(resource, document);
  if (!canUpdateResource(resource)) return { status: "unsupported", kind, name: meta.agentName || "" };
  const read = (agentDocument) => {
    try { return compileSavedAgent(agentDocument.content); } catch { return null; }
  };
  if (meta.agentId) {
    const found = agentDocuments.find((entry) => entry.id === meta.agentId);
    const agent = found ? read(found) : null;
    if (agent) return { status: "ok", source: "saved", agent, label: agent.name || meta.agentName || "Agent", documentId: found.id, kind };
    return { status: "missing", kind, name: meta.agentName || "", reason: found ? "unreadable" : "deleted", fallback: builtinOfKind(kind) };
  }
  const builtin = BUILTIN_AGENTS.find((entry) => sameName(entry.agent.name, meta.agentName));
  if (builtin) return { status: "ok", source: "builtin", agent: builtin.agent, label: builtin.label, documentId: "", kind };
  // Made by a saved agent in a plan (before the id was recorded): the name still finds it.
  const byName = agentDocuments.map((entry) => ({ entry, agent: read(entry) })).filter((row) => row.agent && sameName(row.agent.name, meta.agentName));
  if (byName.length === 1) return { status: "ok", source: "saved", agent: byName[0].agent, label: byName[0].agent.name, documentId: byName[0].entry.id, kind };
  return { status: "missing", kind, name: meta.agentName || "", reason: "unknown", fallback: builtinOfKind(kind) };
}

/** `resolveAgent` + the user's choice: a missing agent can still be run as a copy with the built-in of the same kind. */
export function chooseAgent(resolution, useFallback = false) {
  if (resolution.status === "ok") return resolution;
  if (resolution.status === "missing" && useFallback && resolution.fallback) {
    return { status: "ok", source: "builtin", agent: resolution.fallback.agent, label: resolution.fallback.label, documentId: "", kind: resolution.kind, fallback: true };
  }
  return null;
}

/* ------------------------------------------------------------------------------------ choices + material */

const defaultAnswer = (question) => {
  if (question.defaultValue !== undefined && question.defaultValue !== null) return question.type === "number" ? String(question.defaultValue) : question.defaultValue;
  if (question.type === "multi-select") return [];
  return "";
};

const TYPE_OF_KIND = { choice: "Multiple choice", boolean: "True / false", text: "Short answer", number: "Short answer" };

/**
 * The answers to the agent's questions: the defaults, then what the resource was made with — by question
 * id, else by the question's words (built-in agents are rebuilt with new ids on every load) — and for the
 * built-in quiz, what the resource itself says (its number of questions and their types).
 */
export function answersForResource(agent, resource) {
  const questions = Array.isArray(agent?.questions) ? agent.questions : [];
  const request = resource?.request || {};
  const answers = {};
  for (const question of questions) answers[question.id] = defaultAnswer(question);
  const isBuiltinQuiz = sameName(agent?.name, QUIZ_AGENT.name) && questions.some((question) => question.id === "q-count");
  if (isBuiltinQuiz && resource?.activity?.questions?.length) {
    const kinds = [...new Set(resource.activity.questions.map((question) => TYPE_OF_KIND[question.kind]).filter(Boolean))];
    answers["q-count"] = String(resource.activity.questions.length);
    answers["q-difficulty"] = "Mixed";
    answers["q-types"] = kinds.length ? kinds : ["Multiple choice"];
  }
  const saved = request.answersByQuestionId && typeof request.answersByQuestionId === "object" ? request.answersByQuestionId : {};
  for (const question of questions) if (question.id in saved && saved[question.id] !== undefined && saved[question.id] !== null) answers[question.id] = saved[question.id];
  const byWords = Array.isArray(request.answersByQuestion) ? request.answersByQuestion : [];
  for (const entry of byWords) {
    const question = questions.find((candidate) => sameName(candidate.text, entry?.question));
    if (question && !(question.id in saved) && entry.answer !== undefined && entry.answer !== null && entry.answer !== "") answers[question.id] = entry.answer;
  }
  // A required single choice is never left blank.
  for (const question of questions) {
    if (question.type === "single-select" && !answers[question.id] && question.options?.length) answers[question.id] = question.options[0];
  }
  return answers;
}

/** [{ question, answer }] as the run config carries them. */
export const questionAnswersOf = (agent, answers) => (Array.isArray(agent?.questions) ? agent.questions : []).map((question) => ({ question: question.text, answer: answers[question.id] }));

/**
 * The material to read: the documents the user picked for this update, else the ones the resource was made
 * from (still existing), else — for pasted text — the text. `missing` lists source documents that are gone.
 */
export function resolveMaterial({ resource, picked = null, documents = [] }) {
  const request = resource?.request || {};
  const exists = new Set(documents.map((document) => document.id));
  const styleDocumentIds = (Array.isArray(request.styleDocumentIds) ? request.styleDocumentIds : []).filter((id) => exists.has(id));
  if (Array.isArray(picked) && picked.length) {
    return { documentIds: picked.filter((id) => exists.has(id)), missing: [], knowledgeMode: "workspace", contextPromptDraft: "", styleDocumentIds, different: true };
  }
  const asked = [request.referenceDocumentIds, request.sourceDocumentIds, resource?.meta?.sourceDocumentIds].find((list) => Array.isArray(list) && list.length) || [];
  const documentIds = [...new Set(asked)].filter((id) => exists.has(id));
  const missing = [...new Set(asked)].filter((id) => !exists.has(id));
  const context = String(request.contextPromptDraft || "").trim();
  const knowledgeMode = request.knowledgeMode === "context" && context ? "context" : "workspace";
  return { documentIds, missing, knowledgeMode, contextPromptDraft: knowledgeMode === "context" ? context : "", styleDocumentIds, different: false };
}

/** Does the run have anything to read? An agent whose material is optional can run without. */
export function hasMaterial(agent, material) {
  const optional = Array.isArray(agent?.materialSlots) && (!agent.materialSlots.length || agent.materialSlots.every((slot) => !slot.required));
  if (optional) return true;
  if ((agent?.scope?.documentIds || []).length) return true;
  return material.knowledgeMode === "context" ? Boolean(material.contextPromptDraft) : material.documentIds.length > 0;
}

/* ------------------------------------------------------------------------------------ the run config */

/** The config RunAgentPage sends for an agent, its answers and its material. */
export function buildRunConfig({ agent, answers, material, workspaceId = "", subjectId = "" }) {
  const fields = Array.isArray(agent?.template?.fields) ? agent.template.fields : [];
  const own = Array.isArray(agent?.scope?.documentIds) ? agent.scope.documentIds : [];
  const picked = material.knowledgeMode === "workspace" ? material.documentIds : [];
  return {
    name: agent.name,
    instructions: agent.instructions || "",
    knowledgeText: agent.knowledgeText || "",
    contextPrompt: material.knowledgeMode === "context" ? material.contextPromptDraft : "",
    questionAnswers: questionAnswersOf(agent, answers),
    outputExample: agent.outputExample || "",
    model: agent.model,
    creativity: agent.creativity,
    template: { fields },
    outputJsonSchema: agent.outputJsonSchema || null,
    validationRules: agent.validationRules || [],
    spec: agent.spec || null,
    inputValues: answers,
    scope: {
      workspaceId,
      // Picked documents may belong to any topic of the workspace.
      subjectId: picked.length || own.length ? "" : subjectId,
      documentIds: [...picked, ...own],
      styleDocumentIds: material.styleDocumentIds || []
    }
  };
}

const stripInternal = (list) => (list || []).map((item) => Object.fromEntries(Object.entries(item || {}).filter(([key]) => !key.startsWith("_"))));

/** What the writer is shown as the result to rewrite — the same shape Iterate sends. */
export function previousOutputOf(resource) {
  const data = resource?.data || {};
  if (data.isBlockOutput && Array.isArray(data.blocks)) return data.blocks;
  const { items, sources: _sources, blocks: _blocks, isBlockOutput: _flag, originals: _originals, coverage: _coverage, ...root } = data;
  return { ...root, items: stripInternal(items) };
}

/** The numbered outline the improver reads, and the names of the output fields. */
export function describeCurrent(resource) {
  const data = resource?.data || {};
  if (data.isBlockOutput && Array.isArray(data.blocks)) return describeResult({ blocks: data.blocks });
  return describeResult({ items: stripInternal(data.items) });
}

const isConsolidation = (agent) => agent?.spec?.pipeline === "consolidate";

/**
 * Everything needed to run the update: the run config with the user's request in it. The consolidator
 * re-reads its documents and has no "previous output" mode, so the words go in as its Focus ("the changes
 * asked on the earlier version"); every other agent gets `refinementPrompt` + `previousOutput`, like Iterate.
 */
export function buildUpdateConfig({ resource, agent, material, workspaceId = "", subjectId = "", refinementPrompt = "", answers = null }) {
  const choices = answers || answersForResource(agent, resource);
  const note = clean(refinementPrompt);
  if (isConsolidation(agent)) {
    const focusQuestion = (agent.questions || []).find((question) => /focus|emphasis/i.test(question.text || ""));
    const withFocus = focusQuestion ? { ...choices, [focusQuestion.id]: [clean(choices[focusQuestion.id]), note ? `the following changes to the earlier version of these notes — ${note}` : ""].filter(Boolean).join(" · ") } : choices;
    return { config: buildRunConfig({ agent, answers: withFocus, material, workspaceId, subjectId }), answers: choices };
  }
  const config = buildRunConfig({ agent, answers: choices, material, workspaceId, subjectId });
  const keep = questionAnswersOf(agent, choices).filter((entry) => String(Array.isArray(entry.answer) ? entry.answer.join(", ") : entry.answer ?? "").trim());
  const keepNote = keep.length
    ? `\n\nKEEP THE CHOICES OF THE EARLIER RESULT unless the request changes them: ${keep.map((entry) => `${entry.question} → ${Array.isArray(entry.answer) ? entry.answer.join(", ") : entry.answer}`).join("; ")}. Keep its language, level and kind of items.`
    : "\n\nKEEP the language, level and kind of items of the earlier result unless the request changes them.";
  return {
    config: {
      ...config,
      creativity: config.creativity === "low" ? "medium" : config.creativity,
      refinementPrompt: `${note}${keepNote}`.trim(),
      previousOutput: previousOutputOf(resource)
    },
    answers: choices
  };
}

/** Words → a precise brief (scope, targets, checklist), like Iterate. Without the improver the user's own words are sent. */
export async function improveRequest({ resource, agent, instruction, answers, earlier = [], fetchImpl = fetch }) {
  const prompt = clean(instruction);
  const described = describeCurrent(resource);
  try {
    const response = await fetchImpl("/api/ai-tools/agent-builder/iterate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: prompt,
        agentName: agent.name,
        instructions: agent.instructions,
        choices: questionAnswersOf(agent, answers),
        outline: described.outline,
        fields: described.fieldNames,
        earlier
      })
    });
    const improved = await response.json();
    if (improved?.improved && improved.brief) return { refinementPrompt: composeRefinementPrompt(prompt, improved), understood: improved.understood || "", scope: improved.scope || "", improved: true };
  } catch { /* the user's own words are sent */ }
  return { refinementPrompt: prompt, understood: "", scope: "", improved: false };
}

/* ------------------------------------------------------------------------------------ the new resource */

/**
 * The resource the update produces, from the writer's output. It keeps what belongs to the item (name,
 * concepts, context, notes, request, meta) and replaces what was written (data, activity). In an
 * activity, a question the writer left as it was keeps its id, classification and source, and the
 * activity keeps its id — so attempts and plans still recognise it.
 */
export function rebuildResource({ previous, output, agent, instruction = "", material = null, answers = null, keepFormat = true, now = new Date().toISOString() }) {
  const blocks = output?.isBlockOutput && Array.isArray(output.blocks) ? output.blocks : null;
  const items = blocks ? [] : (Array.isArray(output?.items) ? output.items : []);
  if (!items.length && !blocks?.length) throw new Error("The agent returned nothing to update the result with.");
  const consolidation = output?.consolidation || null;
  const data = blocks
    ? { items: [], isBlockOutput: true, blocks, sources: trimSources(output.sources), ...(output.data?.title ? { title: output.data.title } : {}), ...(consolidation ? { originals: consolidation.originals, coverage: consolidation.coverage } : {}) }
    : { ...(output.data || {}), items, sources: trimSources(output.sources) };

  let activity = null;
  try {
    const rows = blocks ? blocksToActivityItems(blocks) : items;
    if (rows.length) {
      const schemaFields = blocks
        ? fieldDefs(Object.keys(Object.assign({}, ...rows)).map((name) => ({ name, type: rows.some((row) => Array.isArray(row[name])) ? "array" : "text", repeatScope: "per-output" })))
        : (Array.isArray(agent?.spec?.outputSchema) && agent.spec.outputSchema.length ? agent.spec.outputSchema : fieldDefs(agent?.template?.fields || []));
      const built = attachSources(buildActivity(schemaFields, { ...(output.data || {}), items: rows }, { title: previous.name, agentId: previous.meta?.agentId || "", agentName: agent?.name || previous.meta?.agentName || "" }), Array.isArray(output.sources) ? output.sources : []);
      if (built.questions.length) activity = mergeActivity(previous.activity, { ...built, title: previous.activity?.title || previous.name });
    }
  } catch { activity = null; }

  const choices = answers || {};
  const questionsByWords = agent ? questionAnswersOf(agent, choices) : previous.request?.answersByQuestion;
  const next = {
    ...previous,
    activity,
    data,
    request: {
      ...(previous.request || {}),
      ...(material?.different ? { referenceDocumentIds: material.documentIds, sourceDocumentIds: material.documentIds, knowledgeMode: "workspace" } : {}),
      ...(Array.isArray(questionsByWords) ? { answersByQuestion: questionsByWords } : {}),
      ...(keepFormat ? {} : { outputStyles: {} }),
      lastInstruction: clean(instruction)
    },
    meta: {
      ...(previous.meta || {}),
      ...(material?.different ? { sourceDocumentIds: material.documentIds, sourceNames: material.names || [] } : {}),
      questionCount: activity ? activity.questions.length : 0,
      updatedAt: now
    }
  };
  if (consolidation) next.master = { originals: consolidation.originals, coverage: consolidation.coverage, builtAt: now };
  return next;
}

/**
 * The new activity with the old one's identity: same id; a question the writer returned unchanged is the
 * old question object (id, skill, difficulty, source as the user left them); a new or reworded question gets
 * an id that cannot be mistaken for an old one, so earlier answers never attach to the wrong question.
 */
export function mergeActivity(before, after) {
  if (!after) return after;
  if (!before?.questions?.length) return before?.id ? { ...after, id: before.id } : after;
  const old = new Map(before.questions.map((question) => [norm(question.prompt), question]));
  const taken = new Set(before.questions.map((question) => question.id));
  const used = new Set();
  const questions = after.questions.map((question, index) => {
    const same = old.get(norm(question.prompt));
    if (same && !used.has(same.id) && sameQuestionBody(same, question)) { used.add(same.id); return same; }
    if (same && !used.has(same.id)) used.add(same.id);
    let id = question.id;
    if (taken.has(id) || used.has(id)) id = `${question.id}_u${index + 1}`;
    while (taken.has(id)) id = `${id}x`;
    taken.add(id);
    return { ...question, id };
  });
  return { ...after, id: before.id || after.id, questions };
}

const bodyOf = (question) => JSON.stringify([norm(question.answer && typeof question.answer === "object" ? JSON.stringify(question.answer) : question.answer), (question.options || []).map(norm), norm(question.explanation), norm(question.back), (question.pairs || []).map((pair) => `${norm(pair.left)}=${norm(pair.right)}`)]);
const sameQuestionBody = (a, b) => bodyOf(a) === bodyOf(b);

/* ------------------------------------------------------------------------------------ replace or copy */

/** Plans that have this resource as a step. */
export function plansUsing(documentId, documents = []) {
  const out = [];
  for (const document of documents) {
    const plan = parsePlan(document);
    if (!plan) continue;
    if ((plan.items || []).some((item) => item.resourceId === documentId) || plan.masterDocumentId === documentId) out.push({ id: document.id, name: plan.name });
  }
  return out;
}

/** Resources made from this document (a master document's quizzes and summaries). */
export function dependantsOf(documentId, documents = []) {
  const out = [];
  for (const document of documents) {
    if (document.id === documentId) continue;
    const resource = parseResource(document);
    if (!resource) continue;
    const sources = [resource.request?.referenceDocumentIds, resource.request?.sourceDocumentIds, resource.meta?.sourceDocumentIds].flat().filter(Boolean);
    if (sources.includes(documentId)) out.push({ document, resource });
  }
  return out;
}

/**
 * Replace the item, or save the result next to it? An item people have answered, or that plans point at,
 * is kept as it is and the update is saved as a copy (the original stays what the attempts and the plans
 * refer to). An item nobody used is replaced. A document someone shared read-only can only be copied.
 */
export function decideMode({ document = null, resource = null, documents = [], attempts = null }) {
  if (!document) return { mode: "replace", canReplace: true, reasons: [] };
  const list = attempts || attemptsFor(document.id, resource?.activity?.id, documents);
  const plans = plansUsing(document.id, documents);
  const shared = sharedInfoOf(document);
  const readOnly = isSharedDocument(document) || (shared && shared.permission !== "edit");
  const dependants = (document.tags || []).includes(MASTER_TAG) ? dependantsOf(document.id, documents) : [];
  const reasons = [];
  if (list.length) reasons.push(`it has ${list.length} attempt${list.length === 1 ? "" : "s"}`);
  if (plans.length) reasons.push(`it is a step of ${plans.map((plan) => `“${plan.name}”`).join(", ")}`);
  if (dependants.length) reasons.push(`${dependants.length} other item${dependants.length === 1 ? " is" : "s are"} made from it`);
  if (readOnly) reasons.push("it was shared with you as view only");
  return { mode: reasons.length ? "copy" : "replace", canReplace: !readOnly, reasons, attempts: list.length, plans, dependants: dependants.length };
}

/** "Quiz" → "Quiz (v2)" → "Quiz (v3)": the next free name for a copy. */
export function copyName(name, existingNames = []) {
  const base = clean(name).replace(/\s*\(v\d+\)\s*$/i, "") || "Resource";
  const taken = new Set(existingNames.map((entry) => clean(entry).toLowerCase()));
  for (let n = 2; n < 500; n += 1) {
    const candidate = `${base} (v${n})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (copy)`;
}

/* ------------------------------------------------------------------------------------ versions */

/** What a version keeps: the written content only (sources shortened — questions carry their own extracts). */
export function snapshotOf(resource) {
  const data = resource?.data || {};
  return {
    name: resource?.name || "",
    data: { ...data, sources: (Array.isArray(data.sources) ? data.sources : []).slice(0, 12).map((source) => ({ ...source, content: String(source?.content || "").slice(0, 600) })) },
    activity: resource?.activity || null
  };
}

let versionCounter = 0;
const versionId = () => `v_${Date.now().toString(36)}${(versionCounter += 1).toString(36)}`;

/** The newest MAX_VERSIONS versions, newest first: each is the state BEFORE the update that `prompt` asked for. */
export function pushVersion(resource, { prompt = "", model = "", agentName = "", now = new Date().toISOString() } = {}) {
  const entry = { id: versionId(), at: now, prompt: clean(prompt), model, agentName: agentName || resource?.meta?.agentName || "", ...snapshotOf(resource) };
  return [entry, ...(Array.isArray(resource?.versions) ? resource.versions : [])].slice(0, MAX_VERSIONS);
}

/** Go back to a version. The state being left becomes a version too, so restoring can itself be undone. */
export function restoreVersion(resource, id, { now = new Date().toISOString() } = {}) {
  const versions = Array.isArray(resource?.versions) ? resource.versions : [];
  const target = versions.find((entry) => entry.id === id);
  if (!target) return resource;
  const left = { id: versionId(), at: now, prompt: `Restored the version of ${new Date(target.at).toLocaleDateString()}`, model: resource?.meta?.model || "", agentName: resource?.meta?.agentName || "", ...snapshotOf(resource) };
  return {
    ...resource,
    name: target.name || resource.name,
    data: target.data,
    activity: target.activity,
    versions: [left, ...versions.filter((entry) => entry.id !== id)].slice(0, MAX_VERSIONS),
    meta: { ...(resource.meta || {}), updatedAt: now, questionCount: target.activity ? target.activity.questions.length : 0 }
  };
}

/**
 * The resource that results from applying an update.
 *  - replace: the same item, with the previous content pushed onto its versions;
 *  - copy: a new item (fresh versions, a new name), the original untouched.
 */
export function applyUpdate({ previous, next, mode, instruction = "", model = "", existingNames = [], originalDocumentId = "", now = new Date().toISOString() }) {
  if (mode === "copy") {
    const name = copyName(previous.name, existingNames);
    return { ...next, name, versions: [], createdAt: now, activity: next.activity ? { ...next.activity, title: name } : null, meta: { ...(next.meta || {}), updatedAt: now, updatedFrom: originalDocumentId, model } };
  }
  return { ...next, versions: pushVersion(previous, { prompt: instruction, model, now }), meta: { ...(next.meta || {}), updatedAt: now, model } };
}

/** Sources that were updated after this resource was made: "based on an older version of …". */
export function staleSources(resource, documents = []) {
  const asked = [...new Set([resource?.request?.referenceDocumentIds, resource?.request?.sourceDocumentIds, resource?.meta?.sourceDocumentIds].flat().filter(Boolean))];
  const builtAt = String(resource?.meta?.updatedAt || resource?.createdAt || "");
  const out = [];
  for (const id of asked) {
    const document = documents.find((entry) => entry.id === id);
    const source = document ? parseResource(document) : null;
    const changed = String(source?.meta?.updatedAt || "");
    if (source && changed && changed > builtAt) out.push({ id, name: source.name, updatedAt: changed });
  }
  return out;
}

/* ------------------------------------------------------------------------------------ comparing */

const textOfBlock = (block) => Object.entries(block || {}).filter(([key]) => key !== "type" && !key.startsWith("_")).map(([, value]) => (Array.isArray(value) ? value.map((entry) => (entry && typeof entry === "object" ? Object.values(entry).join(" ") : entry)).join(" ") : value && typeof value === "object" ? Object.values(value).join(" ") : value)).filter((value) => value !== null && value !== undefined && value !== "").join(" ");
export const blockText = (block) => clean(textOfBlock(block));

const tokens = (value) => new Set(norm(value).split(/\s+/).filter((word) => word.length > 2));
export function similarity(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const word of x) if (y.has(word)) shared += 1;
  return shared / (x.size + y.size - shared);
}

/** Pairs old and new by exact words first, then by closeness (same-ish question reworded = changed). */
function pairUp(before, after, textOf, bodyOfItem, threshold) {
  const rows = new Array(after.length).fill(null);
  const left = new Set(before.map((_, index) => index));
  after.forEach((item, index) => {
    const exact = [...left].find((candidate) => norm(textOf(before[candidate])) === norm(textOf(item)));
    if (exact !== undefined) {
      left.delete(exact);
      rows[index] = { status: bodyOfItem(before[exact]) === bodyOfItem(item) ? "same" : "changed", before: before[exact], after: item };
    }
  });
  after.forEach((item, index) => {
    if (rows[index]) return;
    let best = -1;
    let bestScore = threshold;
    for (const candidate of left) {
      const score = similarity(textOf(before[candidate]), textOf(item));
      // The closest wording wins; between equals, the one at the nearest position.
      if (score > bestScore || (score >= bestScore && (best < 0 || Math.abs(candidate - index) < Math.abs(best - index)))) { best = candidate; bestScore = score; }
    }
    if (best >= 0) { left.delete(best); rows[index] = { status: "changed", before: before[best], after: item }; }
    else rows[index] = { status: "added", before: null, after: item };
  });
  const removed = [...left].map((index) => ({ status: "removed", before: before[index], after: null }));
  return { rows, removed };
}

/** Longest-common-subsequence alignment of two lists of signatures → matched index pairs. */
function align(a, b) {
  const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { pairs.push([i, j]); i += 1; j += 1; }
    else if (table[i + 1][j] >= table[i][j + 1]) i += 1;
    else j += 1;
  }
  return pairs;
}

/**
 * What an update changed. Questions and cards: new / changed / removed (matched by their words). Documents:
 * every block of the new version marked same / changed / added, with the removed ones in place, aligned by
 * their order. `counts` summarises it; `kind` says which view to draw.
 */
export function diffResources(before, after) {
  const beforeQuestions = before?.activity?.questions || [];
  const afterQuestions = after?.activity?.questions || [];
  let kind;
  let rows;
  if (beforeQuestions.length || afterQuestions.length) {
    kind = "questions";
    const paired = pairUp(beforeQuestions, afterQuestions, (question) => question.prompt, (question) => bodyOf(question), 0.5);
    rows = [...paired.rows, ...paired.removed].map((row) => ({ ...row, label: row.after?.prompt || row.before?.prompt || "" }));
  } else {
    kind = "blocks";
    const a = resourceBlocks(before) || [];
    const b = resourceBlocks(after) || [];
    const signature = (block) => `${block?.type || ""}|${norm(blockText(block))}`;
    const matched = align(a.map(signature), b.map(signature));
    rows = [];
    let i = 0;
    let j = 0;
    const gap = (toI, toJ) => {
      const olds = a.slice(i, toI);
      const news = b.slice(j, toJ);
      const used = new Set();
      const pairedNew = news.map((block) => {
        let best = -1;
        let bestScore = 0.35;
        olds.forEach((old, index) => {
          if (used.has(index) || (old?.type || "") !== (block?.type || "")) return;
          const score = similarity(blockText(old), blockText(block));
          if (score >= bestScore) { best = index; bestScore = score; }
        });
        if (best >= 0) { used.add(best); return { status: "changed", before: olds[best], after: block }; }
        return { status: "added", before: null, after: block };
      });
      // Removed blocks sit where they were: before the new blocks that followed them in the old order.
      olds.forEach((old, index) => { if (!used.has(index)) rows.push({ status: "removed", before: old, after: null }); });
      rows.push(...pairedNew);
    };
    for (const [mi, mj] of matched) {
      gap(mi, mj);
      rows.push({ status: "same", before: a[mi], after: b[mj] });
      i = mi + 1;
      j = mj + 1;
    }
    gap(a.length, b.length);
    rows = rows.map((row) => ({ ...row, label: blockText(row.after || row.before).slice(0, 140) }));
  }
  const counts = { same: 0, changed: 0, added: 0, removed: 0 };
  for (const row of rows) counts[row.status] += 1;
  return { kind, rows, counts, changedAnything: counts.changed + counts.added + counts.removed > 0 };
}

/* ------------------------------------------------------------------------------------ run it */

export class UpdateError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    Object.assign(this, extra);
  }
}

/**
 * Runs the update end to end and returns the proposal — nothing is saved here.
 * `onProgress({ step, status, … })`: "understand" (the improver), then the writer's own steps (scope, chunk,
 * retrieve, generate with tokens, validate), then "compare".
 *
 * Returns { resource, previous, diff, usage, model, understood, agent, material, answers, checks }.
 */
export async function updateResource({ document = null, resource, instruction, material = null, keepFormat = true, workspace = null, useFallback = false, onProgress, fetchImpl = fetch, now = new Date().toISOString() }) {
  const words = clean(instruction);
  if (!words) throw new UpdateError("no-instruction", "Say what to change.");
  const documents = (workspace?.subjects || []).flatMap((subject) => subject.documents || []);
  const resolution = resolveAgent({ resource, document, agentDocuments: agentDocumentsOf(documents) });
  if (resolution.status === "unsupported") throw new UpdateError("unsupported", "This was written by the assistant in chat — ask Luna in the chat to change it.");
  const chosen = chooseAgent(resolution, useFallback);
  if (!chosen) throw new UpdateError("agent-missing", `The agent that made this (${resolution.name || "unknown"}) is no longer in your workspace.`, { fallback: resolution.fallback });
  const agent = chosen.agent;

  const resolved = resolveMaterial({ resource, picked: material?.documentIds || null, documents });
  const names = resolved.documentIds.map((id) => documents.find((entry) => entry.id === id)?.name).filter(Boolean);
  const usedMaterial = { ...resolved, names };
  if (!hasMaterial(agent, usedMaterial)) {
    throw new UpdateError("no-material", resolved.missing.length ? "The documents this was made from are no longer in your workspace. Choose different material to update it from." : "Choose the material to update it from.", { missing: resolved.missing });
  }

  const answers = answersForResource(agent, resource);
  onProgress?.({ step: "understand", status: "start" });
  const improved = await improveRequest({ resource, agent, instruction: words, answers, earlier: [resource?.request?.lastInstruction].filter(Boolean), fetchImpl });
  onProgress?.({ step: "understand", status: "end", understood: improved.understood });

  const { config } = buildUpdateConfig({ resource, agent, material: usedMaterial, workspaceId: workspace?.id || "", subjectId: document?.subjectId || "", refinementPrompt: improved.refinementPrompt, answers });
  const output = await runAgentStreaming(config, (event) => onProgress?.(event), fetchImpl);
  onProgress?.({ step: "compare", status: "start" });
  const next = rebuildResource({ previous: resource, output, agent, instruction: words, material: usedMaterial, answers, keepFormat, now });
  const diff = diffResources(resource, next);
  onProgress?.({ step: "compare", status: "end" });
  return {
    resource: next,
    previous: resource,
    diff,
    usage: output.usage || null,
    model: output.model || agent.model || "",
    understood: improved.understood,
    agent: { label: chosen.label, source: chosen.source, fallback: Boolean(chosen.fallback) },
    material: usedMaterial,
    answers,
    checks: Array.isArray(output.checks) ? output.checks.filter((check) => check && check.ok === false) : []
  };
}
