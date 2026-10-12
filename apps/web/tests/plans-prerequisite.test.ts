import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { insertPrerequisite } from "../modules/plans/prerequisite.js";

const insert = insertPrerequisite as (plan: any, item: any, options?: any) => any;
const plan = () => ({ name: "Micro exam", items: [
  { id: "a", title: "Read chapter 1", dueDate: "2026-10-14", doneAt: "2026-10-13" },
  { id: "b", title: "Price elasticity quiz", dueDate: "2026-10-20", doneAt: "" },
  { id: "c", title: "Costs quiz", dueDate: "2026-10-25", doneAt: "" }
] });

describe("a refresher goes into the plan before the step it prepares", () => {
  it("lands the day before the step about the topic, just ahead of it in the list", () => {
    const out = insert(plan(), { resourceId: "r1", title: "Refresh: Derivatives", topic: "Price elasticity", skillLabel: "Derivatives" }, { today: "2026-10-15" });
    expect(out.before).toBe("Price elasticity quiz");
    expect(out.step.dueDate).toBe("2026-10-19");
    expect(out.plan.items.map((item: any) => item.title)).toEqual(["Read chapter 1", "Refresh: Derivatives", "Price elasticity quiz", "Costs quiz"]);
    expect(out.step.note).toContain("Do it before “Price elasticity quiz”");
  });
  it("is never due in the past when the step it prepares is due today or already late", () => {
    const late = plan();
    late.items[1].dueDate = "2026-10-10";
    expect(insert(late, { title: "R", topic: "elasticity" }, { today: "2026-10-15" }).step.dueDate).toBe("2026-10-15");
  });
  it("falls back to the earliest unfinished step when no title mentions the topic, and appends to a plan with nothing open", () => {
    expect(insert(plan(), { title: "R", topic: "Unknown" }, { today: "2026-10-15" }).before).toBe("Price elasticity quiz");
    const finished = { items: [{ id: "x", title: "Done", doneAt: "2026-10-01" }] };
    const out = insert(finished, { title: "R" }, { today: "2026-10-15" });
    expect(out.before).toBe("");
    expect(out.plan.items.at(-1).title).toBe("R");
  });
});
