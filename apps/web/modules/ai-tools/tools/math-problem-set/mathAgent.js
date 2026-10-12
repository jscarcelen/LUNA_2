/**
 * The Math Problem Set as a built-in agent: it reads the documents the runner picks, finds the formulas and
 * quantitative ideas in them, and writes a PROBLEM SET (not a recall quiz): every problem needs thinking, with a
 * number-with-units, true/false or multiple-choice answer, and a worked, step-by-step solution that also names the
 * maths it needs. It is useful wherever a subject runs on formulas: economics, finance, physics, engineering, pure maths.
 * Like the Quiz Generator it is a plain config object (prompt + guided questions + output fields).
 */
export const MATH_AGENT = {
  id: "builtin-math-problem-set",
  name: "Math Problem Set",
  tagline: "Problems that use the formulas in your material, with fully worked answers.",
  description: "Reads your documents, picks out the key formulas and concepts, and writes a problem set: numeric answers with units, true / false and multiple choice with numeric options. Choose how hard the concepts are and, separately, how hard the maths is. Every answer is a step-by-step walk-through that also lists the maths you need.",
  howItWorks: [
    { title: "Choose your material", text: "Pick the documents with the formulas and concepts you want to practise. Notes on economics, finance, physics or engineering work best." },
    { title: "Set the problem set", text: "How many problems, which types, how hard the concepts are, how hard the maths is, and whether each problem lists the formulas it needs." },
    { title: "Luna writes the problems", text: "Each one applies a formula or concept from your material to a new situation. If the material has no formulas to practise, Luna says so and suggests a normal quiz instead." },
    { title: "Practise, then read the walk-through", text: "Answer inside Luna, then open the step-by-step solution and the list of maths concepts it used. Mistakes feed your Progress." }
  ],
  instructions: `<role>
You write PROBLEM SETS for a learner who will be marked automatically. A problem set is different from a recall quiz: every problem makes the learner think and calculate. Often the point is to test a formula or a concept from the subject (economics, finance, physics, engineering, statistics, pure maths), not to test the maths for its own sake.
</role>

<suitability>
First decide whether the reference material can support a problem set. It can when it contains formulas, quantities, relationships or procedures that can be applied to numbers. It cannot when it is purely descriptive (for example history, literature or law). If it cannot, return an EMPTY questions list and write, in the field "suitability", one or two sentences that say why and suggest the Quiz Generator or the Document Summarizer instead. If it can, leave "suitability" empty.
</suitability>

<rules>
1. SOURCE. Take the formulas, definitions and concepts only from the reference material. New situations and new numbers are yours to invent, because a problem needs fresh values; the formulas and ideas stay the material's own. Never write "according to the text".
2. ONE IDEA PER PROBLEM, WITH DEPTH. Each problem tests one formula or concept applied to a concrete situation with all the numbers it needs. It needs at least two reasoning or calculation steps, so it is never a lookup. Spread the problems across the formulas of the whole material, and never repeat a situation.
3. TWO DIFFICULTIES, SET SEPARATELY. "Concept difficulty" is how hard the idea is: easy = apply a single formula as taught; medium = choose between two related formulas or interpret a result; hard = combine several concepts or reason about an unfamiliar situation. "Math difficulty" is how hard the arithmetic and algebra are: easy = arithmetic, percentages, simple rearranging; medium = algebra, logarithms and exponentials, basic statistics, graph reading; hard = derivatives, integrals, limits, systems of equations, optimisation. Honour both settings independently: a hard-concept, easy-math problem uses simple numbers and a subtle idea; an easy-concept, hard-math problem uses a plain idea and demanding calculation. If a setting is "Mixed", vary it across the problems.
4. ANSWER TYPES. Use only the requested types and mix them in roughly equal shares. numeric: the question asks for a single number and ends with the unit and the rounding to give (for example "Give your answer in dollars, to two decimals"); put ONLY the number in "answer" (no unit, no words) and put the unit in "units"; options is empty. true-false: one clear statement about a calculated result or a concept; options are exactly ["True","False"]; "answer" is "True" or "False"; about half are false. multiple-choice: exactly 4 options that are numbers with their unit (computed from plausible slips such as a wrong rearrangement, a forgotten step or a unit mistake, never random values); exactly one is correct; "answer" repeats the correct option text exactly. For true-false and multiple-choice, units is "".
5. FORMULAS. When the learner chose to include formulas, end each problem with a line "Formulas you may need:" followed by the formulas it requires, written in LaTeX, and nothing else. When they chose not to, never state a formula in the question.
6. SOLUTION. "worked_solution" is a step-by-step walk-through of the maths AND the reasoning: number the steps, name the formula used in each step and say why it applies, show the substitution with the numbers, and finish with the result and its unit. A learner who got it wrong must be able to find their mistake from it. Write formulas in LaTeX.
7. KEY MATHS. "math_concepts" lists the maths skills the solution needs, as short names separated by semicolons, chosen from the usual skills (basic arithmetic; percentages and ratios; algebra and rearranging; logarithms and exponentials; basic statistics; derivatives; integration; limits; graph interpretation; basic geometry; systems of equations; optimisation) and extended when needed.
8. CHECK BEFORE WRITING. Solve every problem yourself from its own wording. Confirm that the unit is right, that the multiple-choice answer is exactly one of the options, that no other option is also correct, and that the number in "answer" matches the worked solution. Fix any problem that fails.
9. COUNT AND LANGUAGE. Return exactly the requested number of problems, unless the material is unsuitable. Write in the requested language; keep formulas, symbols and units as they are. "explanation" is one sentence stating the concept the problem tests. "topic" is a short tag from the material's own headings. "difficulty" is the concept difficulty (easy, medium or hard) and "math_level" the math difficulty.
</rules>`,
  outputExample: "",
  questions: [
    { id: "m-count", text: "How many problems?", type: "number", required: true },
    { id: "m-types", text: "Answer types", type: "multi-select", options: ["Number with units", "True / false", "Multiple choice"], required: true },
    { id: "m-concept", text: "Concept difficulty", type: "single-select", options: ["Easy", "Medium", "Hard", "Mixed"], required: true },
    { id: "m-math", text: "Math difficulty", type: "single-select", options: ["Easy", "Medium", "Hard", "Mixed"], required: true },
    { id: "m-formulas", text: "List the key formulas under each problem?", type: "yes-no", required: false },
    { id: "m-focus", text: "Anything to focus on? (optional)", type: "text", required: false },
    { id: "m-language", text: "Language", type: "single-select", options: ["Same as material", "English", "Spanish", "French"], required: false }
  ],
  template: {
    fields: [
      { name: "title", label: "Title", type: "string", repeatScope: "once", description: "A short, specific title for THIS problem set, written for its content (e.g. 'Elasticity and consumer surplus · Problem set 1'). Never the name of the tool." },
      { name: "suitability", label: "Suitability note", type: "string", repeatScope: "once", description: "Empty when the material supports a problem set. Otherwise one or two sentences saying why it does not and suggesting the Quiz Generator or the Document Summarizer." },
      { name: "question", label: "Problem", type: "string", repeatScope: "per-output", description: "The problem: a concrete situation with every number it needs, ending with the unit and rounding to give when the answer is a number." },
      { name: "type", label: "Answer type", type: "string", repeatScope: "per-output", description: "One of: numeric, true-false, multiple-choice." },
      { name: "options", label: "Answer options", type: "array", repeatScope: "per-output", description: "Multiple choice: 4 options, numbers with their unit. True / false: [\"True\",\"False\"]. Numeric: empty." },
      { name: "answer", label: "Correct answer", type: "string", repeatScope: "per-output", description: "Numeric: the number only. True / false: True or False. Multiple choice: the exact text of the correct option." },
      { name: "units", label: "Units", type: "string", repeatScope: "per-output", description: "The unit of a numeric answer (e.g. '$', 'm/s', '%'); empty for the other types." },
      { name: "worked_solution", label: "Step-by-step solution", type: "string", repeatScope: "per-output", description: "Numbered steps: the formula used and why, the substitution with numbers, the result with its unit. Formulas in LaTeX." },
      { name: "math_concepts", label: "Key math concepts", type: "string", repeatScope: "per-output", description: "The maths skills the solution needs, separated by semicolons (e.g. 'algebra and rearranging; logarithms and exponentials')." },
      { name: "explanation", label: "Concept tested", type: "string", repeatScope: "per-output", description: "One sentence naming the concept or formula the problem tests and why it matters." },
      { name: "topic", label: "Topic", type: "string", repeatScope: "per-output", description: "Short topic tag taken from the material." },
      { name: "difficulty", label: "Concept difficulty", type: "string", repeatScope: "per-output", description: "easy, medium or hard." },
      { name: "math_level", label: "Math difficulty", type: "string", repeatScope: "per-output", description: "easy, medium or hard." }
    ]
  },
  model: "gpt-4o",
  creativity: "low",
  scope: { workspaceId: "", subjectId: "", documentIds: [], styleDocumentIds: [] },
  outputMapping: {
    templateId: "",
    fieldTypeByName: { question: "heading3", options: "bullet_list", answer: "standalone_text", worked_solution: "paragraph", math_concepts: "paragraph", explanation: "paragraph", topic: "paragraph", difficulty: "paragraph", math_level: "paragraph", units: "paragraph", type: "paragraph", suitability: "paragraph" },
    fieldMappingByTemplateField: {},
    customization: { brand: { title: "Problem set", numbered: true, showDividers: true }, hiddenFields: ["type", "difficulty", "math_level", "units", "suitability"], fieldOrder: ["question", "options", "answer", "worked_solution", "math_concepts", "explanation", "topic"] }
  }
};
