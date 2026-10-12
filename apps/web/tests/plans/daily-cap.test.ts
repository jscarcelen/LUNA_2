import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { capDailyMinutes as capDailyMinutesJs, normaliseMaxPerDay } from "../../modules/plans/dailyCap.js";

// The JS module's inferred types are too narrow for these fixtures; the tests check behaviour, not types.
const capDailyMinutes = capDailyMinutesJs as (items: any[], options: any) => any;

const total = (items: any[], date: string) => items.filter((item) => item.dueDate === date).reduce((sum, item) => sum + item.minutes, 0);

describe("capDailyMinutes", () => {
  const options = { maxPerDay: 120, today: "2026-10-12", horizon: "2026-10-20" };

  it("moves what does not fit to the nearest day with room, so no day exceeds the budget", () => {
    const items = [
      { id: "a", dueDate: "2026-10-13", minutes: 60, kind: "read" },
      { id: "b", dueDate: "2026-10-13", minutes: 60, kind: "activity" },
      { id: "c", dueDate: "2026-10-13", minutes: 60, kind: "activity" },
      { id: "d", dueDate: "2026-10-14", minutes: 45, kind: "review" }
    ];
    const result = capDailyMinutes(items, options);
    expect(result.moved).toBe(1);
    expect(result.overloadedDays).toEqual([]);
    for (const date of ["2026-10-13", "2026-10-14"]) expect(total(result.items, date)).toBeLessThanOrEqual(120);
    expect(result.items.map((item: any) => item.id)).toEqual(["a", "b", "c", "d"]); // same order
  });

  it("never moves a finished step or the practice exam, and keeps every date inside today..horizon", () => {
    const items = [
      { id: "done", dueDate: "2026-10-20", minutes: 90, kind: "read", doneAt: "2026-10-19" },
      { id: "exam", dueDate: "2026-10-20", minutes: 90, kind: "exam" },
      { id: "late", dueDate: "2026-10-20", minutes: 30, kind: "review" }
    ];
    const result = capDailyMinutes(items, options);
    expect(result.items.find((item: any) => item.id === "exam").dueDate).toBe("2026-10-20");
    expect(result.items.find((item: any) => item.id === "done").dueDate).toBe("2026-10-20");
    const moved = result.items.find((item: any) => item.id === "late");
    expect(moved.dueDate >= options.today && moved.dueDate <= options.horizon).toBe(true);
    expect(moved.dueDate).not.toBe("2026-10-20");
  });

  it("shortens a single step longer than the whole day", () => {
    const result = capDailyMinutes([{ id: "x", dueDate: "2026-10-13", minutes: 200, kind: "activity" }], options);
    expect(result.items[0].minutes).toBe(120);
    expect(result.clamped).toBe(1);
  });

  it("reports a day it cannot fix instead of hiding it", () => {
    const tight = { maxPerDay: 60, today: "2026-10-12", horizon: "2026-10-12" };
    const result = capDailyMinutes([{ id: "a", dueDate: "2026-10-12", minutes: 60, kind: "read" }, { id: "b", dueDate: "2026-10-12", minutes: 60, kind: "read" }], tight);
    expect(result.overloadedDays).toEqual(["2026-10-12"]);
  });
});

describe("normaliseMaxPerDay", () => {
  it("falls back to 90 and clamps to 30..480", () => {
    expect(normaliseMaxPerDay(undefined)).toBe(90);
    expect(normaliseMaxPerDay(5)).toBe(30);
    expect(normaliseMaxPerDay(9999)).toBe(480);
    expect(normaliseMaxPerDay(150)).toBe(150);
  });
});
