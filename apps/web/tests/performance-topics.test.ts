import { describe, expect, it } from "vitest";
import { VIEW_VERSION, defaultView, readViews } from "../modules/performance/views.js";

describe("performance default view", () => {
  it("shows where things stand, Luna's read, topic by topic and why answers are wrong — all full width, in that order", () => {
    const view = defaultView("student");
    expect(view.panels.map((panel: { id: string }) => panel.id)).toEqual(["headline", "coach", "mastery-map", "error-breakdown"]);
    expect(view.panels.every((panel: { size: string }) => panel.size === "full")).toBe(true);
    expect(view.panels.some((panel: { id: string }) => ["mastery-trend", "plan-progress"].includes(panel.id))).toBe(false);
  });
  it("replaces an older saved copy of the built-in view with the new one", () => {
    const store: Record<string, string> = {};
    Object.assign(globalThis, { window: { localStorage: { getItem: (key: string) => store[key] ?? null, setItem: (key: string, value: string) => { store[key] = value; } } } });
    store["luna.performance.views.student"] = JSON.stringify([{ id: "default_student", version: 1, name: "Old", panels: [{ id: "mastery-trend", visible: true }] }, { id: "mine", version: 1, name: "Mine", panels: [{ id: "headline", visible: true }] }]);
    const views = readViews("student");
    expect(views[0].version).toBe(VIEW_VERSION);
    expect(views[0].name).toBe("How I am doing");
    expect(views.map((entry: { id: string }) => entry.id)).toContain("mine");
    delete (globalThis as { window?: unknown }).window;
  });
});
