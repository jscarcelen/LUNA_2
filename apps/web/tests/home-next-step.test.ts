import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { firstRunChecklist, homeShortcuts, nextBestAction as nextBestActionJs } from "../modules/dashboard/home.js";

// The JS defaults infer narrow types; these tests check behaviour.
const nextBestAction = nextBestActionJs as (input?: any) => any;

describe("Home next step", () => {
  it("prefers the most urgent plan step", () => {
    const step = { title: "Read chapter 2", planName: "Biology", days: 1 };
    expect(nextBestAction({ steps: [step, { title: "x", days: 5 }], hasMaterial: true, hasPlans: true })).toMatchObject({ kind: "step", detail: "Biology · due tomorrow", cta: "Start" });
    expect(nextBestAction({ steps: [{ title: "a", planName: "P", days: -2 }] }).detail).toBe("P · late");
  });
  it("walks a new person through upload, plan, practise", () => {
    expect(nextBestAction({}).kind).toBe("upload");
    expect(nextBestAction({ hasMaterial: true }).kind).toBe("plan");
    expect(nextBestAction({ hasMaterial: true, hasPlans: true }).kind).toBe("practise");
    expect(nextBestAction({ role: "parent" }).kind).toBe("review");
  });
  it("lists first steps until all three are done", () => {
    expect(firstRunChecklist({ hasMaterial: true })?.map((item: any) => item.done)).toEqual([true, false, false]);
    expect(firstRunChecklist({ hasMaterial: true, hasPlans: true, hasEvidence: true })).toBeNull();
  });
  it("gives three shortcuts per role", () => {
    expect(homeShortcuts("student")).toHaveLength(3);
    expect(homeShortcuts("teacher", true).map((item: any) => item.target)).toEqual(["workspaces", "create", "students"]);
    expect(homeShortcuts("parent", false)).toHaveLength(2);
  });
});
