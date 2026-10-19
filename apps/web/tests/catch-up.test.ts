import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { doneThisWeek, lateTone, summariseCatchUp, weekHeadline } from "../modules/activities/catchUp.js";

const now = Date.parse("2026-10-19T12:00:00Z");

describe("catch-up summary", () => {
  it("counts only attempts from the last 7 days", () => {
    const attempts = [{ attempt: { at: "2026-10-18T10:00:00Z" } }, { at: "2026-10-13T10:00:00Z" }, { attempt: { at: "2026-10-01T10:00:00Z" } }, { attempt: {} }];
    expect(doneThisWeek(attempts, now)).toBe(2);
  });
  it("words the headline positively and stays silent at zero", () => {
    expect(weekHeadline(2)).toBe("2 quizzes done this week");
    expect(weekHeadline(1)).toBe("1 quiz done this week");
    expect(weekHeadline(0)).toBe("");
  });
  it("replaces many late badges by one calm message", () => {
    const rows = [{ done: false, due: "2026-10-01" }, { done: false, due: "2026-10-10" }, { done: false, due: "2026-10-12" }, { done: true, due: "2026-10-02" }, { done: false, due: "" }];
    const s = summariseCatchUp(rows, { attempts: [{ at: "2026-10-19T08:00:00Z" }], now });
    expect(s).toMatchObject({ waiting: 4, late: 3, doneThisWeek: 1, headline: "1 quiz done this week", catchUp: "3 things are waiting. Start with this one." });
  });
  it("has no catch-up message when nothing is late", () => {
    expect(summariseCatchUp([{ done: false, due: "2026-10-25" }], { now }).catchUp).toBe("");
  });
  it("keeps red only for the first late chip", () => {
    expect([0, 1, 2].map(lateTone)).toEqual(["red", "amber", "amber"]);
  });
});
