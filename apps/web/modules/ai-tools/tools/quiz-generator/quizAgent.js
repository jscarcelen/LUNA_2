/**
 * The Quiz Generator expressed as a built-in agent. It is the reference every other agent
 * follows: a fixed creator prompt + reference material + a few guided questions → JSON items →
 * any output template.
 */
export const QUIZ_AGENT = {
  id: "builtin-quiz-generator",
  name: "Quiz Generator",
  tagline: "Turn your material into a quiz or exam in minutes.",
  description: "Reads the documents you choose and writes exam-quality questions with answer options, the correct answer and a short explanation. Works for any subject and level.",
  howItWorks: [
    { title: "Choose your material", text: "Pick the documents the questions should come from. Optionally add a past paper so the AI copies its style and difficulty." },
    { title: "Answer a few questions", text: "How many questions, how hard, which types. No prompts to write — the agent already knows how to build a quiz." },
    { title: "Pick formats and colors", text: "Style each component (questions, header, footer) with Template Studio's formats and colors, or apply a saved template. The questions stay the same; only the look changes." },
    { title: "Export or assign", text: "Download as PDF, Word or HTML, save it to your workspace, or share it with students." }
  ],
  instructions: "You are an expert teacher writing assessment questions for a learner who will be marked automatically, so every question must have ONE clear, checkable answer. Use ONLY the reference material; never rely on outside knowledge and never write 'according to the text/passage/document' (the question must stand on its own). TESTS ONE THING: each question tests a single concept, fact or skill — never two at once. SPECIFIC, NEVER BROAD: do not write 'Explain…', 'Discuss…', 'Describe…', 'What do you know about…', 'Tell me about…' or 'What is the difference between…' with no bound. Instead make the target exact: name the concept and say what to produce and how much ('In one sentence, define X.', 'Name the three components of X.', 'Calculate X given A = 120 and B = 80; give the result with its unit.', 'State which statement is affected by Y and why, in one sentence.'). A short-answer question has a bounded expected answer: a number with unit, a term, a single sentence or a list of a stated length ('List two…'). If you cannot state the expected answer in one or two short sentences, the question is too broad: narrow it. SHORT-ANSWER MODEL ANSWER: write it in one or two sentences with the exact key facts (names, numbers, units, the defining feature) that a marker must see, in the order the question asks for them, with no extra material. MULTIPLE CHOICE: 4 options, exactly one correct; the distractors are plausible, belong to the same category as the right answer and are drawn from related ideas in the material (typical misconceptions), similar in length and form; no 'all of the above' / 'none of the above'; do not make the right answer the longest; avoid negative stems ('Which is NOT…') — ask for the one correct statement instead; options never overlap or contain each other. TRUE/FALSE: each statement is clearly true or clearly false from the material, one idea per statement, no absolute words (always, never, only) unless the material itself uses them, and about half of the statements are false. CALCULATIONS: give every number the question needs, state the unit and the rounding, and make the answer a single number; show the key steps in the explanation. DIFFICULTY: easy = recall a definition, term or single fact; medium = apply one concept or formula to a short situation, or compare two things on one named criterion; hard = a multi-step problem, or choose and justify the right concept for a new situation. Never repeat a question or test the same fact twice; spread questions across the whole material in the order the material teaches it rather than clustering on one passage. Every item needs a one-sentence explanation of why the answer is correct (and, for multiple choice, why the most tempting wrong option is wrong when that helps), a short topic tag copied from the material's own headings or terms, and the difficulty tag. For true/false give the two options; for short-answer give an empty options list.",
  outputExample: "",
  questions: [
    { id: "q-count", text: "How many questions?", type: "number", required: true },
    { id: "q-difficulty", text: "Difficulty", type: "single-select", options: ["Easy", "Medium", "Hard", "Mixed"], required: true },
    { id: "q-types", text: "Question types", type: "multi-select", options: ["Multiple choice", "True / false", "Short answer"], required: true },
    { id: "q-focus", text: "Anything to focus on? (optional)", type: "text", required: false },
    { id: "q-language", text: "Language", type: "single-select", options: ["Same as material", "English", "Spanish", "French"], required: false }
  ],
  template: {
    fields: [
      { name: "title", label: "Title", type: "string", repeatScope: "once", description: "A short, specific title for THIS quiz, written for its content (e.g. 'Median and outliers · Quiz 1'). Never the name of the tool." },
      { name: "question", label: "Question", type: "string", repeatScope: "per-output", description: "The question text, self-contained and unambiguous." },
      { name: "type", label: "Question type", type: "string", repeatScope: "per-output", description: "One of: multiple-choice, true-false, short-answer." },
      { name: "options", label: "Answer options", type: "array", repeatScope: "per-output", description: "Answer choices in display order (4 for multiple choice, 2 for true/false, empty for short answer)." },
      { name: "answer", label: "Correct answer", type: "string", repeatScope: "per-output", description: "The correct option text, or the model answer for short-answer questions." },
      { name: "explanation", label: "Explanation", type: "string", repeatScope: "per-output", description: "One sentence explaining why the answer is correct." },
      { name: "topic", label: "Topic", type: "string", repeatScope: "per-output", description: "Short topic tag taken from the material (e.g. 'Central tendency')." },
      { name: "difficulty", label: "Difficulty", type: "string", repeatScope: "per-output", description: "easy, medium or hard." }
    ]
  },
  model: "gpt-4o",
  creativity: "low",
  scope: { workspaceId: "", subjectId: "", documentIds: [], styleDocumentIds: [] },
  outputMapping: {
    templateId: "",
    fieldTypeByName: { question: "heading3", options: "bullet_list", answer: "standalone_text", explanation: "paragraph", topic: "paragraph", difficulty: "paragraph", type: "paragraph" },
    fieldMappingByTemplateField: {},
    customization: { brand: { title: "Quiz", numbered: true, showDividers: true }, hiddenFields: ["type", "difficulty"], fieldOrder: ["question", "options", "answer", "explanation", "topic"] }
  }
};
