import { describe, expect, it } from "vitest";
import { EMBEDDED_TOOLS, MAX_CONTEXT_CHARS, cleanContext, describeView, resourceText, selectMaterial } from "../../modules/chat/materialChat.js";
import { CHAT_TOOLS, documentsInScope } from "../../modules/chat/tools.js";
import { buildMaterialPrompt, buildSystemPrompt } from "../../modules/chat/engine.js";
import { PLAN_TAG, buildPlan as buildPlanTyped, newItem as newItemTyped } from "../../modules/plans/plan";

const buildPlan: any = buildPlanTyped;
const newItem: any = newItemTyped;

const planDoc = (id: string, plan: object) => ({ id, name: `${id}.plan.json`, tags: [PLAN_TAG], sourceType: "generated", content: JSON.stringify(plan) });
const plan = (extra: object = {}) => ({ ...buildPlan({ name: "Accounting final", materialIds: ["notes", "book"], items: [newItem({ title: "Quiz on Income Statement", resourceId: "quiz" })] }), ...extra });

const workspace = {
  id: "w",
  subjects: [
    { id: "acc", name: "Accounting", folders: [], documents: [
      { id: "notes", name: "Accounting.pdf", tags: [], folderIds: [] },
      { id: "book", name: "Textbook.pdf", tags: [], folderIds: [] },
      { id: "other", name: "Unrelated.pdf", tags: [], folderIds: [] },
      { id: "quiz", name: "Quiz on Income Statement", sourceType: "generated", tags: ["resource", "activity"], content: JSON.stringify({ kind: "resource", activity: { questions: [{ prompt: "Q" }] }, data: {} }) },
      { id: "summary", name: "Summary", sourceType: "generated", tags: ["resource"], content: "" },
      { id: "master", name: "Master document", sourceType: "generated", tags: ["resource"], content: "" },
      planDoc("plan1", plan()),
      planDoc("plan2", plan({ name: "Other plan", materialIds: ["other"], items: [] })),
      planDoc("plan3", plan({ name: "With master", materialIds: ["notes"], masterDocumentId: "master", items: [newItem({ title: "Read the summary", resourceId: "summary" })] })),
      { id: "agent", name: "My agent", sourceType: "generated", tags: ["ai-agent"], content: "{}" }
    ] },
    { id: "hist", name: "History", folders: [], documents: [{ id: "war", name: "War.pdf", tags: [], folderIds: [] }] }
  ]
};
const ids = (list: { id: string }[]) => list.map((entry) => entry.id).sort();

describe("cleanContext", () => {
  it("collapses whitespace and caps the length", () => {
    expect(cleanContext("  Doing\n the   quiz  ")).toBe("Doing the quiz");
    expect(cleanContext(undefined)).toBe("");
    expect(cleanContext("x".repeat(MAX_CONTEXT_CHARS + 500))).toHaveLength(MAX_CONTEXT_CHARS);
  });
});

describe("describeView", () => {
  it("says an unfinished quiz has not been checked, and where the user is", () => {
    const text = describeView({ kind: "quiz", title: "Quiz on Income Statement", progress: { answered: 3, total: 10, checked: false, current: { number: 4, prompt: "What is gross profit?" } }, planName: "Accounting final" });
    expect(text).toContain('Doing the quiz "Quiz on Income Statement"');
    expect(text).toContain("3 questions of 10 answered");
    expect(text).toContain("NOT been checked");
    expect(text).toContain("number 4");
    expect(text).toContain("What is gross profit?");
    expect(text).toContain('study plan "Accounting final"');
  });
  it("says when the answers are visible", () => {
    const text = describeView({ kind: "quiz", title: "Midterm exam", progress: { answered: 10, total: 10, checked: true, score: 7 } });
    expect(text).toContain("Doing the exam");
    expect(text).toContain("7 of 10 correct");
    expect(text).toContain("now visible");
  });
  it("describes flashcards, documents with their part, and generated documents", () => {
    expect(describeView({ kind: "flashcards", title: "Verbs", progress: { total: 24 } })).toContain("24 cards");
    expect(describeView({ kind: "document", title: "Accounting.pdf", section: "Income Statement" })).toBe('Reading the document "Accounting.pdf", showing the part about Income Statement.');
    expect(describeView({ kind: "document", title: "Accounting.pdf" })).toBe('Reading the document "Accounting.pdf".');
    expect(describeView({ kind: "generated", title: "Summary", agentName: "Summary Writer" })).toContain('made by the agent "Summary Writer"');
  });
  it("never exceeds the context cap", () => {
    expect(describeView({ kind: "document", title: "x".repeat(2000), section: "y".repeat(2000) }).length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });
});

describe("selectMaterial", () => {
  it("takes the documents of the study plan a resource is a step of", () => {
    const pick = selectMaterial(workspace, { documentId: "quiz" });
    expect(pick.fallback).toBe(false);
    expect(ids(pick.documents)).toEqual(["book", "notes"]);
    expect(pick.referencedDocumentIds).toEqual(pick.documentIds);
    expect(pick.plans.map((entry) => entry.name)).toEqual(["Accounting final"]);
    expect(pick.scope).toMatchObject({ workspaceId: "w", subjectId: "acc", focus: true });
    expect(pick.scope.documentIds).toEqual(pick.documentIds);
    expect(pick.readableGeneratedIds).toEqual([]);
  });
  it("adds the master document when the plan has one, and lets it be read", () => {
    const pick = selectMaterial(workspace, { documentId: "summary", readSelf: true });
    expect(ids(pick.documents)).toEqual(["master", "notes", "summary"]);
    expect([...pick.readableGeneratedIds].sort()).toEqual(["master", "summary"]);
  });
  it("uses a plan the caller already knows, and the reference documents the item was made from", () => {
    const byPlan = selectMaterial(workspace, { planId: "plan2" });
    expect(ids(byPlan.documents)).toEqual(["other"]);
    const withSources = selectMaterial(workspace, { documentId: "quiz", sourceDocumentIds: ["other", "ghost"] });
    expect(ids(withSources.documents)).toEqual(["book", "notes", "other"]);
  });
  it("includes an uploaded document in the plan it belongs to", () => {
    const pick = selectMaterial(workspace, { documentId: "other", readSelf: true });
    expect(ids(pick.documents)).toEqual(["other"]);
    expect(pick.plans.map((entry) => entry.name)).toEqual(["Other plan"]);
  });
  it("falls back to the whole subject's uploaded documents when nothing is known", () => {
    const pick = selectMaterial(workspace, { subjectId: "hist" });
    expect(pick.fallback).toBe(true);
    expect(pick.documentIds).toEqual([]);
    expect(pick.scope).toMatchObject({ workspaceId: "w", subjectId: "hist", focus: true });
    expect(pick.scope.documentIds).toBeUndefined();
    const unknownItem = selectMaterial(workspace, { subjectId: "acc", documentId: "nope" });
    expect(unknownItem.fallback).toBe(true);
    expect(unknownItem.subjectId).toBe("acc");
  });
  it("finds the item's own subject before the selected one, and still keeps a readable item in the fallback", () => {
    const pick = selectMaterial(workspace, { subjectId: "hist", documentId: "war", readSelf: true });
    expect(pick.subjectId).toBe("hist");
    expect(pick.fallback).toBe(true);
    expect(pick.referencedDocumentIds).toEqual(["war"]);
  });
});

describe("documentsInScope with an exact list", () => {
  const tree = [workspace];
  it("returns just the listed documents, whatever the subject focus", () => {
    const pick = selectMaterial(workspace, { documentId: "quiz" });
    expect(ids(documentsInScope(tree, pick.scope, pick.referencedDocumentIds))).toEqual(["book", "notes"]);
  });
  it("reads a generated document only when the caller allows it, never an agent", () => {
    const scope = { workspaceId: "w", documentIds: ["notes", "master", "agent"], readableGeneratedIds: ["master", "agent"] };
    expect(ids(documentsInScope(tree, scope, []))).toEqual(["master", "notes"]);
  });
  it("in the fallback reads the subject, plus the item itself when it is a generated document that can be read", () => {
    const pick = selectMaterial(workspace, { subjectId: "acc", documentId: "summary", readSelf: true });
    expect(pick.fallback).toBe(false); // the summary sits in a plan, so the plan decides
    const fallbackScope = { workspaceId: "w", subjectId: "hist", focus: true, readableGeneratedIds: [] };
    expect(ids(documentsInScope(tree, fallbackScope, []))).toEqual(["war"]);
  });
  it("ignores malformed lists instead of failing", () => {
    expect(ids(documentsInScope(tree, { workspaceId: "w", documentIds: "notes", readableGeneratedIds: 3 }, []))).toEqual(["book", "notes", "other", "quiz", "summary", "master", "war"].sort());
  });
});

describe("resourceText", () => {
  it("flattens the blocks of a stored resource into readable text and leaves other text alone", () => {
    const content = JSON.stringify({ kind: "resource", data: { blocks: [{ type: "document_header", title: "Income Statement" }, { type: "heading", text: "Revenue", level: 2 }, { type: "paragraph", text: "Money earned." }, { type: "bullet_list", items: ["Sales", "Fees"] }] } });
    const text = resourceText(content);
    expect(text).toContain("# Income Statement");
    expect(text).toContain("## Revenue");
    expect(text).toContain("Money earned.");
    expect(text).toContain("Sales");
    expect(resourceText("# Plain markdown")).toBe("# Plain markdown");
  });
});

describe("the embedded chat's prompt and tools", () => {
  const ctx = {
    scope: {}, context: describeView({ kind: "quiz", title: "Quiz on Income Statement", progress: { answered: 2, total: 10, checked: false } }),
    documents: [{ id: "notes", name: "Accounting.pdf", sourceType: "upload", subjectName: "Accounting" }],
    referenced: [{ id: "notes", name: "Accounting.pdf" }]
  };
  it("tells the model what the user is doing and the material it may read", () => {
    const prompt = buildMaterialPrompt(ctx);
    expect(prompt).toContain('Doing the quiz "Quiz on Income Statement"');
    expect(prompt).toContain("Accounting.pdf [notes]");
  });
  it("answers only from the material with [P#] citations and never reveals an unchecked answer", () => {
    const prompt = buildMaterialPrompt(ctx);
    expect(prompt).toMatch(/Answer ONLY from this material/);
    expect(prompt).toContain("[P1]");
    expect(prompt).toMatch(/never give away the answer/);
    expect(prompt).toMatch(/records no attempt/);
  });
  it("does not carry the full assistant's guide or its propose tools", () => {
    expect(buildMaterialPrompt(ctx)).not.toContain("log_unsupported_request");
    expect(buildSystemPrompt({ scope: {}, documents: [], referenced: [] })).toContain("log_unsupported_request");
    const names = CHAT_TOOLS.filter((tool: any) => EMBEDDED_TOOLS.includes(tool.function.name)).map((tool: any) => tool.function.name).sort();
    expect(names).toEqual(["list_documents", "search_material"]);
  });
  it("says so when no plan is known", () => {
    expect(buildMaterialPrompt({ ...ctx, referenced: [] })).toContain("every uploaded document of its subject");
  });
});
