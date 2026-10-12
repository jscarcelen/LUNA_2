import { describe, expect, it } from "vitest";
// @ts-ignore - plain JS modules
import { MATH_AGENT } from "../modules/ai-tools/tools/math-problem-set/mathAgent.js";
import { CONCEPT_FLASHCARDS_AGENT } from "../modules/ai-tools/tools/concept-flashcards/conceptAgent.js";
import { DOCUMENT_SUMMARIZER_AGENT } from "../modules/ai-tools/tools/document-summarizer/summarizerAgent.js";
import { readFileSync } from "node:fs";

// The registry and Create page are JSX (not loadable here), so their wiring is read as text.
const read = (path: string) => readFileSync(new URL(`../modules/ai-tools/${path}`, import.meta.url), "utf8");
const toolIds = (source: string) => [...source.matchAll(/^\s*id: "([a-z-]+)",$/gm)].map((match) => match[1]);

describe("the new built-in agents", () => {
  it("are registered, and every quick-make id is a registered tool", () => {
    const registry = read("registry.js");
    const registered = new Set([
      ...["quiz-generator/index.js", "math-problem-set/index.js", "concept-flashcards/index.js", "vocabulary-flashcards/index.js", "document-summarizer/index.js", "summary-consolidator/index.js", "agent-builder/index.js", "template-builder/index.js", "chatbot/index.js"].flatMap((file) => toolIds(read(`tools/${file}`)))
    ]);
    for (const id of ["math-problem-set", "concept-flashcards", "document-summarizer"]) expect(registry, id).toContain(`${id.split("-").map((part, index) => (index ? part[0].toUpperCase() + part.slice(1) : part)).join("")}Tool`);
    const quick = [...read("ui/CreatePage.js").matchAll(/\{ id: "([a-z-]+)", title:/g)].map((match) => match[1]);
    expect(quick.length).toBeGreaterThanOrEqual(4);
    for (const id of quick) expect(registered.has(id), id).toBe(true);
  });
  it("math problem set offers separate concept and math difficulty, a formulas toggle and the three answer types", () => {
    const names = MATH_AGENT.questions.map((question: any) => question.text);
    expect(names).toEqual(expect.arrayContaining(["How many problems?", "Answer types", "Concept difficulty", "Math difficulty"]));
    expect(MATH_AGENT.questions.find((question: any) => question.type === "yes-no")).toBeTruthy();
    expect(MATH_AGENT.questions.find((question: any) => question.text === "Answer types")?.options).toEqual(["Number with units", "True / false", "Multiple choice"]);
    const fields = MATH_AGENT.template.fields.map((field: any) => field.name);
    expect(fields).toEqual(expect.arrayContaining(["worked_solution", "math_concepts", "units", "suitability"]));
    expect(MATH_AGENT.instructions).toMatch(/Quiz Generator or the Document Summarizer/);
  });
  it("concept flashcards ask for a count and a language, and require material", () => {
    expect(CONCEPT_FLASHCARDS_AGENT.questions.map((question: any) => question.text)).toEqual(expect.arrayContaining(["Number of cards", "Language"]));
    expect(CONCEPT_FLASHCARDS_AGENT.materialSlots.some((slot: any) => slot.required)).toBe(true);
    expect(CONCEPT_FLASHCARDS_AGENT.template.fields.map((field: any) => field.name.toLowerCase())).toEqual(expect.arrayContaining(["front", "back"]));
  });
  it("document summarizer writes a block document within one or two pages", () => {
    expect(DOCUMENT_SUMMARIZER_AGENT.questions.find((question: any) => question.text === "Length")?.options).toEqual(["1 page", "2 pages"]);
    expect(JSON.stringify(DOCUMENT_SUMMARIZER_AGENT.outputJsonSchema)).toContain("bullet_list");
    expect(DOCUMENT_SUMMARIZER_AGENT.instructions).toMatch(/consultant/i);
  });
});
