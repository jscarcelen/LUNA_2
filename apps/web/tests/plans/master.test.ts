import { afterEach, describe, expect, it, vi } from "vitest";
import { findMasterDocument, masterIsCurrent, masterTitle, MASTER_STEP_ID, needsMasterDocument, planBuildSteps, stepSourceIds, uploadedMaterialIds } from "../../modules/plans/master.js";
import { executePlan as executePlanJs, STEP_RECIPES } from "../../modules/plans/execute.js";
import { planDeletionScope as deletionScope } from "../../modules/plans/folders.js";
import { readAgentStream } from "../../modules/ai-tools/tools/agent-builder/readAgentStream.js";
import { CONSOLIDATOR_AGENT } from "../../modules/ai-tools/tools/summary-consolidator/consolidatorAgent.js";
import { readFileSync } from "node:fs";
import { BLOCKS } from "../../modules/ai-tools/blocks/blockRegistry.js";
import { MASTER_TAG } from "../../modules/ai-tools/pipeline/masterDocument.js";

const executePlan: any = executePlanJs;
const planDeletionScope: any = deletionScope;
const needs: any = needsMasterDocument;
const current: any = masterIsCurrent;
const findMaster: any = findMasterDocument;
const sourceIdsOf: any = stepSourceIds;
const uploads: any = uploadedMaterialIds;
const AGENT: any = CONSOLIDATOR_AGENT;

const upload = (id: string): any => ({ id, name: `${id}.docx`, sourceType: "uploaded", tags: [], folderIds: [] });
const A = upload("a");
const B = upload("b");
const C = upload("c");
const resourceDoc: any = { id: "res", name: "Old quiz.resource.json", sourceType: "generated", tags: ["resource"] };
const item = (id: string, generate: string, extra: any = {}) => ({ id, title: `Step ${id}`, kind: "activity", dueDate: "2026-11-01", generate, resourceId: "", sourceDocumentId: "a", concepts: [], ...extra });
const makePlan = (extra: any = {}): any => ({ kind: "study-plan", name: "Biology final", note: "", materialIds: ["a", "b"], items: [item("1", "quiz"), item("2", "flashcards")], ...extra });

describe("when a plan gets a master document", () => {
  it("needs two or more UPLOADED documents (generated resources are not consolidated)", () => {
    expect(needs(makePlan({ materialIds: ["a"] }), [A, B])).toBe(false);
    expect(needs(makePlan({ materialIds: ["a", "res"] }), [A, resourceDoc])).toBe(false);
    expect(needs(makePlan({ materialIds: ["a", "b", "ghost"] }), [A, B])).toBe(true);
    expect(uploads(makePlan({ materialIds: ["a", "a", "b", "res"] }), [A, B, resourceDoc])).toEqual(["a", "b"]);
  });

  it("is current only while the uploads are the ones it was built from", () => {
    const plan = makePlan({ masterDocumentId: "m", masterSourceIds: ["b", "a"] });
    expect(current(plan, [A, B])).toBe(true);
    expect(current({ ...plan, materialIds: ["a", "b", "c"] }, [A, B, C])).toBe(false);
    expect(current({ ...plan, masterSourceIds: undefined }, [A, B])).toBe(false);
    expect(findMaster(plan, [A, { id: "m" }])?.id).toBe("m");
    expect(findMaster(plan, [A, B])).toBeNull();
  });

  it("makes every step read the master document, else its own source, else all the material", () => {
    const plan = makePlan();
    expect(sourceIdsOf({ step: item("1", "quiz"), plan, documents: [A, B], master: { id: "m" } })).toEqual(["m"]);
    expect(sourceIdsOf({ step: item("1", "quiz"), plan, documents: [A, B] })).toEqual(["a"]);
    expect(sourceIdsOf({ step: item("1", "quiz", { sourceDocumentId: "" }), plan, documents: [A, B] })).toEqual(["a", "b"]);
  });
});

describe("the progress steps of building a plan", () => {
  const ids = (steps: any[]) => steps.map((step) => step.id);
  it("puts the master document first among the things built: after saving the plan, before the quizzes", () => {
    expect(ids(planBuildSteps({ documentCount: 3, uploadedCount: 3, buildNow: true }))).toEqual(["concepts", "schedule", "save", MASTER_STEP_ID, "build"]);
  });
  it("has no master step for a single document or when nothing is built now", () => {
    expect(ids(planBuildSteps({ documentCount: 1, uploadedCount: 1, buildNow: true }))).toEqual(["concepts", "schedule", "save", "build"]);
    expect(ids(planBuildSteps({ documentCount: 3, uploadedCount: 3, buildNow: false }))).toEqual(["concepts", "schedule", "save"]);
  });
  it("says the quizzes are written from the master document when there is one", () => {
    const steps = planBuildSteps({ documentCount: 2, uploadedCount: 2 });
    expect(steps.find((step: any) => step.id === "build")?.detail).toMatch(/master document/);
    expect(steps.find((step: any) => step.id === MASTER_STEP_ID)?.detail).toMatch(/2 documents/);
  });
});

/** A fake server: the stream endpoint (master) and the plain endpoint (quizzes, flashcards). */
function fakeServer({ failMaster = false } = {}) {
  const requests: { url: string; config: any }[] = [];
  const stream = (events: any[]) => new Response(new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`)); controller.close(); } }));
  const impl = vi.fn(async (url: string, init: any) => {
    const config = JSON.parse(init.body).config;
    requests.push({ url, config });
    if (url.endsWith("/stream")) {
      if (failMaster) return stream([{ step: "error", status: "end", error: "boom" }]);
      return stream([
        { step: "generate", status: "progress", phase: "map", done: 1, total: 2, label: "Read part 1 of 2" },
        { step: "done", status: "end", result: { blocks: [{ type: "document_header", title: "Biology" }, { type: "paragraph", text: "Osmosis. [D1 §Osmosis]" }], items: [], isBlockOutput: true, data: { title: "Biology" }, usage: { total_tokens: 900 }, sources: [], consolidation: { originals: [{ tag: "D1", id: "a", name: "a.docx", passages: 2 }, { tag: "D2", id: "b", name: "b.docx", passages: 3 }], coverage: { passages: 5, passagesCited: 5 } } } }
      ]);
    }
    return { ok: true, json: async () => ({ items: [{ question: "What is osmosis?", type: "multiple-choice", options: ["Water movement", "Heat"], answer: "Water movement", explanation: "e", topic: "Osmosis", difficulty: "easy", front: "Osmosis", back: "Water movement" }], sources: [] }) };
  });
  return { impl, requests };
}

describe("executePlan with a master document", () => {
  afterEach(() => vi.unstubAllGlobals());

  function harness() {
    const saved: any[] = [];
    const updated: any[] = [];
    return {
      saved,
      updated,
      onSaveGeneratedQuizDocument: async (payload: any) => { const id = `doc${saved.length + 1}`; saved.push({ id, ...payload }); return { id }; },
      onUpdateGeneratedDocument: async (id: string, payload: any) => { updated.push({ id, ...payload }); }
    };
  }

  it("builds the master document FIRST, files it once in the plan's folder, and stores its id on the plan", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.impl);
    const h = harness();
    const events: any[] = [];
    const result = await executePlan({ plan: makePlan(), documents: [A, B], workspaceId: "w", subjectId: "s", folderIds: ["planFolder"], onSaveGeneratedQuizDocument: h.onSaveGeneratedQuizDocument, onUpdateGeneratedDocument: h.onUpdateGeneratedDocument, onProgress: (event: any) => events.push(event) });

    // the first request is the consolidation, for both uploads, with the consolidator's spec
    expect(server.requests[0].url).toMatch(/\/stream$/);
    expect(server.requests[0].config.spec.pipeline).toBe("consolidate");
    expect(server.requests[0].config.scope.documentIds).toEqual(["a", "b"]);
    // saved first, once, in the plan's folder, as a master document
    expect(h.saved[0]).toMatchObject({ folderIds: ["planFolder"] });
    expect(h.saved[0].tags).toEqual(expect.arrayContaining(["resource", MASTER_TAG]));
    expect(h.saved[0].file.name).toBe(`${masterTitle(makePlan())}.resource.json`);
    const stored = JSON.parse(h.saved[0].file.content);
    expect(stored.master.originals.map((original: any) => original.name)).toEqual(["a.docx", "b.docx"]);
    expect(stored.data.blocks).toHaveLength(2);
    expect(h.saved.filter((doc) => doc.tags.includes(MASTER_TAG))).toHaveLength(1);
    // the plan remembers it and what it was built from
    expect(result.plan.masterDocumentId).toBe(h.saved[0].id);
    expect(result.plan.masterSourceIds).toEqual(["a", "b"]);
    expect(result.plan.materialIds).toEqual(["a", "b"]);
    expect(result.masterBuilt).toBe(true);
    // progress: master before any step
    expect(events[0].phase).toBe("master");
    expect(events.find((event) => event.phase === "master" && event.of)).toMatchObject({ done: 1, of: 2, detail: "Read part 1 of 2" });
    expect(events.findIndex((event) => event.phase === "steps")).toBeGreaterThan(0);
  });

  it("makes every quiz, flashcard set and summary read the master document, not the individual files", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.impl);
    const h = harness();
    const result = await executePlan({ plan: makePlan(), documents: [A, B], workspaceId: "w", subjectId: "s", folderIds: ["planFolder"], onSaveGeneratedQuizDocument: h.onSaveGeneratedQuizDocument });
    const masterId = h.saved[0].id;
    const stepRequests = server.requests.slice(1);
    expect(stepRequests).toHaveLength(2);
    for (const request of stepRequests) expect(request.config.scope.documentIds).toEqual([masterId]);
    expect(result.created).toBe(2);
    expect(result.plan.items.every((step: any) => step.resourceId && !step.generate)).toBe(true);
    expect(result.plan.items[0].note).toMatch(/master document/);
    // the quizzes are filed in the same folder, as ordinary resources
    expect(h.saved.slice(1).every((doc) => !doc.tags.includes(MASTER_TAG) && doc.folderIds[0] === "planFolder")).toBe(true);
  });

  it("does not build it again on the next build, and reads the same document", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.impl);
    const h = harness();
    const first = await executePlan({ plan: makePlan(), documents: [A, B], workspaceId: "w", subjectId: "s", folderIds: ["f"], onSaveGeneratedQuizDocument: h.onSaveGeneratedQuizDocument });
    server.requests.length = 0;
    const masterDocument = { id: first.plan.masterDocumentId, sourceType: "generated", tags: ["resource", MASTER_TAG] };
    const more = { ...first.plan, items: [...first.plan.items, item("3", "quiz")] };
    await executePlan({ plan: more, documents: [A, B, masterDocument], workspaceId: "w", subjectId: "s", folderIds: ["f"], onSaveGeneratedQuizDocument: h.onSaveGeneratedQuizDocument, onUpdateGeneratedDocument: h.onUpdateGeneratedDocument });
    expect(server.requests.some((request) => request.url.endsWith("/stream"))).toBe(false);
    expect(server.requests[0].config.scope.documentIds).toEqual([masterDocument.id]);
    expect(h.saved.filter((doc) => doc.tags.includes(MASTER_TAG))).toHaveLength(1);
  });

  it("rewrites the SAME document (never a second copy) when the plan's uploads changed", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.impl);
    const h = harness();
    const plan = makePlan({ materialIds: ["a", "b", "c"], masterDocumentId: "m1", masterSourceIds: ["a", "b"] });
    const masterDocument = { id: "m1", sourceType: "generated", tags: ["resource", MASTER_TAG] };
    const result = await executePlan({ plan, documents: [A, B, C, masterDocument], workspaceId: "w", subjectId: "s", folderIds: ["f"], onSaveGeneratedQuizDocument: h.onSaveGeneratedQuizDocument, onUpdateGeneratedDocument: h.onUpdateGeneratedDocument });
    expect(server.requests[0].config.scope.documentIds).toEqual(["a", "b", "c"]);
    expect(h.updated.map((doc) => doc.id)).toEqual(["m1"]);
    expect(h.saved.filter((doc) => doc.tags.includes(MASTER_TAG))).toHaveLength(0);
    expect(result.plan.masterDocumentId).toBe("m1");
    expect(result.plan.masterSourceIds).toEqual(["a", "b", "c"]);
  });

  it("falls back to the original documents if the master document cannot be built", async () => {
    const server = fakeServer({ failMaster: true });
    vi.stubGlobal("fetch", server.impl);
    const h = harness();
    const result = await executePlan({ plan: makePlan(), documents: [A, B], workspaceId: "w", subjectId: "s", folderIds: ["f"], onSaveGeneratedQuizDocument: h.onSaveGeneratedQuizDocument });
    expect(result.failures[0]).toMatchObject({ title: "Master document", message: "boom" });
    expect(result.plan.masterDocumentId).toBeUndefined();
    expect(server.requests[1].config.scope.documentIds).toEqual(["a"]);
    expect(result.created).toBe(2);
  });

  it("leaves a plan with one uploaded document exactly as before", async () => {
    const server = fakeServer();
    vi.stubGlobal("fetch", server.impl);
    const h = harness();
    const result = await executePlan({ plan: makePlan({ materialIds: ["a"] }), documents: [A, B], workspaceId: "w", subjectId: "s", folderIds: ["f"], onSaveGeneratedQuizDocument: h.onSaveGeneratedQuizDocument });
    expect(server.requests.some((request) => request.url.endsWith("/stream"))).toBe(false);
    expect(server.requests[0].config.scope.documentIds).toEqual(["a"]);
    expect(result.plan.masterDocumentId).toBeUndefined();
  });
});

describe("the master document and the plan's folders", () => {
  it("is generated material in the plan's folder: deleted with the plan, while the uploads it merges are only unlinked", () => {
    const folders: any[] = [{ id: "root", name: "Study plans", parentFolderId: "" }, { id: "p1", name: "Biology final", parentFolderId: "root" }, { id: "p1m", name: "Reference materials", parentFolderId: "p1" }];
    const master: any = { id: "m", sourceType: "generated", tags: ["resource", MASTER_TAG], folderIds: ["p1"] };
    const planDoc: any = { id: "plan", tags: ["study-plan"], folderIds: ["p1"] };
    const scope = planDeletionScope(planDoc, makePlan({ masterDocumentId: "m" }), { folders, documents: [planDoc, master, { ...A, folderIds: ["p1m"] }, { ...B, folderIds: ["p1m"] }] });
    expect(scope.generatedIds).toEqual(["m"]);
    expect(scope.linkedIds.sort()).toEqual(["a", "b"]);
  });
});

describe("reading the stream", () => {
  it("returns the final result, reports progress, and throws the server's error", async () => {
    const body = (lines: string[]) => new Response(lines.join("\n")).body as ReadableStream;
    const seen: string[] = [];
    const result = await readAgentStream(body([JSON.stringify({ step: "generate", status: "progress", phase: "map" }), JSON.stringify({ step: "done", result: { ok: 1 } })]), (event: any) => seen.push(event.step));
    expect(result).toEqual({ ok: 1 });
    expect(seen).toEqual(["generate", "done"]);
    await expect(readAgentStream(body([JSON.stringify({ step: "error", error: "no luck" })]))).rejects.toThrow("no luck");
    await expect(readAgentStream(body([]))).rejects.toThrow(/without a result/);
  });
});

describe("the agent in the AI agents tab", () => {
  it("is registered as a built-in tool (the hub lists every registry tool except the builder, template studio and chatbot)", () => {
    // The registry pulls in JSX pages that vitest does not transform, so it is checked in the source.
    const registry = readFileSync(new URL("../../modules/ai-tools/registry.js", import.meta.url), "utf8");
    expect(registry).toMatch(/summaryConsolidatorTool,/);
    const hub = readFileSync(new URL("../../modules/ai-tools/ui/AIToolsHubPage.js", import.meta.url), "utf8");
    expect(hub).toContain('!["agent-builder", "template-builder", "chatbot"].includes(tool.id)');
  });
  it("has the consolidation pipeline flag and a language + focus input", () => {
    expect(AGENT.spec.pipeline).toBe("consolidate");
    expect(AGENT.questions.map((question: any) => question.text)).toEqual(["Language", "Focus (optional)"]);
    expect(AGENT.materialSlots[0]).toMatchObject({ required: true });
  });
  it("offers structure blocks only, and the run's output schema is the registry's for exactly those", () => {
    const ids = AGENT.spec.output.selectedBlocks.map((block: any) => block.blockId);
    for (const id of ids) expect((BLOCKS as any)[id]).toBeTruthy();
    expect(AGENT.outputJsonSchema.properties.items.items.properties.type.enum).toEqual(ids);
  });
  it("is available to the plan as a recipe that streams, reads every document and tags its result", () => {
    expect(STEP_RECIPES.master).toMatchObject({ streams: true, tags: [MASTER_TAG] });
    // the plan asks for the documents' own language: an empty answer to the language question
    const language = AGENT.questions.find((question: any) => /language/i.test(question.text));
    expect((STEP_RECIPES.master.answers as any)[language.id]).toBe("");
  });
});
