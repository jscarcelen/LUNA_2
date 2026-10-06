import { describe, expect, it, vi } from "vitest";
import * as update from "../../modules/resources/update.js";
import { QUIZ_AGENT } from "../../modules/ai-tools/tools/quiz-generator/quizAgent.js";
import { STEP_RECIPES } from "../../modules/plans/execute.js";
import { MASTER_TAG } from "../../modules/ai-tools/pipeline/masterDocument.js";

const u: any = update;

/* ---------------------------------------------------------------- fixtures */

const question = (n: number, extra: any = {}) => ({ id: `items_${n}`, kind: "choice", prompt: `What is concept ${n}?`, options: ["a", "b", "c", "d"], answer: "b", explanation: `Because ${n}.`, topic: "T", skill: "concept", ...extra });
const quizResource = (extra: any = {}): any => ({
  kind: "resource", version: 1, name: "Accounting quiz", createdAt: "2026-10-01T10:00:00.000Z",
  activity: { id: "act_1", title: "Accounting quiz", questions: [question(1), question(2), question(3)], meta: { createdAt: "2026-10-01T10:00:00.000Z" } },
  data: { title: "Accounting quiz", items: [{ question: "What is concept 1?", answer: "b", _source: "S1" }, { question: "What is concept 2?", answer: "b" }, { question: "What is concept 3?", answer: "b" }], sources: [{ documentName: "Accounting.pdf", chunkIndex: 0, content: "text" }] },
  request: { answersByQuestionId: { "q-count": "3", "q-difficulty": "Hard", "q-types": ["Multiple choice"], "q-focus": "", "q-language": "Same as material" }, knowledgeMode: "workspace", referenceDocumentIds: ["doc-a"], styleDocumentIds: [], outputStyles: { "block-exam-question": { blockId: "x" } } },
  meta: { agentId: "", agentName: "Quiz Generator", subjectName: "Accounting", sourceDocumentIds: ["doc-a"], sourceNames: ["Accounting.pdf"], questionCount: 3 },
  ...extra
});
const upload = (id: string, name = `${id}.pdf`): any => ({ id, name, sourceType: "uploaded", tags: [], folderIds: [], subjectId: "s1" });
const resourceDocument = (id: string, resource: any, tags: string[] = ["resource", "activity"]): any => ({ id, name: `${resource.name}.resource.json`, sourceType: "generated", tags, folderIds: [], subjectId: "s1", content: JSON.stringify(resource) });
const agentDocument = (id: string, agent: any): any => ({ id, name: `${agent.name}.agent.json`, sourceType: "generated", tags: ["ai-agent"], content: JSON.stringify(agent) });
const workspaceOf = (documents: any[]): any => ({ id: "w1", subjects: [{ id: "s1", name: "Accounting", documents, folders: [] }] });

/* ---------------------------------------------------------------- which agent */

describe("resolving the agent that made a resource", () => {
  it("finds a built-in agent by its name", () => {
    const resolution = u.resolveAgent({ resource: quizResource(), agentDocuments: [] });
    expect(resolution).toMatchObject({ status: "ok", source: "builtin", label: "Quiz Generator" });
    expect(resolution.agent.questions.some((entry: any) => entry.id === "q-count")).toBe(true);
  });

  it("finds a saved agent by the id recorded on the resource", () => {
    const saved = agentDocument("agent-1", { ...QUIZ_AGENT, name: "Exam machine" });
    const resource = quizResource({ meta: { ...quizResource().meta, agentId: "agent-1", agentName: "Exam machine" } });
    const resolution = u.resolveAgent({ resource, agentDocuments: [saved] });
    expect(resolution).toMatchObject({ status: "ok", source: "saved", documentId: "agent-1", label: "Exam machine" });
  });

  it("recognises a saved agent a plan used by its name when no id was recorded", () => {
    const saved = agentDocument("agent-9", { ...QUIZ_AGENT, name: "Exam machine" });
    const resource = quizResource({ meta: { ...quizResource().meta, agentName: "Exam machine" } });
    expect(u.resolveAgent({ resource, agentDocuments: [saved] })).toMatchObject({ status: "ok", source: "saved", documentId: "agent-9" });
  });

  it("says so when the agent was deleted, and offers the built-in agent of the same kind", () => {
    const resource = quizResource({ meta: { ...quizResource().meta, agentId: "gone", agentName: "Exam machine" } });
    const resolution = u.resolveAgent({ resource, agentDocuments: [] });
    expect(resolution).toMatchObject({ status: "missing", reason: "deleted", name: "Exam machine", kind: "quiz" });
    expect(resolution.fallback.id).toBe("quiz");
    expect(u.chooseAgent(resolution, false)).toBeNull();
    const copy = u.chooseAgent(resolution, true);
    expect(copy).toMatchObject({ status: "ok", source: "builtin", fallback: true });
  });

  it("offers the flashcards agent for a deleted flashcards agent, the consolidator for a master document", () => {
    const flash = quizResource({ activity: { id: "a", title: "x", questions: [{ id: "f1", kind: "flashcard", prompt: "perro", answer: "dog", back: "dog" }] }, meta: { agentId: "gone", agentName: "Mine" } });
    expect(u.resolveAgent({ resource: flash, agentDocuments: [] }).fallback.id).toBe("flashcards");
    const master = quizResource({ activity: null, master: { originals: [] }, meta: { agentId: "gone", agentName: "Mine" } });
    expect(u.resolveAgent({ resource: master, agentDocuments: [] }).fallback.id).toBe("consolidator");
  });

  it("refuses what the chat assistant wrote", () => {
    const resource = quizResource({ activity: null, meta: { agentName: "Luna assistant" } });
    expect(u.resolveAgent({ resource, agentDocuments: [] }).status).toBe("unsupported");
    expect(u.canUpdateResource(resource)).toBe(false);
  });

  it("knows the kind of resource and describes it", () => {
    expect(u.kindOfResource(quizResource())).toBe("quiz");
    expect(u.kindOfResource(quizResource({ master: {} }))).toBe("master");
    expect(u.kindOfResource(quizResource(), { tags: [MASTER_TAG] })).toBe("master");
    expect(u.kindOfResource(quizResource({ activity: null, meta: { agentName: "Summary writer" } }))).toBe("summary");
    expect(u.describeResource(quizResource())).toBe("Quiz Generator · 3 questions · made from Accounting.pdf");
    expect(u.suggestionsFor("quiz")).toEqual(expect.arrayContaining(["Make it harder", "More calculation questions", "Cover chapter 3 only", "Translate to Spanish", "Make it shorter"]));
    expect(u.suggestionsFor("summary").slice(0, 3)).toEqual(["Shorter", "Add examples", "Add formulas"]);
  });
});

/* ---------------------------------------------------------------- the run config */

describe("building the update config from a saved resource", () => {
  const documents = [upload("doc-a", "Accounting.pdf"), upload("doc-b", "Statistics.pdf")];
  const agent = QUIZ_AGENT;

  it("reuses the saved choices and material, adds the request and the previous output", () => {
    const resource = quizResource();
    const material = u.resolveMaterial({ resource, documents });
    expect(material).toMatchObject({ documentIds: ["doc-a"], missing: [], different: false, knowledgeMode: "workspace" });
    const { config } = u.buildUpdateConfig({ resource, agent, material, workspaceId: "w1", subjectId: "s1", refinementPrompt: "REQUEST: make it harder" });
    expect(config.name).toBe("Quiz Generator");
    expect(config.questionAnswers.find((entry: any) => entry.question === "Difficulty").answer).toBe("Hard");
    expect(config.scope).toMatchObject({ workspaceId: "w1", subjectId: "", documentIds: ["doc-a"] });
    expect(config.refinementPrompt).toContain("REQUEST: make it harder");
    expect(config.refinementPrompt).toContain("KEEP THE CHOICES OF THE EARLIER RESULT");
    expect(config.refinementPrompt).toContain("Difficulty → Hard");
    // the same shape Iterate sends: root data + items without internal fields
    expect(config.previousOutput.items[0]).toEqual({ question: "What is concept 1?", answer: "b" });
    expect(config.previousOutput.title).toBe("Accounting quiz");
    expect(config.creativity).toBe("medium");
    expect(config.inputValues["q-difficulty"]).toBe("Hard");
  });

  it("sends typed blocks as the previous output for block documents", () => {
    const blocks = [{ type: "heading", text: "Cash flow" }, { type: "paragraph", text: "Cash in minus cash out." }];
    const resource = quizResource({ activity: null, data: { items: [], isBlockOutput: true, blocks, sources: [] }, meta: { agentName: "Summary writer", sourceDocumentIds: ["doc-a"] }, request: {} });
    const { config } = u.buildUpdateConfig({ resource, agent: STEP_RECIPES.summary.agent, material: u.resolveMaterial({ resource, documents }), refinementPrompt: "shorter" });
    expect(config.previousOutput).toEqual(blocks);
  });

  it("uses different material when the user picks it, and drops source documents that no longer exist", () => {
    const resource = quizResource({ request: { ...quizResource().request, referenceDocumentIds: ["doc-a", "doc-gone"] } });
    expect(u.resolveMaterial({ resource, documents })).toMatchObject({ documentIds: ["doc-a"], missing: ["doc-gone"] });
    const other = u.resolveMaterial({ resource, documents, picked: ["doc-b"] });
    expect(other).toMatchObject({ documentIds: ["doc-b"], different: true });
    const { config } = u.buildUpdateConfig({ resource, agent, material: other, refinementPrompt: "x" });
    expect(config.scope.documentIds).toEqual(["doc-b"]);
  });

  it("keeps pasted text as the material when that is what it was made from", () => {
    const resource = quizResource({ request: { knowledgeMode: "context", contextPromptDraft: "Some pasted notes." } });
    const material = u.resolveMaterial({ resource, documents });
    expect(material).toMatchObject({ knowledgeMode: "context", contextPromptDraft: "Some pasted notes." });
    expect(u.hasMaterial(agent, material)).toBe(true);
    const { config } = u.buildUpdateConfig({ resource, agent, material, refinementPrompt: "x" });
    expect(config.contextPrompt).toBe("Some pasted notes.");
  });

  it("knows when there is nothing to read", () => {
    const resource = quizResource({ request: {}, meta: { ...quizResource().meta, sourceDocumentIds: ["gone"] } });
    const material = u.resolveMaterial({ resource, documents });
    expect(material.documentIds).toEqual([]);
    expect(u.hasMaterial(agent, material)).toBe(false);
  });

  it("reads a plan-made quiz's choices from the resource itself (count and types)", () => {
    const resource = quizResource({ request: { generatedFromPlan: true, agentName: "Quiz Generator", sourceDocumentIds: ["doc-a"] } });
    const answers = u.answersForResource(agent, resource);
    expect(answers["q-count"]).toBe("3");
    expect(answers["q-types"]).toEqual(["Multiple choice"]);
  });

  it("matches saved choices by the words of the question when the agent was rebuilt with new ids", () => {
    const flash: any = STEP_RECIPES.flashcards.agent;
    const languageQuestion = flash.questions.find((entry: any) => /language 1/i.test(entry.text));
    const resource = quizResource({ request: { answersByQuestion: [{ question: languageQuestion.text, answer: "German" }] } });
    expect(u.answersForResource(flash, resource)[languageQuestion.id]).toBe("German");
  });

  it("sends the consolidator its documents again, with the request as its focus and no previous output", () => {
    const consolidator = u.BUILTIN_AGENTS.find((entry: any) => entry.id === "consolidator").agent;
    const resource = quizResource({ activity: null, master: {}, data: { items: [], isBlockOutput: true, blocks: [{ type: "paragraph", text: "x" }] }, meta: { agentName: consolidator.name, sourceDocumentIds: ["doc-a", "doc-b"] }, request: {} });
    const { config } = u.buildUpdateConfig({ resource, agent: consolidator, material: u.resolveMaterial({ resource, documents }), refinementPrompt: "add a section on tax" });
    expect(config.previousOutput).toBeUndefined();
    expect(config.refinementPrompt).toBeUndefined();
    expect(config.scope.documentIds).toEqual(["doc-a", "doc-b"]);
    const focus = config.questionAnswers.find((entry: any) => /focus/i.test(entry.question));
    expect(focus.answer).toContain("add a section on tax");
  });
});

/* ---------------------------------------------------------------- replace or copy */

describe("replace or save as a copy", () => {
  const document = resourceDocument("res-1", quizResource());

  it("replaces an item nobody has used", () => {
    expect(u.decideMode({ document, resource: quizResource(), documents: [document] })).toMatchObject({ mode: "replace", canReplace: true, reasons: [] });
  });

  it("saves a copy when the item has attempts", () => {
    const attempt = { id: "att", tags: ["activity-attempt"], content: JSON.stringify({ kind: "activity-attempt", activityDocumentId: "res-1", attempt: { at: "2026-10-02", score: 1, total: 3, results: [] } }) };
    const decision = u.decideMode({ document, resource: quizResource(), documents: [document, attempt] });
    expect(decision.mode).toBe("copy");
    expect(decision.canReplace).toBe(true);
    expect(decision.reasons[0]).toContain("1 attempt");
  });

  it("saves a copy when a study plan points at it", () => {
    const plan = { id: "plan-1", name: "Plan.plan.json", tags: ["study-plan"], content: JSON.stringify({ kind: "study-plan", name: "Biology final", items: [{ id: "i", resourceId: "res-1" }] }) };
    const decision = u.decideMode({ document, resource: quizResource(), documents: [document, plan] });
    expect(decision.mode).toBe("copy");
    expect(decision.plans).toEqual([{ id: "plan-1", name: "Biology final" }]);
  });

  it("can only copy a document shared as view only", () => {
    const shared = { ...document, shared: { permission: "view", ownerName: "Ms Kim" } };
    expect(u.decideMode({ document: shared, resource: quizResource(), documents: [shared] })).toMatchObject({ mode: "copy", canReplace: false });
    const editable = { ...document, shared: { permission: "edit", ownerName: "Ms Kim" } };
    expect(u.decideMode({ document: editable, resource: quizResource(), documents: [editable] }).canReplace).toBe(true);
  });

  it("an unsaved result (chat) is simply replaced", () => {
    expect(u.decideMode({ document: null, resource: quizResource() })).toMatchObject({ mode: "replace", canReplace: true });
  });

  it("names copies (v2), (v3)… without clashing", () => {
    expect(u.copyName("Quiz", [])).toBe("Quiz (v2)");
    expect(u.copyName("Quiz (v2)", ["Quiz (v2)"])).toBe("Quiz (v3)");
    expect(u.copyName("Quiz", ["Quiz (v2)", "Quiz (v3)"])).toBe("Quiz (v4)");
  });

  it("a master document's dependants and stale sources", () => {
    const master = resourceDocument("master-1", quizResource({ name: "Master", activity: null, master: {}, meta: { agentName: "Summary Notes Consolidator", updatedAt: "2026-10-05T10:00:00.000Z" } }), ["resource", MASTER_TAG]);
    const quiz = resourceDocument("quiz-1", quizResource({ request: { sourceDocumentIds: ["master-1"] }, meta: { ...quizResource().meta, sourceDocumentIds: ["master-1"] } }));
    expect(u.dependantsOf("master-1", [master, quiz]).map((row: any) => row.document.id)).toEqual(["quiz-1"]);
    expect(u.decideMode({ document: master, resource: JSON.parse(master.content), documents: [master, quiz] })).toMatchObject({ mode: "copy", dependants: 1 });
    expect(u.staleSources(JSON.parse(quiz.content), [master, quiz])).toEqual([{ id: "master-1", name: "Master", updatedAt: "2026-10-05T10:00:00.000Z" }]);
    const fresh = { ...JSON.parse(quiz.content), meta: { ...JSON.parse(quiz.content).meta, updatedAt: "2026-10-06T00:00:00.000Z" } };
    expect(u.staleSources(fresh, [master, quiz])).toEqual([]);
  });
});

/* ---------------------------------------------------------------- versions */

describe("version history inside the resource", () => {
  it("keeps the previous content with its prompt, date and model, newest first, at most five", () => {
    let resource: any = quizResource();
    for (let n = 1; n <= 7; n += 1) {
      const next = { ...resource, name: `Quiz ${n}`, data: { ...resource.data, title: `Title ${n}` } };
      resource = { ...next, versions: u.pushVersion(resource, { prompt: `change ${n}`, model: "gpt-4o", now: `2026-10-0${n}T10:00:00.000Z` }) };
    }
    expect(resource.versions).toHaveLength(u.MAX_VERSIONS);
    expect(resource.versions[0]).toMatchObject({ prompt: "change 7", model: "gpt-4o", at: "2026-10-07T10:00:00.000Z", name: "Quiz 6" });
    expect(resource.versions[4].prompt).toBe("change 3");
    expect(resource.versions[0].activity.questions).toHaveLength(3);
  });

  it("restores a version, and the state it leaves becomes a version too", () => {
    const first: any = quizResource();
    const second: any = { ...first, name: "Harder quiz", data: { ...first.data, title: "Harder" }, versions: u.pushVersion(first, { prompt: "harder" }) };
    const target = second.versions[0];
    const back = u.restoreVersion(second, target.id, { now: "2026-10-09T00:00:00.000Z" });
    expect(back.name).toBe("Accounting quiz");
    expect(back.data.title).toBe("Accounting quiz");
    expect(back.versions).toHaveLength(1);
    expect(back.versions[0]).toMatchObject({ name: "Harder quiz" });
    expect(back.meta.updatedAt).toBe("2026-10-09T00:00:00.000Z");
    // restoring again goes forward
    const forward = u.restoreVersion(back, back.versions[0].id);
    expect(forward.name).toBe("Harder quiz");
    expect(u.restoreVersion(second, "unknown")).toBe(second);
  });

  it("applyUpdate: replace pushes the old content, copy starts clean with a new name", () => {
    const previous: any = quizResource({ versions: [{ id: "old", at: "x", prompt: "p", name: "n", data: {}, activity: null }] });
    const next: any = { ...previous, data: { ...previous.data, title: "New" }, versions: previous.versions };
    const replaced = u.applyUpdate({ previous, next, mode: "replace", instruction: "harder", model: "gpt-4o", now: "2026-10-05T00:00:00.000Z" });
    expect(replaced.name).toBe("Accounting quiz");
    expect(replaced.versions[0]).toMatchObject({ prompt: "harder", name: "Accounting quiz" });
    expect(replaced.versions[1].id).toBe("old");
    expect(replaced.meta.updatedAt).toBe("2026-10-05T00:00:00.000Z");
    const copy = u.applyUpdate({ previous, next, mode: "copy", instruction: "harder", existingNames: ["Accounting quiz"], originalDocumentId: "res-1", now: "2026-10-05T00:00:00.000Z" });
    expect(copy.name).toBe("Accounting quiz (v2)");
    expect(copy.versions).toEqual([]);
    expect(copy.activity.title).toBe("Accounting quiz (v2)");
    expect(copy.meta.updatedFrom).toBe("res-1");
    expect(copy.createdAt).toBe("2026-10-05T00:00:00.000Z");
  });
});

/* ---------------------------------------------------------------- comparing */

describe("what the update changed", () => {
  it("questions: unchanged, reworded (changed), new and removed", () => {
    const before: any = quizResource();
    const after: any = quizResource({
      activity: { id: "act_1", title: "x", questions: [question(1), question(2, { prompt: "What exactly is concept 2 in practice?", answer: "c" }), question(4, { prompt: "Calculate the margin of product Z.", answer: "40" })] }
    });
    const diff = u.diffResources(before, after);
    expect(diff.kind).toBe("questions");
    expect(diff.counts).toEqual({ same: 1, changed: 1, added: 1, removed: 1 });
    const byStatus = (status: string) => diff.rows.filter((row: any) => row.status === status).map((row: any) => row.label);
    expect(byStatus("added")).toEqual(["Calculate the margin of product Z."]);
    expect(byStatus("removed")).toEqual(["What is concept 3?"]);
    expect(byStatus("changed")).toEqual(["What exactly is concept 2 in practice?"]);
    expect(diff.changedAnything).toBe(true);
  });

  it("documents: blocks marked same, changed, added, removed, in order", () => {
    const doc = (blocks: any[]) => ({ ...quizResource({ activity: null }), data: { items: [], isBlockOutput: true, blocks } });
    const before = doc([{ type: "heading", text: "Cash flow" }, { type: "paragraph", text: "Cash in minus cash out over a period." }, { type: "paragraph", text: "Old closing remark." }]);
    const after = doc([{ type: "heading", text: "Cash flow" }, { type: "paragraph", text: "Cash in minus cash out over a period of time, for example a month." }, { type: "heading", text: "Formulas" }, { type: "paragraph", text: "Net cash = inflow - outflow" }]);
    const diff = u.diffResources(before, after);
    expect(diff.kind).toBe("blocks");
    expect(diff.rows.map((row: any) => row.status)).toEqual(["same", "removed", "changed", "added", "added"]);
    expect(diff.counts).toEqual({ same: 1, changed: 1, added: 2, removed: 1 });
  });

  it("identical content changes nothing", () => {
    const diff = u.diffResources(quizResource(), quizResource());
    expect(diff.changedAnything).toBe(false);
    expect(diff.counts.same).toBe(3);
  });
});

/* ---------------------------------------------------------------- rebuilding the resource */

describe("the resource an update produces", () => {
  const agent = QUIZ_AGENT;
  const output = (items: any[]) => ({ items, data: { title: "Harder quiz" }, sources: [], model: "gpt-4o", usage: { total_tokens: 900 } });
  const item = (n: number, text: string) => ({ question: text, type: "multiple-choice", options: ["a", "b", "c", "d"], answer: "b", explanation: `Because ${n}.`, topic: "T", difficulty: "hard" });

  it("keeps the activity id and an untouched question's id and classification; new questions get safe ids", () => {
    const previous: any = quizResource();
    previous.activity.questions[0] = { ...previous.activity.questions[0], skill: "calculation", difficulty: "easy", explanation: "Because 1." };
    const next = u.rebuildResource({ previous, output: output([item(1, "What is concept 1?"), item(2, "A completely different second question about margins"), item(3, "What is concept 3?")]), agent, instruction: "harder", now: "2026-10-05T00:00:00.000Z" });
    expect(next.activity.id).toBe("act_1");
    expect(next.activity.questions[0]).toMatchObject({ id: "items_1", skill: "calculation", difficulty: "easy" });
    // the reworded question must not reuse the id attempts recorded for the old question 2
    expect(next.activity.questions[1].id).not.toBe("items_2");
    expect(new Set(next.activity.questions.map((entry: any) => entry.id)).size).toBe(3);
    expect(next.name).toBe("Accounting quiz");
    expect(next.meta).toMatchObject({ updatedAt: "2026-10-05T00:00:00.000Z", questionCount: 3, agentName: "Quiz Generator" });
    expect(next.request.lastInstruction).toBe("harder");
    expect(next.request.outputStyles).toEqual(previous.request.outputStyles);
  });

  it("drops the format and colours when asked", () => {
    const next = u.rebuildResource({ previous: quizResource(), output: output([item(1, "q one")]), agent, keepFormat: false });
    expect(next.request.outputStyles).toEqual({});
  });

  it("refuses an empty answer", () => {
    expect(() => u.rebuildResource({ previous: quizResource(), output: output([]), agent })).toThrow(/nothing/i);
  });

  it("takes the new material into the request when it was changed", () => {
    const material = { documentIds: ["doc-b"], names: ["Statistics.pdf"], different: true };
    const next = u.rebuildResource({ previous: quizResource(), output: output([item(1, "q one")]), agent, material });
    expect(next.request.referenceDocumentIds).toEqual(["doc-b"]);
    expect(next.meta.sourceNames).toEqual(["Statistics.pdf"]);
  });

  it("a consolidation keeps its originals and coverage on the resource", () => {
    const consolidator = u.BUILTIN_AGENTS.find((entry: any) => entry.id === "consolidator").agent;
    const previous: any = quizResource({ activity: null, master: { originals: [] }, data: { items: [], isBlockOutput: true, blocks: [{ type: "paragraph", text: "old" }] }, meta: { agentName: consolidator.name } });
    const blocks = [{ type: "heading", text: "New" }, { type: "paragraph", text: "text" }];
    const next = u.rebuildResource({ previous, output: { isBlockOutput: true, blocks, items: blocks, data: { title: "Master" }, sources: [], consolidation: { originals: [{ tag: "D1" }], coverage: { passages: 3 } } }, agent: consolidator, now: "2026-10-05T00:00:00.000Z" });
    expect(next.data.blocks).toEqual(blocks);
    expect(next.data.originals).toEqual([{ tag: "D1" }]);
    expect(next.master).toMatchObject({ originals: [{ tag: "D1" }], coverage: { passages: 3 }, builtAt: "2026-10-05T00:00:00.000Z" });
    expect(next.activity).toBeNull();
  });
});

/* ---------------------------------------------------------------- the whole run */

function ndjson(events: any[]) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); controller.close(); } }), { status: 200 });
}

describe("updateResource", () => {
  const documents = [upload("doc-a", "Accounting.pdf"), resourceDocument("res-1", quizResource())];
  const workspace = workspaceOf(documents);
  const item = (text: string) => ({ question: text, type: "multiple-choice", options: ["a", "b", "c", "d"], answer: "b", explanation: "Because.", topic: "T", difficulty: "hard" });

  function fakeFetch(calls: any[]): any {
    return vi.fn(async (url: string, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body });
      if (url.includes("/iterate")) return new Response(JSON.stringify({ improved: true, understood: "I will make every question harder.", scope: "whole_result", brief: "Harder questions", targets: [], fields: [], checklist: ["harder"], relax: [], keep: [] }), { status: 200 });
      return ndjson([{ step: "scope", status: "start" }, { step: "generate", status: "start" }, { step: "done", status: "end", result: { items: [item("What is concept 1?"), item("A much harder question on margins?")], data: { title: "Harder" }, sources: [], model: "gpt-4o", usage: { total_tokens: 1500 } } }]);
    });
  }

  it("improves the words, runs the same agent with the previous output, and returns the proposal with its diff", async () => {
    const calls: any[] = [];
    const progress: string[] = [];
    const outcome = await u.updateResource({ document: documents[1], resource: quizResource(), instruction: "make it harder", workspace, fetchImpl: fakeFetch(calls), onProgress: (event: any) => progress.push(`${event.step}:${event.status}`) });
    expect(calls.map((call) => call.url)).toEqual(["/api/ai-tools/agent-builder/iterate", "/api/ai-tools/agent-builder/stream"]);
    expect(calls[0].body).toMatchObject({ request: "make it harder", agentName: "Quiz Generator" });
    expect(calls[0].body.outline).toContain("Item 1");
    const config = calls[1].body.config;
    expect(config.refinementPrompt).toContain("REQUEST: make it harder");
    expect(config.refinementPrompt).toContain("BRIEF: Harder questions");
    expect(config.previousOutput.items).toHaveLength(3);
    expect(config.scope.documentIds).toEqual(["doc-a"]);
    expect(outcome.understood).toBe("I will make every question harder.");
    expect(outcome.model).toBe("gpt-4o");
    expect(outcome.usage).toEqual({ total_tokens: 1500 });
    expect(outcome.agent).toMatchObject({ label: "Quiz Generator", source: "builtin", fallback: false });
    expect(outcome.resource.activity.id).toBe("act_1");
    expect(outcome.resource.activity.questions).toHaveLength(2);
    expect(outcome.diff.counts.added + outcome.diff.counts.changed).toBeGreaterThan(0);
    expect(progress[0]).toBe("understand:start");
    expect(progress).toContain("generate:start");
    expect(progress[progress.length - 1]).toBe("compare:end");
  });

  it("falls back to the user's own words when the improver is unavailable", async () => {
    const calls: any[] = [];
    const fetchImpl: any = vi.fn(async (url: string, init: any) => {
      calls.push({ url, body: JSON.parse(init.body) });
      if (url.includes("/iterate")) throw new Error("offline");
      return ndjson([{ step: "done", status: "end", result: { items: [item("Only question")], data: {}, sources: [], model: "gpt-4o" } }]);
    });
    await u.updateResource({ document: documents[1], resource: quizResource(), instruction: "make it harder", workspace, fetchImpl });
    expect(calls[1].body.config.refinementPrompt).toContain("make it harder");
  });

  it("stops with a clear error when the agent was deleted, and runs as a copy with the built-in agent when asked", async () => {
    const resource = quizResource({ meta: { ...quizResource().meta, agentId: "gone", agentName: "Exam machine" } });
    await expect(u.updateResource({ document: documents[1], resource, instruction: "x", workspace, fetchImpl: fakeFetch([]) })).rejects.toMatchObject({ code: "agent-missing" });
    const outcome = await u.updateResource({ document: documents[1], resource, instruction: "x", workspace, useFallback: true, fetchImpl: fakeFetch([]) });
    expect(outcome.agent).toMatchObject({ label: "Quiz Generator", fallback: true });
  });

  it("stops when there is nothing to read, unless the user picks different material", async () => {
    const resource = quizResource({ request: {}, meta: { ...quizResource().meta, sourceDocumentIds: ["gone"] } });
    await expect(u.updateResource({ document: documents[1], resource, instruction: "x", workspace, fetchImpl: fakeFetch([]) })).rejects.toMatchObject({ code: "no-material" });
    const calls: any[] = [];
    await u.updateResource({ document: documents[1], resource, instruction: "x", workspace, material: { documentIds: ["doc-a"] }, fetchImpl: fakeFetch(calls) });
    expect(calls[1].body.config.scope.documentIds).toEqual(["doc-a"]);
  });

  it("needs words, and refuses the assistant's documents", async () => {
    await expect(u.updateResource({ resource: quizResource(), instruction: "  ", workspace })).rejects.toMatchObject({ code: "no-instruction" });
    await expect(u.updateResource({ resource: quizResource({ meta: { agentName: "Luna assistant" } }), instruction: "x", workspace })).rejects.toMatchObject({ code: "unsupported" });
  });

  it("surfaces a generation failure", async () => {
    const fetchImpl: any = vi.fn(async (url: string) => (url.includes("/iterate") ? new Response(JSON.stringify({ improved: false }), { status: 200 }) : ndjson([{ step: "error", status: "end", error: "Model busy" }])));
    await expect(u.updateResource({ document: documents[1], resource: quizResource(), instruction: "x", workspace, fetchImpl })).rejects.toThrow("Model busy");
  });
});
