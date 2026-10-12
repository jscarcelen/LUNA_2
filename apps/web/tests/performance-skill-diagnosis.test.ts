import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { diagnoseSkills, diagnosisActions } from "../modules/performance/skillDiagnosis.js";
// @ts-ignore
import { inferSkills, normaliseSkillIds, refresherFor, skillsForQuestion, skillTaggingRule } from "../modules/skills/taxonomy.js";

const diagnose = diagnoseSkills as (attempts: any[]) => any;
const infer = inferSkills as (q: any) => string[];

const answer = (topic: string, skills: string[], correct: boolean) => ({ id: Math.random().toString(36), kind: "number", prompt: `${topic} question`, topic, skills, correct, given: "", expected: "" });
const attempt = (results: any[]) => ({ activityId: "a", activityTitle: "t", at: "2026-10-10T10:00:00Z", score: 0, total: results.length, results });

describe("the skills taxonomy", () => {
  it("normalises model tags, legacy tags and natural names; drops what it does not know", () => {
    expect(normaliseSkillIds(["Derivatives", "algebra and rearranging", "recall", "invented-thing", "derivatives"])).toEqual(["derivatives", "algebra"]);
    expect(normaliseSkillIds("integration; percentages")).toEqual(["integration", "percentages"]);
    expect(normaliseSkillIds(["calculation", "definition"])).toEqual(["arithmetic"]); // definition = topic knowledge, not a skill
  });
  it("infers the specific skill from the question, and nothing for a plain definition", () => {
    expect(infer({ prompt: "Differentiate f(x) = 3x^2 and find the marginal cost." })).toContain("derivatives");
    expect(infer({ prompt: "Differentiate f(x) = 3x^2" })).not.toContain("algebra");
    expect(infer({ prompt: "Compute \\int_0^2 x\\,dx" })).toEqual(["integration"]);
    expect(infer({ prompt: "In one sentence, what is opportunity cost?" })).toEqual(["writing"]);
    expect(skillsForQuestion({ prompt: "Which statement is NOT part of the balance sheet?", skills: [] })).toEqual(["logic"]);
  });
  it("declared tags win over inference", () => {
    expect(skillsForQuestion({ prompt: "Differentiate x^2", skills: ["matrices"] })).toEqual(["matrices"]);
  });
  it("builds the refresher with prerequisites in teaching order, and a prompt rule that lists the ids", () => {
    expect((refresherFor as any)("integration").prerequisites).toEqual(["Arithmetic and fractions", "Algebra and rearranging", "Functions and graphs", "Derivatives"]);
    expect((skillTaggingRule as any)()).toContain("derivatives (derivatives)");
  });
});

describe("topic or skill?", () => {
  it("calls it a SKILL problem when the weak topic's mistakes sit on one weak skill and the rest go fine", () => {
    const results = [
      ...Array.from({ length: 6 }, (_, i) => answer("Microeconomics", ["derivatives"], i === 0)),   // 1/6 right with derivatives
      ...Array.from({ length: 4 }, () => answer("Microeconomics", [], true)),                           // fine without
      ...Array.from({ length: 5 }, (_, i) => answer("Macroeconomics", ["derivatives"], i === 0)),
      ...Array.from({ length: 4 }, () => answer("Macroeconomics", [], true))
    ];
    const d = diagnose([attempt(results)]);
    expect(d.weakSkills.map((s: any) => s.id)).toEqual(["derivatives"]);
    const micro = d.topics.find((t: any) => t.topic === "Microeconomics");
    expect(micro.verdict).toBe("skill");
    expect(micro.skills).toEqual(["derivatives"]);
    expect(d.weakSkills[0].lifts.sort()).toEqual(["Macroeconomics", "Microeconomics"]);
    expect(d.headline).toMatch(/Derivatives is holding back 2 topics/);
    const actions = diagnosisActions(d);
    expect(actions[0]).toMatchObject({ kind: "skill-primer", skill: "derivatives" });
  });
  it("calls it a TOPIC problem when mistakes are spread whatever the skills", () => {
    const results = [
      ...Array.from({ length: 4 }, (_, i) => answer("Accounting", ["percentages"], i === 0)),
      ...Array.from({ length: 4 }, (_, i) => answer("Accounting", [], i === 0)),
      ...Array.from({ length: 6 }, () => answer("Economics", ["percentages"], true)),
      ...Array.from({ length: 4 }, () => answer("Economics", [], true))
    ];
    const d = diagnose([attempt(results)]);
    const accounting = d.topics.find((t: any) => t.topic === "Accounting");
    expect(accounting.verdict).toBe("topic");
    expect(diagnosisActions(d)[0]).toMatchObject({ kind: "reteach", topic: "Accounting" });
  });
  it("says BOTH when the questions that avoid the weak skill fail too", () => {
    const results = [
      ...Array.from({ length: 5 }, (_, i) => answer("Calculus", ["limits"], i === 0)),
      ...Array.from({ length: 4 }, (_, i) => answer("Calculus", [], i === 0)),
      ...Array.from({ length: 6 }, () => answer("Other", [], true))
    ];
    const calc = diagnose([attempt(results)]).topics.find((t: any) => t.topic === "Calculus");
    expect(calc.verdict).toBe("both");
  });
  it("says it is unclear with too few answers instead of guessing", () => {
    const d = diagnose([attempt([answer("Law", ["logic"], false), answer("Law", ["logic"], false)])]);
    expect(d.topics[0].verdict).toBe("unclear");
    expect(d.weakSkills).toEqual([]);
  });
  it("reads old attempts that carry no skills by inferring them from the question", () => {
    const old = (prompt: string, correct: boolean) => ({ id: "x", kind: "number", prompt, topic: "Micro", correct, given: "", expected: "" });
    const d = diagnose([attempt([...Array.from({ length: 5 }, (_, i) => old("Find the derivative of 2x^3", i === 0)), ...Array.from({ length: 4 }, () => old("Who wrote the report?", true))])]);
    expect(d.skills.find((s: any) => s.id === "derivatives").weak).toBe(true);
  });
});
