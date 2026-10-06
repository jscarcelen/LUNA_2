import { describe, expect, it } from "vitest";
import * as updatePlan from "../../modules/plans/updatePlan.js";
import { scopeFromIds, BUILTIN_PLAN_AGENTS } from "../../modules/plans/agents.js";

const m: any = updatePlan;
const TODAY = "2026-10-05";

const item = (id: string, extra: any = {}) => ({ id, title: `Step ${id}`, kind: "activity", dueDate: "2026-10-12", minutes: 30, goalId: "", resourceId: "", generate: "", note: "", concepts: [], doneAt: "", sourceDocumentId: "", ...extra });
const plan = (extra: any = {}): any => ({
  kind: "study-plan", name: "Biology final", note: "", learner: "", colour: "#000", startDate: "2026-09-20", materialIds: ["doc-a"],
  deadlines: [{ id: "dl-exam", title: "Exam", date: "2026-11-02", kind: "exam" }],
  goals: [{ id: "g1", title: "Cells", concepts: ["Osmosis"], resourceIds: [] }],
  agentScope: scopeFromIds(["quiz"], BUILTIN_PLAN_AGENTS.map((agent: any) => ({ ...agent }))),
  items: [
    item("done1", { title: "Read chapter 1", kind: "read", dueDate: "2026-09-25", doneAt: "2026-09-25T10:00:00.000Z" }),
    item("built1", { title: "Quiz on cells", resourceId: "res-1", dueDate: "2026-10-08" }),
    item("plan1", { title: "Flashcards (planned)", generate: "quiz", dueDate: "2026-10-15" }),
    item("plan2", { title: "Read chapter 3", kind: "read", dueDate: "2026-10-20" }),
    item("mine", { title: "Ask the teacher about osmosis", kind: "review", dueDate: "2026-10-22" })
  ],
  ...extra
});
const step = (id: string, extra: any = {}) => ({ id, change: "kept", title: "", kind: "activity", dueDate: "", minutes: 30, generate: "", sourceId: "", goal: "", concepts: [], ...extra });
/** The model keeps everything as it was unless the test changes it. */
const keepAll = (p: any, patch: Record<string, any> = {}) => p.items.filter((i: any) => !i.doneAt).map((i: any) => step(i.id, { title: i.title, kind: i.kind, dueDate: i.dueDate, minutes: i.minutes, generate: i.generate, concepts: i.concepts, ...(patch[i.id] || {}) }));
const run = (p: any, update: any, ctx: any = {}) => m.applyPlanUpdate(p, { summary: "", deadlineChanges: [], newGoals: [], ...update }, { doneIds: new Set(["done1"]), today: TODAY, now: "2026-10-05T12:00:00.000Z", ...ctx });
const byId = (result: any, id: string) => result.plan.items.find((i: any) => i.id === id);

describe("the plan update schema", () => {
  it("is strict: every object closed, every property required, generate limited to the plan's kinds", () => {
    const schema = m.planUpdateSchema(["quiz", "exam", "quiz"]);
    const walk = (node: any, path = "root") => {
      if (!node || typeof node !== "object") return;
      if (node.type === "object") {
        expect(node.additionalProperties, path).toBe(false);
        expect([...node.required].sort(), path).toEqual(Object.keys(node.properties).sort());
      }
      for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
    };
    walk(schema);
    expect(schema.properties.steps.items.properties.generate.enum).toEqual(["", "quiz", "exam"]);
    expect(schema.properties.steps.items.properties.change.enum).toEqual(["kept", "moved", "added", "removed", "edited"]);
    expect(schema.required).toEqual(["summary", "steps", "deadlineChanges", "newGoals"]);
  });

  it("builds the request with the done steps flagged, imposed deadlines locked and only the scope's kinds", () => {
    const p = plan({ deadlines: [{ id: "dl-exam", title: "Exam", date: "2026-11-02", kind: "exam" }, { id: "dl-hand", title: "Hand-in", date: "2026-10-20", kind: "hand_in", setBy: { kind: "sender", name: "Ms Kim" } }] });
    const window = m.updateWindow(p, p.deadlines, TODAY);
    const payload = m.buildPlanUpdatePayload({ plan: p, instruction: "  lighter  ", doneIds: new Set(["done1"]), minutesPerWeek: 90, window, today: TODAY, conceptMap: [{ name: "Osmosis", topic: "Cells" }] });
    expect(payload).toMatchObject({ today: TODAY, horizon: "2026-11-02", instruction: "lighter", minutesPerWeek: 90, kinds: ["quiz", "exam", "worksheet"] });
    expect(payload.deadlines.find((d: any) => d.id === "dl-hand").locked).toBe(true);
    expect(payload.deadlines.find((d: any) => d.id === "dl-exam").locked).toBe(false);
    expect(payload.steps.find((s: any) => s.id === "done1").done).toBe(true);
    expect(payload.steps.find((s: any) => s.id === "built1").built).toBe(true);
    expect(payload.agents).toHaveLength(1);
    expect(payload.conceptMap).toEqual([{ name: "Osmosis", topic: "Cells" }]);
  });
});

describe("what an update may change", () => {
  it("never touches a finished step, however the model answers", () => {
    const p = plan();
    const result = run(p, { steps: [...keepAll(p), step("done1", { change: "removed" }), step("done1", { change: "moved", dueDate: "2026-10-30", title: "Hacked" })] });
    expect(byId(result, "done1")).toEqual(p.items[0]);
    expect(result.counts.done).toBe(1);
    expect(result.counts.removed).toBe(0);
  });

  it("keeps a step with its built resource: it can be moved or retitled but not removed", () => {
    const p = plan();
    const removed = run(p, { steps: keepAll(p, { built1: { change: "removed" } }) });
    expect(byId(removed, "built1")).toMatchObject({ resourceId: "res-1", title: "Quiz on cells" });
    expect(removed.counts.removed).toBe(0);
    const moved = run(p, { steps: keepAll(p, { built1: { change: "moved", dueDate: "2026-10-30", title: "Cells quiz" } }) });
    expect(byId(moved, "built1")).toMatchObject({ resourceId: "res-1", dueDate: "2026-10-30", title: "Cells quiz", generate: "" });
    expect(moved.counts.edited).toBe(1);
  });

  it("removes a planned step only when told to; what the model leaves out is kept", () => {
    const p = plan();
    const explicit = run(p, { steps: keepAll(p, { plan2: { change: "removed" } }) });
    expect(byId(explicit, "plan2")).toBeUndefined();
    expect(explicit.counts.removed).toBe(1);
    const omitted = run(p, { steps: keepAll(p).filter((s: any) => s.id !== "plan2") });
    expect(byId(omitted, "plan2")).toMatchObject({ title: "Read chapter 3", dueDate: "2026-10-20" });
    expect(omitted.counts.removed).toBe(0);
    expect(omitted.changed).toBe(false);
  });

  it("classifies kept, moved, edited, added and removed against the old plan", () => {
    const p = plan();
    const result = run(p, {
      summary: "Moved the reading, added a mock exam, dropped the self-written step.",
      steps: [
        ...keepAll(p, { plan2: { change: "moved", dueDate: "2026-10-18" }, plan1: { change: "edited", title: "Quiz on osmosis" }, mine: { change: "removed" } }),
        step("", { change: "added", title: "Mock exam", kind: "exam", dueDate: "2026-10-30", minutes: 60, generate: "quiz", concepts: ["Osmosis"] })
      ]
    });
    expect(result.counts).toEqual({ done: 1, kept: 1, moved: 1, added: 1, removed: 1, edited: 1 });
    expect(result.summary).toBe("Moved the reading, added a mock exam, dropped the self-written step.");
    const added = result.changes.find((c: any) => c.change === "added");
    expect(added.item).toMatchObject({ title: "Mock exam", kind: "exam", generate: "quiz", minutes: 60 });
    expect(added.item.id).toMatch(/^item_/);
    expect(m.groupChanges(result.changes)).toMatchObject({ kept: 1 });
    expect(m.stepsToBuild(result.plan, result.changes).map((i: any) => i.title)).toEqual(["Mock exam"]);
    expect(result.changed).toBe(true);
  });

  it("only uses the agents of the plan's scope", () => {
    const p = plan();
    const result = run(p, { steps: [...keepAll(p), step("", { change: "added", title: "Flashcards for chapter 3", dueDate: "2026-10-25", generate: "flashcards" }), step("", { change: "added", title: "Practice exam", kind: "exam", dueDate: "2026-10-28", generate: "exam" })] });
    const flash = result.plan.items.find((i: any) => i.title === "Flashcards for chapter 3");
    expect(flash.generate).toBe("");
    expect(result.plan.items.find((i: any) => i.title === "Practice exam").generate).toBe("exam");
    // an existing unbuilt step cannot be re-pointed to an agent outside the scope either
    const swapped = run(p, { steps: keepAll(p, { plan1: { generate: "flashcards" } }) });
    expect(byId(swapped, "plan1").generate).toBe("quiz");
    // a plan whose learner allowed no agents never gets generated steps
    const none = plan({ agentScope: [] });
    const noneResult = run(none, { steps: [...keepAll(none), step("", { change: "added", title: "A quiz", generate: "quiz", dueDate: "2026-10-25" })] });
    expect(noneResult.plan.items.find((i: any) => i.title === "A quiz").generate).toBe("");
  });

  it("a custom agent in the scope can be used", () => {
    const custom = { id: "agent:xyz", label: "Exam machine", purpose: "", makes: ["agent:xyz"], custom: true, documentId: "xyz" };
    const p = plan({ agentScope: [custom] });
    const result = run(p, { steps: [...keepAll(p), step("", { change: "added", title: "Exam machine run", dueDate: "2026-10-25", generate: "agent:xyz" })] });
    expect(result.plan.items.find((i: any) => i.title === "Exam machine run").generate).toBe("agent:xyz");
  });

  it("keeps every date between today and the last deadline, and spreads undated steps", () => {
    const p = plan();
    const result = run(p, { steps: [...keepAll(p, { plan2: { change: "moved", dueDate: "2027-03-01" }, plan1: { change: "moved", dueDate: "2026-01-01" } }), step("", { change: "added", title: "No date yet", dueDate: "later" })] });
    expect(byId(result, "plan2").dueDate).toBe("2026-11-02");
    expect(byId(result, "plan1").dueDate).toBe(TODAY);
    const undated = result.plan.items.find((i: any) => i.title === "No date yet");
    expect(undated.dueDate >= TODAY && undated.dueDate <= "2026-11-02").toBe(true);
    for (const entry of result.plan.items.filter((i: any) => !i.doneAt)) expect(entry.dueDate >= TODAY && entry.dueDate <= "2026-11-02").toBe(true);
  });
});

describe("deadlines", () => {
  const imposed = { id: "dl-hand", title: "Hand-in", date: "2026-10-20", kind: "hand_in", setBy: { kind: "sender", name: "Ms Kim" } };

  it("leaves a deadline someone else set exactly as it was — from the model and from the learner's own field", () => {
    const p = plan({ deadlines: [{ id: "dl-exam", title: "Exam", date: "2026-11-02", kind: "exam" }, imposed] });
    const result = run(p, { steps: keepAll(p), deadlineChanges: [{ id: "dl-hand", date: "2026-12-01" }, { id: "dl-exam", date: "2026-11-09" }] }, { deadlineEdit: [{ id: "dl-hand", date: "2027-01-01" }] });
    expect(result.plan.deadlines.find((d: any) => d.id === "dl-hand")).toEqual(imposed);
    expect(result.plan.deadlines.find((d: any) => d.id === "dl-exam").date).toBe("2026-11-09");
    expect(result.deadlineMoves).toEqual([{ id: "dl-exam", title: "Exam", from: "2026-11-02", to: "2026-11-09" }]);
    expect(result.window.horizon).toBe("2026-11-09");
    expect(result.plan.deadlines).toHaveLength(2);
  });

  it("any setBy protects the deadline, and an unknown id or a past date changes nothing", () => {
    const p = plan({ deadlines: [{ id: "dl-x", title: "Set by a parent", date: "2026-11-02", kind: "exam", setBy: { kind: "parent" } }] });
    const result = run(p, { steps: keepAll(p), deadlineChanges: [{ id: "dl-x", date: "2026-11-30" }, { id: "nope", date: "2026-11-30" }] });
    expect(result.plan.deadlines[0].date).toBe("2026-11-02");
    const own = plan();
    expect(run(own, { steps: keepAll(own), deadlineChanges: [{ id: "dl-exam", date: "2020-01-01" }] }).plan.deadlines[0].date).toBe("2026-11-02");
  });

  it("the editable deadline is the next one nobody imposed", () => {
    const p = plan({ deadlines: [imposed, { id: "dl-exam", title: "Exam", date: "2026-11-02", kind: "exam" }] });
    expect(m.editableDeadline(p, TODAY).id).toBe("dl-exam");
    expect(m.editableDeadline(plan({ deadlines: [imposed] }), TODAY)).toBeNull();
    expect(m.isImposedDeadline(imposed)).toBe(true);
    expect(m.isImposedDeadline({ id: "a" })).toBe(false);
  });

  it("an earlier deadline pulls steps that no longer fit back inside the window", () => {
    const p = plan();
    const result = run(p, { steps: keepAll(p) }, { deadlineEdit: [{ id: "dl-exam", date: "2026-10-16" }] });
    expect(result.window.horizon).toBe("2026-10-16");
    expect(byId(result, "plan2").dueDate).toBe("2026-10-16");
    expect(byId(result, "mine").dueDate).toBe("2026-10-16");
    expect(byId(result, "plan1").dueDate).toBe("2026-10-15");
    expect(result.changed).toBe(true);
  });
});

describe("history and restore", () => {
  it("records the plan as it was with the request and the summary, newest first, five at most", () => {
    let current = plan();
    for (let n = 1; n <= 7; n += 1) {
      const result = run(current, { summary: `change ${n}`, steps: keepAll(current, { plan2: { change: "moved", dueDate: n % 2 ? "2026-10-18" : "2026-10-21" } }) }, { instruction: `request ${n}`, now: `2026-10-0${n}T10:00:00.000Z` });
      expect(result.changed).toBe(true);
      current = result.plan;
    }
    expect(current.history).toHaveLength(m.MAX_PLAN_HISTORY);
    expect(current.history[0]).toMatchObject({ instruction: "request 7", summary: "change 7", at: "2026-10-07T10:00:00.000Z" });
    expect(current.history[0].items).toHaveLength(5);
    expect(current.history[4].instruction).toBe("request 3");
  });

  it("does not add a version when nothing changed", () => {
    const p = plan();
    const result = run(p, { steps: keepAll(p) });
    expect(result.changed).toBe(false);
    expect(result.plan.history).toBeUndefined();
    expect(result.summary).toBe("Nothing needed to change.");
  });

  it("restores an earlier version but keeps what happened since: finished steps, built material, imposed deadlines", () => {
    const imposed = { id: "dl-hand", title: "Hand-in", date: "2026-10-20", kind: "hand_in", setBy: { kind: "sender" } };
    const before = plan();
    const updated = run(before, { steps: [...keepAll(before, { plan2: { change: "moved", dueDate: "2026-10-18" }, mine: { change: "removed" } }), step("", { change: "added", title: "Mock exam", dueDate: "2026-10-30", generate: "quiz" })] }, { instruction: "add a mock exam" }).plan;
    // afterwards: the new step is built and ticked off, plan1 got its resource, a teacher added a deadline
    const mock = updated.items.find((i: any) => i.title === "Mock exam");
    const later = {
      ...updated,
      deadlines: [...updated.deadlines, imposed],
      items: updated.items.map((i: any) => (i.id === mock.id ? { ...i, resourceId: "res-mock", generate: "", doneAt: "2026-10-06T09:00:00.000Z" } : i.id === "plan1" ? { ...i, resourceId: "res-plan1", generate: "" } : i))
    };
    const restored = m.restorePlanVersion(later, later.history[0].id, { at: "2026-10-07T00:00:00.000Z" });
    // back to the plan before: "mine" is back, plan2 is back on its old date
    expect(restored.items.find((i: any) => i.id === "mine")).toBeTruthy();
    expect(restored.items.find((i: any) => i.id === "plan2").dueDate).toBe("2026-10-20");
    // but the step finished since is still there and still finished, and built material stays linked
    expect(restored.items.find((i: any) => i.id === mock.id)).toMatchObject({ doneAt: "2026-10-06T09:00:00.000Z", resourceId: "res-mock" });
    expect(restored.items.find((i: any) => i.id === "plan1")).toMatchObject({ resourceId: "res-plan1", generate: "" });
    expect(restored.items.find((i: any) => i.id === "done1").doneAt).toBeTruthy();
    expect(restored.deadlines.find((d: any) => d.id === "dl-hand")).toEqual(imposed);
    // the version being left is itself a version: restoring can be undone
    expect(restored.history[0].instruction).toMatch(/^Restored/);
    expect(restored.history.find((v: any) => v.id === later.history[0].id)).toBeUndefined();
    expect(m.restorePlanVersion(later, "unknown")).toBe(later);
  });
});

describe("coverage and wording", () => {
  it("warns when an update leaves concepts without an activity that tests them", () => {
    const p = plan({ items: [item("t1", { title: "Quiz A", generate: "quiz", concepts: ["Osmosis"] }), item("t2", { title: "Quiz B", generate: "quiz", concepts: ["Mitosis"] })] });
    const result = run(p, { steps: keepAll(p, { t2: { change: "removed" } }) }, { doneIds: new Set(), conceptMap: [{ name: "Osmosis" }, { name: "Mitosis" }] });
    expect(result.coverage).toEqual({ total: 2, untested: 1, untestedBefore: 0 });
  });

  it("describes the counts when the model gives no summary", () => {
    expect(m.describeCounts({ moved: 3, added: 2, removed: 1, edited: 0 })).toBe("Moved 3 steps, added 2 steps and removed 1 step.");
    expect(m.describeCounts({ moved: 0, added: 0, removed: 0, edited: 0 }, [{ id: "d" }])).toBe("Moved 1 deadline.");
    expect(m.describeCounts({ moved: 0, added: 0, removed: 0, edited: 0 })).toBe("Nothing needed to change.");
  });

  it("remembers the pace the learner chose", () => {
    const p = plan();
    expect(run(p, { steps: keepAll(p, { plan2: { change: "moved", dueDate: "2026-10-18" } }) }, { minutesPerWeek: 60 }).plan.minutesPerWeek).toBe(60);
    expect(m.currentPace(plan({ minutesPerWeek: 90 }), TODAY)).toBe(90);
  });
});

describe("POST /api/plans/update", () => {
  const call = async (body: any, env: Record<string, string | undefined> = { OPENAI_API_KEY: "sk-test" }) => {
    const { POST } = await import("../../app/api/plans/update/route.js");
    const saved: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries({ OPENAI_API_KEY: undefined, LUNA_PLAN_MODEL: undefined, ...env })) { saved[key] = process.env[key]; if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    try { return await POST(new Request("http://localhost/api/plans/update", { method: "POST", body: JSON.stringify(body) })); } finally {
      for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  };
  const body = { instruction: "lighter workload", today: TODAY, horizon: "2026-11-02", minutesPerWeek: 90, kinds: ["quiz"], steps: [{ id: "a", title: "Quiz", kind: "activity", dueDate: "2026-10-12", minutes: 30, generate: "quiz", built: false, done: false, concepts: [] }], deadlines: [{ id: "d", title: "Exam", date: "2026-11-02", locked: true }] };

  it("needs words, a deadline and a model", async () => {
    expect((await call({ ...body, instruction: " " })).status).toBe(400);
    expect((await call({ ...body, horizon: "" })).status).toBe(400);
    expect((await call(body, {})).status).toBe(500);
  });

  it("asks Luna 3 Pro at least, with the strict schema, and returns the model's update", async () => {
    const original = globalThis.fetch;
    let sent: any = null;
    globalThis.fetch = (async (url: string, init: any) => {
      sent = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ model: "gpt-4o", usage: { total_tokens: 10 }, choices: [{ message: { content: JSON.stringify({ summary: "ok", steps: [], deadlineChanges: [], newGoals: [] }) } }] }), { status: 200 });
    }) as any;
    try {
      const response = await call(body, { OPENAI_API_KEY: "sk-test", LUNA_PLAN_MODEL: "gpt-4o-mini" });
      expect(response.status).toBe(200);
      expect((await response.json()).update.summary).toBe("ok");
    } finally { globalThis.fetch = original; }
    expect(sent.url).toContain("chat/completions");
    expect(sent.body.model).toBe("gpt-4o");
    expect(sent.body.response_format.json_schema.strict).toBe(true);
    expect(sent.body.response_format.json_schema.schema.properties.steps.items.properties.generate.enum).toEqual(["", "quiz"]);
    expect(sent.body.messages[0].content).toContain("locked=true");
    expect(sent.body.messages[1].content).toContain("lighter workload");
    expect(sent.body.messages[1].content).toContain("(locked: set by someone else)");
  });
});
