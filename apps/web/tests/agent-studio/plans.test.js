import { describe, expect, it } from "vitest";
import { buildPlan, calendarDays, newDeadline, newGoal, newItem, nextDeadline, planProgress, upcoming, withSubPlans } from "../../modules/plans/plan";
import { conceptIndex, conceptKey } from "../../modules/resources/concepts";

const iso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

describe("study plans", () => {
  it("counts a step as done when its resource has an attempt, and never otherwise", () => {
    const plan = buildPlan({
      name: "Maths",
      items: [
        newItem({ resourceId: "r1", title: "Quiz 1", dueDate: iso(-2) }),
        newItem({ resourceId: "", title: "Read chapter 3", dueDate: iso(1) }),
        newItem({ resourceId: "r2", title: "Quiz 2", dueDate: iso(3) })
      ]
    });
    // An attempt with no resource must not tick anything off.
    const attempts = [{ resourceId: "r1", score: 8, total: 10 }, { resourceId: "", score: 2, total: 2 }];
    const progress = planProgress(plan, attempts);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(3);
    expect(Math.round(progress.average * 100)).toBe(80);
    expect(progress.next.map((item) => item.title)).toEqual(["Read chapter 3", "Quiz 2"]);
  });

  it("keeps several deadlines and reports the next one that has not passed", () => {
    const plan = buildPlan({ name: "Term", deadlines: [newDeadline("Mock", iso(-3), "mock"), newDeadline("Final", iso(20), "exam")] });
    expect(nextDeadline(plan).title).toBe("Final");
  });

  it("rolls sub-plans into their parent", () => {
    const parent = { ...buildPlan({ name: "Maths final", items: [newItem({ resourceId: "a", title: "Past paper" })] }), documentId: "p" };
    const children = [
      { document: { id: "c1" }, plan: { ...buildPlan({ name: "Equations", parentPlanId: "p", items: [newItem({ resourceId: "b", title: "Quiz" })] }), documentId: "c1" } },
      { document: { id: "c2" }, plan: { ...buildPlan({ name: "Integration", parentPlanId: "p", items: [newItem({ resourceId: "c", title: "Drill" }), newItem({ resourceId: "d", title: "Test" })] }), documentId: "c2" } }
    ];
    const whole = withSubPlans(parent, children);
    expect(whole.items).toHaveLength(4);
    expect(whole.children).toHaveLength(2);
    expect(planProgress(whole, [{ resourceId: "b", score: 1, total: 1 }]).done).toBe(1);
  });

  it("links a goal to the resources that teach its concepts", () => {
    const goal = { ...newGoal("Master variance"), concepts: ["variance"], resourceIds: ["r1", "r2"] };
    const plan = buildPlan({ name: "Stats", goals: [goal], items: [newItem({ resourceId: "r1", title: "Quiz" }), newItem({ resourceId: "r2", title: "Drill" }), newItem({ resourceId: "r9", title: "Unrelated" })] });
    const [progress] = planProgress(plan, [{ resourceId: "r1", score: 9, total: 10 }]).goals;
    expect(progress.total).toBe(2);
    expect(progress.done).toBe(1);
    expect(progress.reached).toBe(1);
  });

  it("puts every plan on one calendar and adds up each day's minutes", () => {
    const rows = [
      { document: { id: "p1" }, plan: buildPlan({ name: "A", colour: "#111", items: [newItem({ resourceId: "r1", title: "Quiz", dueDate: iso(1), minutes: 45 })] }) },
      { document: { id: "p2" }, plan: buildPlan({ name: "B", colour: "#222", items: [newItem({ resourceId: "r2", title: "Read", dueDate: iso(1), minutes: 90 })], deadlines: [newDeadline("Exam", iso(6), "exam")] }) }
    ];
    const days = calendarDays(rows, { days: 21 });
    const busy = days.find((day) => day.date === iso(1));
    expect(busy.entries).toHaveLength(2);
    expect(busy.minutes).toBe(135);
    const examDay = days.find((day) => day.date === iso(6));
    expect(examDay.entries[0].kind).toBe("deadline");
  });

  it("lists what is due now across plans, late first", () => {
    const rows = [
      { document: { id: "p1" }, plan: buildPlan({ name: "A", items: [newItem({ resourceId: "r1", title: "Late one", dueDate: iso(-1) })] }) },
      { document: { id: "p2" }, plan: buildPlan({ name: "B", items: [newItem({ resourceId: "r2", title: "Tomorrow", dueDate: iso(1) })] }) }
    ];
    const list = upcoming(rows, []);
    expect(list.map((entry) => entry.title)).toEqual(["Late one", "Tomorrow"]);
  });
});

describe("concepts", () => {
  it("treats the same concept written differently as one", () => {
    expect(conceptKey("Quadratic Equations")).toBe(conceptKey("quadratic equation"));
  });

  it("indexes which resources teach each concept", () => {
    const rows = [
      { document: { id: "r1" }, resource: { name: "Quiz", concepts: [{ id: "c1", name: "Variance" }, { id: "c2", name: "Mean" }] } },
      { document: { id: "r2" }, resource: { name: "Drill", concepts: [{ id: "c3", name: "variances" }] } }
    ];
    const index = conceptIndex(rows);
    expect(index[0].resources).toHaveLength(2);
    expect(index.map((entry) => entry.name)).toContain("Mean");
  });
});

describe("plan folders", () => {
  it("creates Study plans / <plan> / {Reference material, Generated resources} once", async () => {
    const { ensurePlanFolders } = await import("../../modules/plans/folders");
    const folders = [];
    let next = 0;
    const onCreateFolder = async (name, parentFolderId) => { const folder = { id: `f${(next += 1)}`, name, parentFolderId }; folders.push(folder); return folder; };
    const first = await ensurePlanFolders("Maths final", { folders, subjectId: "s1", onCreateFolder });
    expect(folders.map((folder) => folder.name)).toEqual(["Study plans", "Maths final", "Reference material", "Generated resources"]);
    // Asked again, it reuses what is there instead of making a second set.
    const again = await ensurePlanFolders("Maths final", { folders, subjectId: "s1", onCreateFolder });
    expect(folders).toHaveLength(4);
    expect(again.generatedId).toBe(first.generatedId);
  });

  it("links material into the plan's folder without copying the document", async () => {
    const { linkMaterial } = await import("../../modules/plans/folders");
    const documents = [{ id: "d1", name: "Notes.pdf", folderIds: ["raw"], tags: [] }];
    const updates = [];
    const linked = await linkMaterial(["d1"], "material", { documents, onUpdateDocumentMeta: async (id, payload) => updates.push({ id, payload }) });
    expect(linked).toBe(1);
    expect(updates[0].payload.folderIds).toEqual(["raw", "material"]);
    // Nothing was created — the same document is simply filed in both places.
    expect(documents).toHaveLength(1);
  });
});
