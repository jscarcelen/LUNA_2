import { describe, expect, it } from "vitest";
import { addDays, buildPlan, newDeadline, newItem } from "../../modules/plans/plan.js";
import { applyRevision, buildRevisePayload, doneItemIds, fallbackRevision, minutesPerWeek, reviseWindow, spreadDates, splitDocuments } from "../../modules/plans/revise.js";

const TODAY = "2026-10-01";
const at = (days) => addDays(TODAY, days);

function fixture() {
  const done = { ...newItem({ resourceId: "r-done", title: "Quiz: probability", kind: "activity", dueDate: at(-3) }), doneAt: "2026-09-29T10:00:00Z", generate: "quiz" };
  const attempted = newItem({ resourceId: "r-attempt", title: "Flashcards: terms", kind: "activity", dueDate: at(-2) });
  const built = { ...newItem({ resourceId: "r-built", title: "Quiz: regression", kind: "activity", dueDate: at(2) }), generate: "" };
  const unbuilt = { ...newItem({ title: "Quiz: variance", kind: "activity", dueDate: at(4) }), generate: "quiz", sourceDocumentId: "doc-old" };
  const manual = newItem({ title: "Ask the teacher about outliers", kind: "review", dueDate: at(6) });
  const plan = buildPlan({ name: "Statistics", deadlines: [newDeadline("Exam", at(20), "exam")], startDate: at(-10), items: [done, attempted, built, unbuilt, manual], materialIds: ["doc-old"] });
  const attempts = [{ resourceId: "r-attempt", score: 4, total: 5 }];
  return { plan, attempts, done, attempted, built, unbuilt, manual, window: reviseWindow(plan, TODAY) };
}

describe("uploaded vs generated", () => {
  it("splits documents into uploaded material and generated resources", () => {
    const documents = [{ id: "u1", sourceType: "upload" }, { id: "g1", sourceType: "generated" }, { id: "g2", sourceType: "upload" }];
    const { uploaded, generated } = splitDocuments(documents, [{ document: { id: "g2" } }]);
    expect(uploaded.map((d) => d.id)).toEqual(["u1"]);
    expect(generated.map((d) => d.id)).toEqual(["g1", "g2"]);
  });
});

describe("the time that is left", () => {
  it("runs from today to the last deadline and falls back to four weeks", () => {
    const { plan } = fixture();
    expect(reviseWindow(plan, TODAY)).toEqual({ today: TODAY, horizon: at(20), days: expect.any(Number) });
    expect(reviseWindow({ ...plan, deadlines: [] }, TODAY).horizon).toBe(at(28));
  });

  it("reads the learner's pace from the plan and spreads dates evenly", () => {
    const { plan, window } = fixture();
    expect(minutesPerWeek(plan, window) % 30).toBe(0);
    expect(spreadDates(4, TODAY, at(12))).toEqual([at(0), at(3), at(6), at(9)]);
  });
});

describe("re-planning", () => {
  it("knows what is already done: ticked off, or attempted", () => {
    const { plan, attempts, done, attempted, built } = fixture();
    const ids = doneItemIds(plan, attempts);
    expect(ids.has(done.id)).toBe(true);
    expect(ids.has(attempted.id)).toBe(true);
    expect(ids.has(built.id)).toBe(false);
  });

  it("keeps finished work untouched and re-spreads the rest, new material included", () => {
    const { plan, attempts, done, attempted, built, unbuilt, manual, window } = fixture();
    const doneIds = doneItemIds(plan, attempts);
    const revision = {
      note: "Added the new chapter.",
      newGoals: [{ title: "Hypothesis tests", concepts: ["p-value"], targetScore: 0.8 }],
      items: [
        { keepId: built.id, title: built.title, kind: "activity", dueDate: at(3), minutes: 30, sourceId: "r-built", generate: "", goal: "", concepts: [] },
        { keepId: "", title: "Read: Hypothesis testing", kind: "read", dueDate: at(5), minutes: 40, sourceId: "doc-new", generate: "", goal: "Hypothesis tests", concepts: ["p-value"] },
        { keepId: "", title: "Quiz: Hypothesis testing", kind: "activity", dueDate: at(9), minutes: 30, sourceId: "doc-new", generate: "quiz", goal: "Hypothesis tests", concepts: ["p-value"] },
        { keepId: manual.id, title: manual.title, kind: "review", dueDate: "not a date", minutes: 20, sourceId: "", generate: "", goal: "", concepts: [] },
        { keepId: "", title: "Practice exam", kind: "exam", dueDate: at(90), minutes: 60, sourceId: "doc-new", generate: "exam", goal: "", concepts: [] }
      ]
    };
    const result = applyRevision(plan, revision, { doneIds, window });
    const byTitle = (title) => result.plan.items.find((item) => item.title === title);

    // Finished work: byte-for-byte the same, dates included.
    for (const item of [done, attempted]) expect(result.plan.items.find((entry) => entry.id === item.id)).toEqual(item);
    // The built resource is kept, moved; the planned-but-unbuilt quiz is replaced; the hand-written step survives.
    expect(byTitle(built.title)).toMatchObject({ id: built.id, resourceId: "r-built", dueDate: at(3) });
    expect(byTitle(unbuilt.title)).toBeUndefined();
    expect(byTitle(manual.title)).toBeTruthy();
    // New steps carry what Luna needs to build them.
    expect(byTitle("Quiz: Hypothesis testing")).toMatchObject({ generate: "quiz", sourceDocumentId: "doc-new", dueDate: at(9) });
    expect(byTitle("Read: Hypothesis testing")).toMatchObject({ kind: "read", generate: "" });
    // Dates are forced into the window; a missing date is spread over what is left.
    expect(byTitle("Practice exam").dueDate).toBe(window.horizon);
    const pending = result.plan.items.filter((item) => !doneIds.has(item.id));
    for (const item of pending) { expect(item.dueDate >= TODAY).toBe(true); expect(item.dueDate <= window.horizon).toBe(true); }
    expect(result.plan.goals.map((goal) => goal.title)).toContain("Hypothesis tests");
    expect(result.summary).toMatchObject({ kept: 2, added: 3, dropped: 1 });
  });

  it("never drops a step that already has its resource, even if the model forgets it", () => {
    const { plan, attempts, built, window } = fixture();
    const result = applyRevision(plan, { items: [] }, { doneIds: doneItemIds(plan, attempts), window });
    expect(result.plan.items.find((item) => item.id === built.id)).toBeTruthy();
  });

  it("schedules a new generated resource that the model places", () => {
    const { plan, attempts, window } = fixture();
    const result = applyRevision(plan, { items: [{ keepId: "", title: "Worked examples", kind: "activity", dueDate: at(7), minutes: 30, sourceId: "gen-1", generate: "", goal: "", concepts: [] }] }, { doneIds: doneItemIds(plan, attempts), window, generatedIds: new Set(["gen-1"]) });
    expect(result.plan.items.find((item) => item.title === "Worked examples")).toMatchObject({ resourceId: "gen-1", generate: "" });
  });

  it("builds a usable schedule without a model: old steps in order, new material added, exam last", () => {
    const { plan, attempts, built, manual, window } = fixture();
    const doneIds = doneItemIds(plan, attempts);
    const revision = fallbackRevision({ plan, doneIds, newUploaded: [{ id: "doc-new", name: "Chapter 5" }], window });
    const titles = revision.items.map((item) => item.title);
    expect(titles).toContain("Read: Chapter 5");
    expect(titles.some((title) => title.includes("Chapter 5") && title.startsWith("Quiz"))).toBe(true);
    expect(revision.items.at(-1).kind === "review" || revision.items.at(-1).kind === "exam").toBe(true);
    const dates = revision.items.map((item) => item.dueDate);
    expect([...dates].sort()).toEqual(dates);
    const result = applyRevision(plan, revision, { doneIds, window });
    expect(result.plan.items.find((item) => item.id === built.id).dueDate >= TODAY).toBe(true);
    expect(result.plan.items.find((item) => item.id === manual.id)).toBeTruthy();
  });

  it("tells the model what is fixed, what can move and what is new", () => {
    const { plan, attempts, window } = fixture();
    const payload = buildRevisePayload({ plan, doneIds: doneItemIds(plan, attempts), newUploaded: [{ id: "doc-new", name: "Chapter 5" }], window });
    expect(payload.done).toHaveLength(2);
    expect(payload.pending).toHaveLength(3);
    expect(payload.pending.find((item) => item.title === "Quiz: regression").built).toBe(true);
    expect(payload.newUploaded).toEqual([{ id: "doc-new", name: "Chapter 5", concepts: [] }]);
    expect(payload.deadline).toBe(window.horizon);
  });
});
