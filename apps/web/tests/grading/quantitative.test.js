import { describe, expect, it } from "vitest";
import { declaredQuantitative, isQuantitative, isNumericAnswer, numbersIn } from "../../modules/activities/quantitative.js";

describe("does solving it need maths?", () => {
  it("says yes for calculation questions", () => {
    expect(isQuantitative({ prompt: "Calculate the mean of 4, 8 and 12", expected: "8" })).toBe(true);
    expect(isQuantitative({ prompt: "What is 12 × 3?", expected: "36" })).toBe(true);
    expect(isQuantitative({ prompt: "Resuelve la ecuación", expected: "x = 4" })).toBe(true);
    expect(isQuantitative({ prompt: "Compute 24 + 18", expected: "42", kind: "choice" })).toBe(true);
    expect(isQuantitative({ prompt: "Anything", expected: "7", kind: "number" })).toBe(true);
  });

  it("follows the skill the agent marked", () => {
    expect(isQuantitative({ prompt: "Obtain the answer", expected: "the result", skill: "calculation" })).toBe(true);
    expect(isQuantitative({ prompt: "Obtain the answer", expected: "the result", skill: "Maths" })).toBe(true);
    expect(declaredQuantitative({ prompt: "x", expected: "y", skill: "statistics" })).toBe(true);
    // "analysis" and "problem solving" only count when numbers are involved.
    expect(isQuantitative({ prompt: "Analyse the trend in 2019 and 2020", expected: "it fell 4%", skill: "analysis" })).toBe(true);
    expect(isQuantitative({ prompt: "Analyse the narrator's tone", expected: "ironic and detached", skill: "analysis" })).toBe(false);
  });

  it("says yes when the expected answer is a number or a formula", () => {
    expect(isQuantitative({ prompt: "The result", expected: "3.5 m/s" })).toBe(true);
    expect(isQuantitative({ prompt: "State it", expected: "x = 5" })).toBe(true);
    expect(isQuantitative({ prompt: "State it", expected: "E = mc^2" })).toBe(true);
    expect(isQuantitative({ prompt: "Probability", answer: "3/4" })).toBe(true);
  });

  it("says no for definitions, differences, classification, theory and facts", () => {
    expect(isQuantitative({ prompt: "Which of the following is NOT a function of the cell membrane?", expected: "Producing ATP", skill: "concept" })).toBe(false);
    expect(isQuantitative({ prompt: "What is the difference between mitosis and meiosis?", expected: "Mitosis makes identical cells; meiosis makes gametes." })).toBe(false);
    expect(isQuantitative({ prompt: "Classify the sentence", expected: "A subordinate clause" })).toBe(false);
    expect(isQuantitative({ prompt: "Define osmosis", expected: "Movement of water across a membrane", kind: "text" })).toBe(false);
    expect(isQuantitative({ prompt: "What is the chemical formula of water?", expected: "H2O" })).toBe(false);
    expect(isQuantitative({ prompt: "True or false: the heart has four chambers", expected: "true", kind: "boolean" })).toBe(false);
  });

  it("does not take a date or a recalled fact for a calculation", () => {
    expect(isQuantitative({ prompt: "When did the French Revolution begin?", expected: "1789" })).toBe(false);
    expect(isQuantitative({ prompt: "When was the treaty signed?", expected: "3 May 1990" })).toBe(false);
    expect(isQuantitative({ prompt: "How many chromosomes do humans have?", expected: "46", skill: "recall" })).toBe(false);
    // …unless the prompt asks to work something out.
    expect(isQuantitative({ prompt: "Calculate 2000 − 211", expected: "1789", skill: "recall" })).toBe(true);
  });

  it("lets an explicit flag decide and reads stored results as well as questions", () => {
    expect(isQuantitative({ prompt: "Calculate 2 + 2", expected: "4", quantitative: false })).toBe(false);
    expect(isQuantitative({ prompt: "Name the organ", expected: "liver", quantitative: true })).toBe(true);
    // A stored result carries `expected`, a question carries `answer`: same decision.
    expect(isQuantitative({ prompt: "Solve 3x = 12", answer: "4" })).toBe(isQuantitative({ prompt: "Solve 3x = 12", expected: "4" }));
  });

  it("reads numbers the way people write them", () => {
    expect(numbersIn("1,5")).toEqual([1.5]);
    expect(numbersIn("1,234.5")).toEqual([1234.5]);
    expect(numbersIn("3/4")).toEqual([0.75]);
    expect(numbersIn("−2 and 7")).toEqual([-2, 7]);
    expect(isNumericAnswer("42 m")).toBe(true);
    expect(isNumericAnswer("the answer is probably forty two")).toBe(false);
  });
});
