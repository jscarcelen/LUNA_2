import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { isPageAllowed, navFor, sectionOf, tabKeyOf, tabsFor } from "../components/navModel.js";

describe("navigation model", () => {
  it("gives every role at most four sections, and parents no Create", () => {
    expect(navFor("student").map((item: any) => item.label)).toEqual(["Home", "Study", "Progress", "Create"]);
    expect(navFor("teacher")[0].label).toBe("Classes");
    expect(navFor("parent").map((item: any) => item.section)).toEqual(["dashboard", "study", "progress"]);
  });
  it("places every old page key in a section, so old links keep working", () => {
    const expected: Record<string, string> = {
      dashboard: "dashboard", workspaces: "study", "workspaces?doc=1": "study", plans: "study", "plans?open=2": "study", activities: "study",
      performance: "progress", students: "progress", create: "create", "ai-tools": "create", "ai-tool:quiz-generator": "create",
      "custom-agent:x?resource=1": "create", "agent-edit:9": "create", templates: "create", "templates?open=3": "create", marketplace: "create", builder: "create", revenue: "create", connections: ""
    };
    for (const [page, section] of Object.entries(expected)) expect(sectionOf(page), page).toBe(section);
  });
  it("has tab bars only where there is something to choose", () => {
    expect(tabsFor("study").map((tab: any) => tab.key)).toEqual(["workspaces", "plans", "activities"]);
    expect(tabsFor("progress", "student", true)).toHaveLength(1);
    expect(tabsFor("progress", "teacher", true).map((tab: any) => tab.key)).toEqual(["performance", "students"]);
    expect(tabsFor("progress", "teacher", false)).toHaveLength(1);
    expect(tabsFor("create", "student").map((tab: any) => tab.key)).toEqual(["create", "marketplace"]);
    expect(tabsFor("create", "teacher").map((tab: any) => tab.key)).toEqual(["create", "templates", "marketplace"]);
  });
  it("maps a page to its tab", () => {
    expect(tabKeyOf("ai-tool:quiz-generator")).toBe("create");
    expect(tabKeyOf("plans?open=1")).toBe("plans");
  });
  it("only allows pages the role and account can open", () => {
    expect(isPageAllowed("connections", "student", true)).toBe(true);
    expect(isPageAllowed("connections", "student", false)).toBe(false);
    expect(isPageAllowed("students", "student", true)).toBe(false);
    expect(isPageAllowed("students", "parent", true)).toBe(true);
    expect(isPageAllowed("create", "parent", true)).toBe(false);
  });
});
