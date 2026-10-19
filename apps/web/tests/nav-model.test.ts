import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS module
import { isPageAllowed, landingOf, navFor, sectionOf, shortTitleOf, tabKeyOf, tabsFor, titleOf } from "../components/navModel.js";

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
    expect(tabsFor("progress", "teacher", true).map((tab: any) => tab.key)).toEqual(["students", "performance"]);
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
  it("names the page in the top bar, with a short phone title that does not cut", () => {
    expect(titleOf("dashboard", "teacher")).toBe("Classes");
    expect(titleOf("dashboard", "student")).toBe("Home");
    expect(titleOf("students", "parent")).toBe("My children");
    expect(titleOf("students", "teacher")).toBe("My students");
    expect(titleOf("ai-tool:quiz-generator", "student", "Quiz generator")).toBe("Quiz generator");
    expect(shortTitleOf("students", "teacher")).toBe("Students");
    expect(shortTitleOf("create", "student")).toBe("Make");
    expect(shortTitleOf("ai-tool:quiz-generator?docs=1", "student")).toBe("Make");
    expect(shortTitleOf("plans?open=3", "student")).toBe("Study");
    expect(shortTitleOf("dashboard", "parent")).toBe("Children");
  });
  it("keeps every short title at most 10 characters", () => {
    for (const page of ["dashboard", "workspaces", "plans", "activities", "performance", "create", "templates", "marketplace", "builder", "revenue", "connections", "students"]) {
      expect(shortTitleOf(page, "teacher").length, page).toBeLessThanOrEqual(10);
    }
  });
  it("opens Progress on the people a teacher or parent follows, only with an account", () => {
    expect(landingOf("progress", "teacher", true)).toBe("students");
    expect(landingOf("progress", "parent", true)).toBe("students");
    expect(landingOf("progress", "student", true)).toBe("performance");
    expect(landingOf("progress", "teacher", false)).toBe("performance");
    expect(navFor("teacher", true).find((item: any) => item.section === "progress").key).toBe("students");
    expect(navFor("student", true).find((item: any) => item.section === "progress").key).toBe("performance");
    expect(navFor("teacher")[0].key).toBe("dashboard");
  });
});
