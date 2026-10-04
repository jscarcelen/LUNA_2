/**
 * Doing what the plan says.
 *
 * A generated plan is only a promise until the material exists: the step that says "quiz on
 * probability, 6 October" has to become an actual quiz, saved in the workspace folder, playable as
 * an activity, and tied back to the step with its due date. This runs those steps — the agent, the
 * saving, the linking — so the learner opens the plan and finds the work already there.
 */
import { QUIZ_AGENT } from "../ai-tools/tools/quiz-generator/quizAgent";
import { createVocabularyFlashcardsSpec } from "../agent-studio/engine/model";
import { runConfigFromSpec } from "../agent-studio/engine/migrate";
import { attachSources, buildActivity } from "../activities/engine/activity";
import { buildResource, RESOURCE_TAG, trimSources } from "../resources/resource";
import { isCustomKey } from "./agents";
import { CONSOLIDATOR_AGENT } from "../ai-tools/tools/summary-consolidator/consolidatorAgent";
import { runAgentStreaming } from "../ai-tools/tools/agent-builder/readAgentStream";
import { MASTER_TAG } from "../ai-tools/pipeline/masterDocument";
import { findMasterDocument, masterIsCurrent, masterTitle, needsMasterDocument, stepSourceIds, uploadedMaterialIds } from "./master";

const FLASHCARDS_AGENT = runConfigFromSpec(createVocabularyFlashcardsSpec());

/** Legacy run-config fields → the field tree the activity engine reads (items[] + once fields). */
function fieldDefs(fields = []) {
  const perItem = fields.filter((field) => field.repeatScope !== "once").map((field) => ({
    id: `lf_${field.name}`,
    name: field.name,
    type: field.type === "array" ? "array" : field.type === "number" ? "number" : "text",
    children: field.type === "array" ? [{ id: `lf_${field.name}_item`, name: field.name, type: "text" }] : undefined
  }));
  const once = fields.filter((field) => field.repeatScope === "once").map((field) => ({ id: `lf_${field.name}`, name: field.name, type: field.type === "number" ? "number" : "text" }));
  return [...once, { id: "lf_items", name: "items", type: "array", children: [{ id: "lf_items_item", name: "item", type: "object", children: perItem }] }];
}

/**
 * Summary writer: condenses reading material to ~20 % of its length (max 2 pages).
 * Produces structured key-point cards so the output renders well in any template,
 * while still being compact enough to replace reading for a revision pass.
 */
const SUMMARY_AGENT = {
  name: "Summary writer",
  instructions: `You are an expert teacher producing concise revision summaries.
Rules you MUST follow:
1. Use ONLY information from the provided reference material — never add external facts.
2. Aim for 12–20 key points that together cover the whole document (not just the first pages).
3. Each point must be self-contained: a student reading only that card should understand it.
4. Assign a short topic label (2–4 words) to each point so they can be grouped.
5. Keep the total length to roughly 20 % of the source — be ruthless about brevity.
6. Where a concept needs an example or a memory hook, add it in the "detail" field.`,
  questions: [],
  template: {
    fields: [
      { name: "point", label: "Key point", type: "string", repeatScope: "per-output", description: "One essential thing to remember, in one clear sentence." },
      { name: "detail", label: "Explanation / example", type: "string", repeatScope: "per-output", description: "One or two sentences of explanation, a worked example, or a memory hook." },
      { name: "topic", label: "Topic", type: "string", repeatScope: "per-output", description: "Short topic tag (2–4 words) from the material." }
    ]
  },
  model: "gpt-4o",
  creativity: "low"
};

/** What each kind of step asks the agents for. */
export const STEP_RECIPES = {
  quiz: { agent: QUIZ_AGENT, label: "Quiz", answers: { "q-count": 6, "q-difficulty": "Medium", "q-types": ["Multiple choice"] } },
  exam: { agent: QUIZ_AGENT, label: "Practice exam", answers: { "q-count": 12, "q-difficulty": "Mixed", "q-types": ["Multiple choice", "Short answer"] } },
  worksheet: { agent: QUIZ_AGENT, label: "Worksheet", answers: { "q-count": 8, "q-difficulty": "Mixed", "q-types": ["Short answer"] } },
  flashcards: { agent: FLASHCARDS_AGENT, label: "Flashcards", answers: {} },
  summary: { agent: SUMMARY_AGENT, label: "Summary", answers: {} },
  // Not a step the planner schedules: the first thing built for a plan with 2+ uploaded documents.
  // Streams (it takes minutes) and reads every document in full. Language "" = the documents' own.
  master: {
    agent: CONSOLIDATOR_AGENT,
    label: "Master document",
    answers: Object.fromEntries((CONSOLIDATOR_AGENT.questions || []).filter((question) => /language/i.test(question.text)).map((question) => [question.id, ""])),
    streams: true,
    tags: [MASTER_TAG]
  }
};

function answersFor(agent, preset) {
  return (agent.questions || []).map((question) => ({
    question: question.text,
    // A saved agent's own default, else its first option, so a required choice is never left blank.
    answer: preset[question.id] ?? question.default ?? question.defaultValue ?? (question.type === "multi-select" ? [] : question.options?.[0] ?? "")
  }));
}

/** A saved agent, read from its document and recompiled from its spec like the run page does. */
function customRecipe(agentDocuments, key) {
  const documentId = String(key).slice("agent:".length);
  const document = agentDocuments.find((item) => item.id === documentId);
  if (!document) throw new Error("This plan uses an agent that is no longer in the workspace.");
  let parsed = JSON.parse(String(document.content || "{}"));
  if (parsed.spec && Array.isArray(parsed.spec.outputSchema)) {
    try {
      const { spec, ...rest } = parsed;
      parsed = { ...rest, ...runConfigFromSpec(spec), scope: rest.scope };
    } catch { /* keep the stored config */ }
  }
  return { agent: parsed, label: parsed.name || "Agent", answers: {}, custom: true, documentId };
}

/**
 * Runs one step: generates with the right agent, saves the result as a resource in the plan's
 * folder, and returns what the step should now point at.
 */
/** Exact-name match first, then the concept's words appearing in the question: which concepts did this set test? */
function conceptsTested(items, concepts) {
  const norm = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  const covered = new Set();
  for (const item of items) {
    const topic = norm(item.topic);
    const text = norm([item.question, item.front, item.prompt, item.statement, item.sentence, item.back, item.answer].join(" "));
    for (const concept of concepts) {
      const name = norm(concept);
      if (name && (topic === name || topic.includes(name) || name.includes(topic) && topic.length > 3 || text.includes(name))) covered.add(concept);
    }
  }
  return covered;
}

/** What the agent is told so the activity is exhaustive over the step's concepts. */
function coverageInstruction(concepts, perConcept) {
  return `\n\nCOVERAGE (mandatory): this set must test EVERY one of the ${concepts.length} concepts below — ${perConcept > 1 ? `at least ${perConcept} questions each` : "at least one question each"}, spread evenly, none skipped, nothing outside the material. Set each item's "topic" to the exact concept name it tests (copy it exactly as written).\nConcepts:\n${concepts.map((concept) => `- ${concept}`).join("\n")}`;
}

/**
 * What a person said in words (a count, a difficulty, a language…) as answers to the agent's own
 * questions, matched by what each question asks. Used by the assistant, which does not know ids.
 */
export function answersFromOptions(agent, options = {}) {
  const out = {};
  const asked = (question) => String(question.text || question.name || "");
  for (const question of agent.questions || []) {
    const text = asked(question);
    let value;
    if (/how many|number of/i.test(text)) value = options.count;
    else if (/difficulty|level/i.test(text)) value = options.difficulty;
    else if (/type/i.test(text)) value = options.types;
    else if (/language\s*2|second language|to language/i.test(text)) value = options.language2 ?? options.targetLanguage;
    else if (/language\s*1|first language/i.test(text)) value = options.language1 ?? options.language;
    else if (/language/i.test(text)) value = options.language;
    else if (/focus|topic|theme/i.test(text)) value = options.focus;
    if (value === undefined || value === null || value === "") continue;
    out[question.id] = question.type === "multi-select" ? (Array.isArray(value) ? value : [value]) : Array.isArray(value) ? value.join(", ") : question.type === "number" ? Number(value) || value : String(value);
  }
  return out;
}

/**
 * Generates the resource for a step WITHOUT saving it: the caller decides where it goes.
 * `options` are the user's words ({ count, difficulty, types, language, focus… }); `extraInstructions` a free request.
 */
export async function generateStepResource({ step, sourceDocumentIds, workspaceId, subjectId, learnerNote = "", agentDocuments = [], subjectName = "", options = {}, extraInstructions = "", onAgentEvent }) {
  const recipe = isCustomKey(step.generate) ? customRecipe(agentDocuments, step.generate) : (STEP_RECIPES[step.generate] || STEP_RECIPES.quiz);
  const agent = recipe.agent;
  const concepts = [...new Set((step.concepts || []).map((name) => String(name || "").trim()).filter(Boolean))];

  let tokens = 0;
  /** One call to the agent; `focus` limits it to some concepts (the first pass uses all of them). */
  async function callAgent(focus) {
    const perConcept = step.generate === "exam" || step.kind === "exam" ? 2 : 1;
    const preset = { ...recipe.answers, ...answersFromOptions(agent, options) };
    if (focus.length && !recipe.custom && "q-count" in preset) preset["q-count"] = Math.min(40, Math.max(Number(preset["q-count"]) || 0, focus.length * perConcept));
    const answers = answersFor(agent, preset);
    const config = {
      name: agent.name,
      instructions: `${agent.instructions}${extraInstructions ? `\n\nThe user also asks: ${extraInstructions}` : ""}${focus.length ? coverageInstruction(focus, perConcept) : ""}`,
      knowledgeText: recipe.custom ? agent.knowledgeText || "" : "",
      // The consolidator is recognised by its spec (`pipeline: "consolidate"`).
      ...(recipe.streams ? { spec: agent.spec } : {}),
      questionAnswers: answers,
      outputExample: agent.outputExample || "",
      model: agent.model,
      creativity: agent.creativity,
      template: agent.template,
      ...(recipe.custom ? {
        outputJsonSchema: agent.outputJsonSchema || null,
        validationRules: agent.validationRules || [],
        spec: agent.spec || null,
        contextPrompt: "",
        inputValues: Object.fromEntries((agent.questions || []).map((question, index) => [question.id, answers[index].answer]))
      } : {}),
      scope: { workspaceId, subjectId, documentIds: [...sourceDocumentIds, ...(recipe.custom ? agent.scope?.documentIds || [] : [])], styleDocumentIds: [] }
    };
    // A long run (the master document) streams its progress; the others are one quick request.
    if (recipe.streams) {
      const streamed = await runAgentStreaming(config, onAgentEvent);
      tokens += Number(streamed.usage?.total_tokens) || 0;
      return streamed;
    }
    const response = await fetch("/api/ai-tools/agent-builder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Could not generate the ${recipe.label.toLowerCase()}`);
    tokens += Number(result.usage?.total_tokens) || 0;
    return result;
  }

  let data = await callAgent(concepts);

  // Check the promise: every concept of the step needs at least one question. Whatever is still
  // missing is asked for in a second, narrower call and merged in.
  let coverage = null;
  if (concepts.length && !recipe.custom && !data.isBlockOutput) {
    const covered = conceptsTested(Array.isArray(data.items) ? data.items : [], concepts);
    const missing = concepts.filter((concept) => !covered.has(concept));
    if (missing.length && missing.length <= 12) {
      try {
        const extra = await callAgent(missing);
        const known = new Set((data.items || []).map((item) => String(item.question || item.front || item.prompt || "").toLowerCase()));
        const fresh = (extra.items || []).filter((item) => !known.has(String(item.question || item.front || item.prompt || "").toLowerCase()));
        data = { ...data, items: [...(data.items || []), ...fresh], sources: [...(data.sources || []), ...(extra.sources || [])] };
      } catch { /* the first set stands; the gap is reported below */ }
    }
    const finalCovered = conceptsTested(Array.isArray(data.items) ? data.items : [], concepts);
    coverage = { concepts, covered: concepts.filter((concept) => finalCovered.has(concept)), missing: concepts.filter((concept) => !finalCovered.has(concept)) };
  }

  const blocks = data.isBlockOutput && Array.isArray(data.blocks) ? data.blocks : null;
  const items = blocks ? [] : (Array.isArray(data.items) ? data.items : []);
  if (!items.length && !blocks?.length) throw new Error(`The agent returned nothing for “${step.title}”.`);

  let activity = null;
  try {
    if (blocks) throw new Error("block output has no questions");
    const schemaFields = Array.isArray(agent.spec?.outputSchema) && agent.spec.outputSchema.length ? agent.spec.outputSchema : fieldDefs(agent.template.fields);
    activity = attachSources(buildActivity(schemaFields, { ...(data.data || {}), items }, { title: step.title, agentName: agent.name }), Array.isArray(data.sources) ? data.sources : []);
  } catch {
    activity = null;
  }
  const resource = buildResource({
    name: step.title,
    activity: activity?.questions?.length ? activity : null,
    data: blocks
      ? { items: [], isBlockOutput: true, blocks, sources: trimSources(data.sources), ...(data.data?.title ? { title: data.data.title } : {}), ...(data.consolidation ? { originals: data.consolidation.originals, coverage: data.consolidation.coverage } : {}) }
      : { items, sources: trimSources(data.sources) },
    request: { generatedFromPlan: true, agentName: agent.name, sourceDocumentIds },
    meta: { agentName: agent.name, subjectName, sourceDocumentIds, sourceNames: [], topic: step.concepts?.[0] || "" }
  });
  if (step.concepts?.length) resource.concepts = step.concepts.map((name, index) => ({ id: `c_plan_${index}`, name, detail: "", level: "understand" }));
  if (learnerNote) resource.context = learnerNote;
  if (coverage) resource.coverage = coverage;

  if (data.consolidation) resource.master = { originals: data.consolidation.originals, coverage: data.consolidation.coverage, builtAt: new Date().toISOString() };
  const tags = [RESOURCE_TAG, ...(recipe.tags || []), ...(resource.activity ? ["activity"] : []), ...(step.dueDate ? [`due:${step.dueDate}`] : [])];
  return { resource, tags, preview: `${blocks ? blocks.length : items.length} ${blocks ? "blocks" : "items"}`, questions: activity?.questions?.length || 0, kind: recipe.label, coverage, tokens, model: agent.model };
}

/** Generates a step's resource and files it. */
export async function runStep({ step, folderIds = [], onSaveGeneratedQuizDocument, subjectId, ...rest }) {
  const made = await generateStepResource({ step, subjectId, ...rest });
  const content = JSON.stringify(made.resource, null, 2);
  const saved = await onSaveGeneratedQuizDocument(
    { folderIds, tags: made.tags, file: { name: `${step.title}.resource.json`, content, preview: made.preview, sizeBytes: content.length } },
    subjectId
  );
  return { documentId: saved?.id || saved?.documentId || "", title: step.title, questions: made.questions, kind: made.kind, coverage: made.coverage };
}

/**
 * Builds the plan's master document: all the uploaded documents merged into one de-duplicated set of
 * notes that traces every statement to its original. Filed ONCE in the plan's folder; when the plan's
 * uploads changed since it was built it is rewritten in place (same document, never a second copy).
 */
export async function buildMasterDocument({ plan, documents = [], existing = null, workspaceId, subjectId, subjectName = "", folderIds = [], onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onAgentEvent }) {
  const sourceIds = uploadedMaterialIds(plan, documents);
  const step = { id: "master", title: masterTitle(plan), kind: "read", generate: "master", concepts: [], dueDate: "" };
  const made = await generateStepResource({ step, sourceDocumentIds: sourceIds, workspaceId, subjectId, subjectName, onAgentEvent });
  const content = JSON.stringify(made.resource, null, 2);
  const file = { name: `${step.title}.resource.json`, content, preview: made.preview, sizeBytes: content.length };
  if (existing) {
    // Rewrite the document that already exists; without a way to rewrite it the old one stays (nothing is filed twice).
    if (typeof onUpdateGeneratedDocument !== "function") return { documentId: existing.id, sourceIds, rebuilt: false };
    await onUpdateGeneratedDocument(existing.id, { file }, subjectId);
    return { documentId: existing.id, sourceIds, rebuilt: true };
  }
  const saved = await onSaveGeneratedQuizDocument({ folderIds, tags: made.tags, file }, subjectId);
  return { documentId: saved?.id || saved?.documentId || "", sourceIds, rebuilt: true };
}

/**
 * Runs every step of a plan that promised material and has none yet, in order, reporting progress.
 * The plan is returned with each step pointing at the resource that was created for it.
 *
 * With two or more uploaded documents the FIRST thing built is the master document; every step after
 * it reads that document instead of the individual files (`plan.masterDocumentId`). If it cannot be
 * built the steps fall back to the original documents, as before.
 * onProgress receives { phase: "master" | "steps", index, total, title, detail? }.
 */
export async function executePlan({ plan, documents = [], agentDocuments = [], subjectName = "", workspaceId, subjectId, folderIds = [], onSaveGeneratedQuizDocument, onUpdateGeneratedDocument, onProgress }) {
  const pending = (plan.items || []).filter((item) => item.generate && !item.resourceId);
  if (!pending.length) return { plan, created: 0, failures: [] };
  const failures = [];
  let created = 0;
  const items = [...plan.items];
  let workingPlan = plan;
  let masterId = findMasterDocument(plan, documents)?.id || "";
  let masterBuilt = false;

  if (needsMasterDocument(plan, documents) && (!masterId || !masterIsCurrent(plan, documents))) {
    const title = masterTitle(plan);
    onProgress?.({ phase: "master", index: 0, total: pending.length, title, detail: "Reading your documents" });
    try {
      const master = await buildMasterDocument({
        plan,
        documents,
        existing: masterId ? documents.find((document) => document.id === masterId) : null,
        workspaceId,
        subjectId,
        subjectName,
        folderIds,
        onSaveGeneratedQuizDocument,
        onUpdateGeneratedDocument,
        onAgentEvent: (event) => { if (event?.phase) onProgress?.({ phase: "master", index: 0, total: pending.length, title, detail: event.label || "", done: event.done, of: event.total }); }
      });
      masterId = master.documentId;
      masterBuilt = Boolean(master.rebuilt);
      if (masterId) workingPlan = { ...plan, masterDocumentId: masterId, masterSourceIds: master.rebuilt ? master.sourceIds : plan.masterSourceIds || master.sourceIds };
    } catch (error) {
      failures.push({ title: "Master document", message: String(error.message || error) });
    }
  }
  const master = masterId ? { id: masterId } : null;

  for (const [index, step] of pending.entries()) {
    onProgress?.({ phase: "steps", index, total: pending.length, title: step.title });
    try {
      const sourceIds = stepSourceIds({ step, plan: workingPlan, documents, master });
      const result = await runStep({
        step,
        sourceDocumentIds: sourceIds,
        workspaceId,
        subjectId,
        folderIds,
        onSaveGeneratedQuizDocument,
        learnerNote: plan.note || "",
        agentDocuments,
        subjectName
      });
      const position = items.findIndex((item) => item.id === step.id);
      if (position >= 0) {
        items[position] = {
          ...items[position],
          resourceId: result.documentId,
          generate: "",
          kind: result.questions ? "activity" : items[position].kind,
          note: `${result.kind} generated from ${master ? "the master document" : "your material"}${result.questions ? ` · ${result.questions} questions` : ""}.`
        };
      }
      created += 1;
    } catch (error) {
      failures.push({ title: step.title, message: String(error.message || error) });
    }
  }

  // Auto-generate summaries for reading steps that reference a document and have none yet.
  // Plans only use the agents of the AI agents tab, and the summary writer is not one of them, so a
  // summary is built only for plans whose scope already includes it (made before that rule).
  const summariesAllowed = Array.isArray(plan.agentScope) && plan.agentScope.some((agent) => (agent.makes || []).includes("summary"));
  const readingPending = summariesAllowed ? (plan.items || []).filter((item) => item.kind === "read" && item.resourceId && !item.summaryDocumentId) : [];
  for (const step of readingPending) {
    onProgress?.({ index: created, total: pending.length + readingPending.length, title: `Summarising: ${step.title}` });
    try {
      const result = await runStep({
        step: { ...step, title: `Summary — ${step.title}`, generate: "summary" },
        sourceDocumentIds: [step.resourceId],
        workspaceId,
        subjectId,
        folderIds,
        onSaveGeneratedQuizDocument,
        learnerNote: plan.note || ""
      });
      const position = items.findIndex((item) => item.id === step.id);
      if (position >= 0) items[position] = { ...items[position], summaryDocumentId: result.documentId };
      created += 1;
    } catch (error) {
      failures.push({ title: `Summary for "${step.title}"`, message: String(error.message || error) });
    }
  }

  return { plan: { ...workingPlan, items, updatedAt: new Date().toISOString() }, created, failures, masterDocumentId: masterId, masterBuilt };
}
