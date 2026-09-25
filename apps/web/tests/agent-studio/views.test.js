import { describe, expect, it } from "vitest";
import { blankView, defaultView, exportView, importView, movePanel, reorderPanels, setPanelMode, togglePanel, visiblePanels } from "../../modules/performance/views";
import { coverageOf, targetsFor } from "../../modules/performance/targets";

describe("performance views", () => {
  it("starts from a curated arrangement per profile", () => {
    const student = defaultView("student");
    const teacher = defaultView("teacher");
    expect(visiblePanels(student).map((panel) => panel.id)).toContain("mastery-map");
    expect(visiblePanels(teacher).map((panel) => panel.id)).toContain("class-heatmap");
    // Curated means small: the screen must not open with everything Luna knows.
    expect(visiblePanels(student).length).toBeLessThanOrEqual(8);
  });

  it("hides, adds, reorders and re-reads panels", () => {
    let view = defaultView("student");
    const first = view.panels[0].id;
    view = togglePanel(view, first);
    expect(visiblePanels(view).some((panel) => panel.id === first)).toBe(false);
    view = togglePanel(view, "stuck");
    expect(view.panels.some((panel) => panel.id === "stuck" && panel.visible)).toBe(true);
    const second = view.panels[1].id;
    view = movePanel(view, second, -1);
    expect(view.panels[0].id).toBe(second);
    view = reorderPanels(view, "stuck", view.panels[0].id);
    expect(view.panels[0].id).toBe("stuck");
    view = setPanelMode(view, "stuck", "detail");
    expect(view.panels.find((panel) => panel.id === "stuck").mode).toBe("detail");
  });

  it("travels as an arrangement and never as results", () => {
    const spec = exportView(blankView("teacher", "Parent evening"));
    expect(JSON.stringify(spec)).not.toMatch(/evidence|mastery|learner/);
    const loaded = importView(JSON.stringify(spec), "parent");
    expect(loaded.name).toBe("Parent evening");
    expect(loaded.role).toBe("parent");
    expect(() => importView({ kind: "template" })).toThrow();
  });
});

describe("what the dashboard tracks", () => {
  const plans = [{
    plan: {
      name: "Biology mid-term",
      goals: [{ id: "g1", title: "Cell division", resourceIds: ["r1"] }, { id: "g2", title: "Genetics", resourceIds: [] }],
      items: [{ id: "i1", resourceId: "r2", goalId: "g2" }, { id: "i2", resourceId: "r3", goalId: "" }],
      materialIds: []
    }
  }];

  it("makes the plans the subjects and their goals the topics", () => {
    const { subjectOf, conceptsOf } = targetsFor("plan", { plans });
    expect(subjectOf({ resourceId: "r1" })).toBe("Biology mid-term");
    expect(conceptsOf({ resourceId: "r1" })).toEqual(["Cell division"]);
    expect(conceptsOf({ resourceId: "r2" })).toEqual(["Genetics"]);
    expect(subjectOf({ resourceId: "unknown" })).toBe("Outside any plan");
  });

  it("falls back to what a resource says it teaches, and reports its own coverage", () => {
    const conceptsOfResource = () => ["Photosynthesis"];
    const { subjectOf, conceptsOf } = targetsFor("plan", { plans, conceptsOfResource });
    expect(conceptsOf({ resourceId: "r3" })).toEqual(["Biology mid-term"]);
    expect(conceptsOf({ resourceId: "r9" })).toEqual(["Photosynthesis"]);
    const coverage = coverageOf([{ resourceId: "r1" }, { resourceId: "r9" }], subjectOf);
    expect(coverage).toEqual({ covered: 1, total: 2, share: 0.5 });
  });

  it("uses the folder a resource sits in when plans are not the target", () => {
    const { subjectOf } = targetsFor("folder", { folderSubjectOf: () => "Science", fallbackSubject: "Year 9" });
    expect(subjectOf({ resourceId: "r1" })).toBe("Science");
  });
});
