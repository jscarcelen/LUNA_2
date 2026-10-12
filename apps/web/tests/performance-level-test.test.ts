import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { isLevelTest, latestLevelReports, levelReport } from "../modules/performance/levelTest.js";
// @ts-ignore
import { LEVEL_AGENT } from "../modules/ai-tools/tools/level-test/levelAgent.js";

const a = (topic: string, correct: boolean, skills: string[] = []) => ({ id: Math.random().toString(36), kind: "text", prompt: "q", topic, skills, correct, given: "", expected: "" });
const attempt = (results: any[], extra: any = {}) => ({ activityId: "act", activityTitle: "Spanish A2 · Level test", at: "2026-10-12T09:00:00Z", agentName: "Level Test", resourceId: "doc1", resourceName: "Spanish A2 · Level test", results, ...extra });

describe("the level test", () => {
  it("is a built-in agent that asks about foundations and groups questions by component", () => {
    expect(LEVEL_AGENT.name).toBe("Level Test");
    expect(LEVEL_AGENT.instructions).toMatch(/FOUNDATIONS/);
    expect(LEVEL_AGENT.instructions).toMatch(/negatives/);
    expect(LEVEL_AGENT.instructions).toMatch(/background facts/);
    expect(LEVEL_AGENT.template.fields.map((f: any) => f.name)).toEqual(expect.arrayContaining(["topic", "level", "requires_skills"]));
  });
  it("reads each foundation as solid, review or start, in the order asked, and starts at the first that is not solid", () => {
    const report: any = levelReport(attempt([
      ...Array.from({ length: 3 }, () => a("Vocabulary", true)),
      ...Array.from({ length: 4 }, (_, i) => a("Negatives", i < 2, ["negatives"])),   // 50%: review
      ...Array.from({ length: 3 }, (_, i) => a("Questions", i === 0, ["question-forms"])), // 33%: start
      ...Array.from({ length: 3 }, () => a("Tenses", true))                             // solid again, but later
    ]));
    expect(report.components.map((c: any) => [c.name, c.status])).toEqual([["Vocabulary", "strong"], ["Negatives", "review"], ["Questions", "start"], ["Tenses", "strong"]]);
    expect(report.startAt.name).toBe("Negatives");
    expect(report.summary).toBe("2 of 4 foundations are solid. Review negatives before moving on.");
    expect(report.components[2].skill).toBe("question-forms");
    expect(report.ready).toBe(false);
  });
  it("says the learner is ready when every foundation is solid", () => {
    const report = levelReport(attempt(Array.from({ length: 6 }, (_, i) => a(i < 3 ? "Background" : "Key terms", true))));
    expect(report.ready).toBe(true);
    expect(report.summary).toMatch(/you can start the material/);
  });
  it("keeps only the newest level test of each document and ignores other attempts", () => {
    const old = attempt([a("X", false), a("X", false)], { at: "2026-10-01T09:00:00Z" });
    const fresh = attempt([a("X", true), a("X", true)], { at: "2026-10-10T09:00:00Z" });
    const quiz = { ...attempt([a("Y", false)]), agentName: "Quiz Generator", activityTitle: "Quiz", resourceName: "Quiz", resourceId: "doc2" };
    const reports = latestLevelReports([old, fresh, quiz]);
    expect(reports).toHaveLength(1);
    expect(reports[0].accuracy).toBe(1);
    expect(isLevelTest(quiz)).toBe(false);
  });
});
