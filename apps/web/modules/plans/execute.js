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
import { buildActivity } from "../activities/engine/activity";
import { buildResource, RESOURCE_TAG } from "../resources/resource";

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
  model: "gpt-4o-mini",
  creativity: "low"
};

/** What each kind of step asks the agents for. */
export const STEP_RECIPES = {
  quiz: { agent: QUIZ_AGENT, label: "Quiz", answers: { "q-count": 6, "q-difficulty": "Medium", "q-types": ["Multiple choice"] } },
  exam: { agent: QUIZ_AGENT, label: "Practice exam", answers: { "q-count": 12, "q-difficulty": "Mixed", "q-types": ["Multiple choice", "Short answer"] } },
  worksheet: { agent: QUIZ_AGENT, label: "Worksheet", answers: { "q-count": 8, "q-difficulty": "Mixed", "q-types": ["Short answer"] } },
  flashcards: { agent: FLASHCARDS_AGENT, label: "Flashcards", answers: {} },
  summary: { agent: SUMMARY_AGENT, label: "Summary", answers: {} }
};

function answersFor(agent, preset) {
  return (agent.questions || []).map((question) => ({ question: question.text, answer: preset[question.id] ?? question.default ?? "" }));
}

/**
 * Runs one step: generates with the right agent, saves the result as a resource in the plan's
 * folder, and returns what the step should now point at.
 */
export async function runStep({ step, sourceDocumentIds, workspaceId, subjectId, folderIds = [], onSaveGeneratedQuizDocument, learnerNote = "" }) {
  const recipe = STEP_RECIPES[step.generate] || STEP_RECIPES.quiz;
  const agent = recipe.agent;
  const config = {
    name: agent.name,
    instructions: agent.instructions,
    knowledgeText: "",
    questionAnswers: answersFor(agent, recipe.answers),
    outputExample: agent.outputExample || "",
    model: agent.model,
    creativity: agent.creativity,
    template: agent.template,
    scope: { workspaceId, subjectId, documentIds: sourceDocumentIds, styleDocumentIds: [] }
  };

  const response = await fetch("/api/ai-tools/agent-builder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Could not generate the ${recipe.label.toLowerCase()}`);

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new Error(`The agent returned nothing for “${step.title}”.`);

  let activity = null;
  try {
    const schemaFields = Array.isArray(agent.spec?.outputSchema) && agent.spec.outputSchema.length ? agent.spec.outputSchema : fieldDefs(agent.template.fields);
    activity = buildActivity(schemaFields, { ...(data.data || {}), items }, { title: step.title, agentName: agent.name });
  } catch {
    activity = null;
  }
  const resource = buildResource({
    name: step.title,
    activity: activity?.questions?.length ? activity : null,
    data: { items },
    request: { generatedFromPlan: true, agentName: agent.name, sourceDocumentIds },
    meta: { agentName: agent.name, sourceDocumentIds, sourceNames: [], topic: step.concepts?.[0] || "" }
  });
  if (step.concepts?.length) resource.concepts = step.concepts.map((name, index) => ({ id: `c_plan_${index}`, name, detail: "", level: "understand" }));
  if (learnerNote) resource.context = learnerNote;

  const content = JSON.stringify(resource, null, 2);
  const tags = [RESOURCE_TAG, ...(resource.activity ? ["activity"] : []), ...(step.dueDate ? [`due:${step.dueDate}`] : [])];
  const saved = await onSaveGeneratedQuizDocument(
    { folderIds, tags, file: { name: `${step.title}.resource.json`, content, preview: `${items.length} items`, sizeBytes: content.length } },
    subjectId
  );
  return { documentId: saved?.id || saved?.documentId || "", title: step.title, questions: activity?.questions?.length || 0, kind: recipe.label };
}

/**
 * Runs every step of a plan that promised material and has none yet, in order, reporting progress.
 * The plan is returned with each step pointing at the resource that was created for it.
 */
export async function executePlan({ plan, documents = [], workspaceId, subjectId, folderIds = [], onSaveGeneratedQuizDocument, onProgress }) {
  const pending = (plan.items || []).filter((item) => item.generate && !item.resourceId);
  if (!pending.length) return { plan, created: 0, failures: [] };
  const failures = [];
  let created = 0;
  const items = [...plan.items];

  for (const [index, step] of pending.entries()) {
    onProgress?.({ index, total: pending.length, title: step.title });
    try {
      const source = documents.find((document) => document.id === step.sourceDocumentId);
      const sourceIds = source ? [source.id] : (plan.materialIds || []).slice(0, 3);
      const result = await runStep({
        step,
        sourceDocumentIds: sourceIds,
        workspaceId,
        subjectId,
        folderIds,
        onSaveGeneratedQuizDocument,
        learnerNote: plan.note || ""
      });
      const position = items.findIndex((item) => item.id === step.id);
      if (position >= 0) {
        items[position] = {
          ...items[position],
          resourceId: result.documentId,
          generate: "",
          kind: result.questions ? "activity" : items[position].kind,
          note: `${result.kind} generated from your material${result.questions ? ` · ${result.questions} questions` : ""}.`
        };
      }
      created += 1;
    } catch (error) {
      failures.push({ title: step.title, message: String(error.message || error) });
    }
  }

  // Auto-generate summaries for reading steps that reference a document and have none yet.
  const readingPending = (plan.items || []).filter((item) => item.kind === "read" && item.resourceId && !item.summaryDocumentId);
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

  return { plan: { ...plan, items, updatedAt: new Date().toISOString() }, created, failures };
}
