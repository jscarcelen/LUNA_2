import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { ensureAgentUse } from "../../modules/plans/agentUse.js";

const ctx = { today: "2026-10-14", deadline: "2026-11-14", materials: [{ id: "d1", kind: "material", name: "Notes" }], concepts: ["Returns", "Risk"] };
const agents = [
  { id: "quiz", makes: ["quiz", "exam", "worksheet"] },
  { id: "summary", makes: ["summary"] },
  { id: "math", makes: ["math"] },
  { id: "reading-splitter", makes: ["reading"] }
];
const step = (extra: object) => ({ title: "x", kind: "activity", dueDate: "2026-10-20", minutes: 30, sourceId: "d1", generate: "", goal: "", concepts: [], ...extra });

describe("ensureAgentUse", () => {
  it("adds a step for every chosen agent the planner left out, inside the window and before the review days", () => {
    const { items, added } = ensureAgentUse([step({ generate: "quiz" }), step({ kind: "exam", generate: "exam", dueDate: "2026-11-14" })], agents, ctx);
    expect(added.sort()).toEqual(["math", "reading", "summary"]);
    for (const item of items as any[]) { expect(item.dueDate >= ctx.today && item.dueDate <= ctx.deadline).toBe(true); }
    const math: any = (items as any[]).find((item: any) => item.generate === "math");
    expect(math!.dueDate < "2026-11-07").toBe(true);
  });
  it("turns read steps of uploaded documents into reading parts, but leaves generated resources alone", () => {
    const { items, converted } = ensureAgentUse([step({ kind: "read", title: "Read: all" }), step({ kind: "read", sourceId: "r1" })], [{ id: "reading-splitter", makes: ["reading"] }], { ...ctx, materials: [...ctx.materials, { id: "r1", kind: "generated resource", name: "Sum" }] });
    expect(converted).toBe(1);
    expect(items.filter((item: any) => item.generate === "reading")).toHaveLength(1);
  });
  it("adds nothing when every agent is already used", () => {
    const { added } = ensureAgentUse([step({ generate: "quiz" }), step({ generate: "summary" }), step({ generate: "math" }), step({ kind: "read", generate: "reading" })], agents, ctx);
    expect(added).toEqual([]);
  });
});
