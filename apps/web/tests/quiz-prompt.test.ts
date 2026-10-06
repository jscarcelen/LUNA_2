import { describe, expect, it } from "vitest";
import { QUIZ_AGENT } from "../modules/ai-tools/tools/quiz-generator/quizAgent.js";
import { createQuizSpec } from "../modules/agent-studio/engine/model";

describe("the quiz generator's prompt", () => {
  const text = QUIZ_AGENT.instructions;
  it("asks for one checkable answer per question and bans broad open questions", () => {
    expect(text).toMatch(/ONE clear, checkable answer/);
    expect(text).toMatch(/SPECIFIC, NEVER BROAD/);
    expect(text).toMatch(/'Explain…'/);
    expect(text).toMatch(/too broad: narrow it/);
  });
  it("sets rules for multiple choice, true/false, calculations and difficulty", () => {
    for (const rule of ["MULTIPLE CHOICE", "avoid negative stems", "TRUE/FALSE", "CALCULATIONS", "DIFFICULTY"]) expect(text).toContain(rule);
  });
  it("is the same prompt the Agent Studio quiz spec uses", () => {
    expect(createQuizSpec().instructions.core).toBe(text);
  });
});
