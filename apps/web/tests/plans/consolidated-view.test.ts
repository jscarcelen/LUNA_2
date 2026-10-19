import { afterEach, describe, expect, it, vi } from "vitest";
import * as master from "../../modules/plans/master.js";
import { localPlan as localPlanJs } from "../../modules/plans/localPlan.js";
import { executePlan as executePlanJs } from "../../modules/plans/execute.js";
import { ensureAgentUse as ensureAgentUseJs } from "../../modules/plans/agentUse.js";
import { capDailyMinutes as capJs } from "../../modules/plans/dailyCap.js";
import { readFileSync } from "node:fs";

const m: any = master;
const localPlan: any = localPlanJs;
const executePlan: any = executePlanJs;
const ensureAgentUse: any = ensureAgentUseJs;
const capDailyMinutes: any = capJs;

const upload = (id: string, chars = 1000): any => ({ id, name: `${id}.docx`, sourceType: "uploaded", tags: [], folderIds: [], content: "x".repeat(chars) });
const step = (title: string, dueDate: string, extra: any = {}) => ({ title, kind: "activity", dueDate, minutes: 25, sourceId: "a", generate: "quiz", goal: "", concepts: [], ...extra });

describe("when the plan starts with a consolidated view of the resources", () => {
  it("3 or more uploaded documents, or a lot of material, and never without an upload", () => {
    expect(m.needsConsolidatedView({ uploadedCount: 2, totalChars: 1000 })).toBe(false);
    expect(m.needsConsolidatedView({ uploadedCount: 3, totalChars: 10 })).toBe(true);
    expect(m.needsConsolidatedView({ uploadedCount: 1, totalChars: m.CONSOLIDATED_MIN_CHARS - 1 })).toBe(false);
    expect(m.needsConsolidatedView({ uploadedCount: 1, totalChars: m.CONSOLIDATED_MIN_CHARS })).toBe(true);
    expect(m.needsConsolidatedView({ uploadedCount: 0, totalChars: 10 ** 7 })).toBe(false);
  });

  it("counts only the plan's uploaded documents (a generated resource is not material to consolidate)", () => {
    const docs = [upload("a"), upload("b"), { id: "res", sourceType: "generated", content: "y".repeat(10 ** 6) }];
    expect(m.planNeedsConsolidatedView({ materialIds: ["a", "b", "res"] }, docs)).toBe(false);
    expect(m.planNeedsConsolidatedView({ materialIds: ["a", "b", "c"] }, [...docs, upload("c")])).toBe(true);
    expect(m.planNeedsConsolidatedView({ materialIds: ["a"] }, [upload("a", m.CONSOLIDATED_MIN_CHARS)])).toBe(true);
    // A single long document gets its master document too, because the plan's first step reads it.
    expect(m.needsMasterDocument({ materialIds: ["a"] }, [upload("a", m.CONSOLIDATED_MIN_CHARS)])).toBe(true);
    expect(m.needsMasterDocument({ materialIds: ["a"], items: [{ generate: "master" }] }, [upload("a")])).toBe(true);
    expect(m.needsMasterDocument({ materialIds: ["a"], items: [] }, [upload("a")])).toBe(false);
  });
});

describe("ensureConsolidatedStep puts it first, exactly once", () => {
  const today = "2026-10-20";
  it("adds it before every other step, on the plan's first day", () => {
    const { items, added } = m.ensureConsolidatedStep([step("Quiz: B", "2026-10-25"), step("Read: A", "2026-10-22", { kind: "read", generate: "" })], { today, title: "Consolidated view of the resources", concepts: ["Assets", "Liabilities"] });
    expect(added).toBe(true);
    expect(items[0]).toMatchObject({ title: "Consolidated view of the resources", kind: "read", generate: "master", sourceId: "", dueDate: "2026-10-22", concepts: ["Assets", "Liabilities"] });
    expect(items).toHaveLength(3);
  });
  it("moves the model's own step to the front and drops duplicates, keeping its title", () => {
    const { items, added } = m.ensureConsolidatedStep([step("Quiz", "2026-10-21"), step("Vista consolidada", "2026-10-28", { generate: "master", kind: "read" }), step("Again", "2026-10-29", { generate: "master" })], { today });
    expect(added).toBe(false);
    expect(items.filter((item: any) => item.generate === "master")).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: "Vista consolidada", generate: "master", dueDate: "2026-10-21" });
  });
  it("never dates it before today", () => {
    const { items } = m.ensureConsolidatedStep([step("Old", "2026-10-01")], { today });
    expect(items[0].dueDate).toBe(today);
  });
  it("stays first after the route's other checks (agent use, daily cap)", () => {
    const deadline = "2026-11-20";
    let items: any[] = [step("Quiz: A", today), step("Read: A", today, { kind: "read", generate: "" }), step("Quiz: B", today)];
    items = m.ensureConsolidatedStep(items, { today }).items;
    items = ensureAgentUse(items, [{ id: "quiz", makes: ["quiz"] }], { today, deadline, materials: [{ id: "a" }] }).items;
    items = capDailyMinutes(items, { maxPerDay: 60, today, horizon: deadline }).items;
    items = m.ensureConsolidatedStep(items, { today }).items;
    expect(items[0].generate).toBe("master");
    expect(items.filter((item: any) => item.generate === "master")).toHaveLength(1);
    expect(items.every((item: any) => item.dueDate >= items[0].dueDate)).toBe(true);
  });
});

describe("the plan generator knows the rule", () => {
  const route = readFileSync(new URL("../../app/api/plans/generate/route.js", import.meta.url), "utf8");
  it("tells the model the first step is the consolidated view and checks it in code", () => {
    expect(route).toMatch(/Consolidated view first: when <consolidated_view>/);
    expect(route).toMatch(/<consolidated_view>/);
    expect(route).toMatch(/ensureConsolidatedStep\(parsed\.items/);
    expect(route).toMatch(/localPlan\(/);
  });
});

describe("the plan without a model (local fallback)", () => {
  const today = "2026-10-20";
  const deadline = "2026-11-19";
  const materials = [{ id: "a", name: "A.docx", kind: "material" }, { id: "b", name: "B.docx", kind: "material" }, { id: "c", name: "C.docx", kind: "material" }];
  const conceptMap = Array.from({ length: 14 }, (_, k) => ({ name: `Concept ${k + 1}` }));
  it("schedules reading and practice for every concept inside the dates, then a review and the exam", () => {
    const plan = localPlan({ today, deadline, materials, kinds: ["quiz", "flashcards"], conceptMap, maxPerDay: 90 });
    expect(plan.goals).toHaveLength(1);
    expect(plan.items.every((item: any) => item.dueDate >= today && item.dueDate <= deadline)).toBe(true);
    const practised = new Set(plan.items.filter((item: any) => item.generate === "quiz").flatMap((item: any) => item.concepts));
    expect(practised.size).toBe(14);
    expect(plan.items[plan.items.length - 1]).toMatchObject({ kind: "exam", dueDate: deadline, generate: "quiz" });
  });
  it("with 3 documents, the consolidated view becomes step 1 like a model's plan", () => {
    const plan = localPlan({ today, deadline, materials, kinds: ["quiz"], conceptMap });
    const items = m.ensureConsolidatedStep(plan.items, { today }).items;
    expect(items[0].generate).toBe("master");
    expect(items[0].dueDate).toBe(today);
  });
});

describe("executePlan builds the consolidated view as step 1 (the master document), once", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("builds it first, points step 1 at it, and builds the later steps from it", async () => {
    const requests: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      const config = JSON.parse(init.body).config;
      requests.push({ url, config });
      if (url.endsWith("/stream")) {
        const events = [{ step: "done", status: "end", result: { blocks: [{ type: "document_header", title: "All" }, { type: "paragraph", text: "Merged. [D1]" }], items: [], isBlockOutput: true, data: { title: "All" }, sources: [], consolidation: { originals: [], coverage: { passages: 1 } } } }];
        return new Response(new ReadableStream({ start(controller) { for (const event of events) controller.enqueue(new TextEncoder().encode(`${JSON.stringify(event)}\n`)); controller.close(); } }));
      }
      return { ok: true, json: async () => ({ items: [{ question: "Q?", type: "multiple-choice", options: ["a", "b"], answer: "a", explanation: "e", topic: "t", difficulty: "easy" }], sources: [] }) };
    }));
    const saved: any[] = [];
    const docs = [upload("a"), upload("b"), upload("c")];
    const plan: any = { kind: "study-plan", name: "Accounting", materialIds: ["a", "b", "c"], items: [
      { id: "s1", title: "Consolidated view of the resources", kind: "read", dueDate: "2026-10-20", generate: "master", resourceId: "", concepts: [] },
      { id: "s2", title: "Quiz: assets", kind: "activity", dueDate: "2026-10-21", generate: "quiz", resourceId: "", sourceDocumentId: "a", concepts: [] }
    ] };
    const result = await executePlan({ plan, documents: docs, workspaceId: "w", subjectId: "s", folderIds: ["f"], onSaveGeneratedQuizDocument: async (payload: any) => { saved.push(payload); return { id: `doc${saved.length}` }; }, onUpdateGeneratedDocument: async () => {} });
    expect(requests[0].url).toMatch(/\/stream$/);
    expect(requests[0].config.spec.pipeline).toBe("consolidate");
    expect(requests.filter((request) => request.url.endsWith("/stream"))).toHaveLength(1);
    expect(result.plan.items[0]).toMatchObject({ id: "s1", resourceId: "doc1", madeAs: "master", generate: "" });
    expect(result.plan.masterDocumentId).toBe("doc1");
    expect(requests[1].config.scope.documentIds).toEqual(["doc1"]);
    expect(result.failures).toEqual([]);
  });

  it("a reading step runs the whole-document Reading Splitter on its own document, focused on the step's topics", async () => {
    const requests: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      requests.push({ url, config: JSON.parse(init.body).config });
      return { ok: true, json: async () => ({ isBlockOutput: true, blocks: [{ type: "document_header", title: "Part" }, { type: "paragraph", text: "Assets are resources." }], items: [], sources: [] }) };
    }));
    const plan: any = { kind: "study-plan", name: "Accounting", materialIds: ["a"], items: [{ id: "r1", title: "Read: assets", kind: "read", dueDate: "2026-10-21", generate: "reading", resourceId: "", sourceDocumentId: "a", concepts: ["Assets", "Liabilities"] }] };
    const result = await executePlan({ plan, documents: [upload("a")], workspaceId: "w", subjectId: "s", onSaveGeneratedQuizDocument: async () => ({ id: "made" }) });
    expect(requests).toHaveLength(1);
    expect(requests[0].config.spec.pipeline).toBe("split");
    expect(requests[0].config.readingFocus).toEqual(["Assets", "Liabilities"]);
    expect(requests[0].config.scope.documentIds).toEqual(["a"]);
    expect(result.plan.items[0]).toMatchObject({ resourceId: "made", madeAs: "reading" });
  });

  it("a reading part is cut from the step's own uploaded document, the others read the master", () => {
    const docs = [upload("a"), upload("b")];
    const plan = { materialIds: ["a", "b"] };
    expect(m.stepSourceIds({ step: { generate: "reading", sourceDocumentId: "b" }, plan, documents: docs, master: { id: "m" } })).toEqual(["b"]);
    expect(m.stepSourceIds({ step: { generate: "quiz", sourceDocumentId: "b" }, plan, documents: docs, master: { id: "m" } })).toEqual(["m"]);
  });
});
