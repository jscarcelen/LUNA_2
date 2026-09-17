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
    { title: "Pick a layout", text: "Choose a template (worksheet, answer key, flashcards…) or keep the clean default. The questions stay the same; only the look changes." },
    { title: "Export or assign", text: "Download as PDF, Word or HTML, save it to your workspace, or share it with students." }
  ],
  instructions: "You are an expert teacher writing assessment questions. Using ONLY the reference material, write clear, unambiguous questions at the requested difficulty and of the requested types. For multiple-choice give 4 options with exactly one correct answer and plausible distractors; for true/false give the two options; for short-answer give an empty options list and a model answer. Every item needs a one-sentence explanation of why the answer is correct and a short topic tag. Never repeat a question. Spread questions across the material rather than clustering on one passage.",
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
      { name: "question", label: "Question", type: "string", repeatScope: "per-output" },
      { name: "type", label: "Question type", type: "string", repeatScope: "per-output" },
      { name: "options", label: "Answer options", type: "array", repeatScope: "per-output" },
      { name: "answer", label: "Correct answer", type: "string", repeatScope: "per-output" },
      { name: "explanation", label: "Explanation", type: "string", repeatScope: "per-output" },
      { name: "topic", label: "Topic", type: "string", repeatScope: "per-output" },
      { name: "difficulty", label: "Difficulty", type: "string", repeatScope: "per-output" }
    ]
  },
  model: "gpt-4o-mini",
  creativity: "low",
  scope: { workspaceId: "", subjectId: "", documentIds: [], styleDocumentIds: [] },
  outputMapping: {
    templateId: "",
    fieldTypeByName: { question: "heading3", options: "bullet_list", answer: "standalone_text", explanation: "paragraph", topic: "paragraph", difficulty: "paragraph", type: "paragraph" },
    fieldMappingByTemplateField: {},
    customization: { brand: { title: "Quiz", numbered: true, showDividers: true }, hiddenFields: ["type", "difficulty"], fieldOrder: ["question", "options", "answer", "explanation", "topic"] }
  }
};
