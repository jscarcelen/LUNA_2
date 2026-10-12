import { skillTaggingRule } from "../../../skills/taxonomy.js";

/**
 * The Level Test as a built-in agent: a diagnostic pre-test that sets the scene before the material is studied.
 * It does not test the material itself but the foundations the material builds on, grouped into components, so
 * Luna can say where to start: for a language, vocabulary / sentences / negatives / questions / tenses; for history,
 * the background that leads to an event; for maths or economics, the skills and concepts underneath.
 * `topic` carries the component name, so the report groups the answers by component with the machinery
 * every other quiz already has. A plain config object like the Quiz Generator.
 */
export const LEVEL_AGENT = {
  id: "builtin-level-test",
  name: "Level Test",
  tagline: "Find out where to start: a short test of the foundations your material builds on.",
  description: "Reads your material, decides what a learner needs to know before it (the vocabulary and sentence patterns of a language, the background to a historical event, the concepts and skills under a technical subject) and writes a short test per foundation. The result says which foundations are solid and where to begin.",
  howItWorks: [
    { title: "Choose your material", text: "The documents you are about to study. The test is built from what they assume you already know." },
    { title: "Answer a few questions", text: "Questions per foundation and the types you prefer." },
    { title: "Take the test", text: "Answer inside Luna. Add your working when it helps explain an answer." },
    { title: "See where to start", text: "Progress shows each foundation as solid, to review or a place to start, with a refresher for the weak ones." }
  ],
  instructions: `<role>
You write a LEVEL TEST: a diagnostic pre-test for a learner who is about to study the reference material. It does not test the material itself. It tests the FOUNDATIONS the material builds on, so that Luna can tell the learner where to start.
</role>

<steps>
1. KIND AND LEVEL. Read the reference material and decide what kind it is (a language course, history or another humanity, maths or science or economics, or something else) and the level it assumes: for a language the CEFR level (A1 to C2) or school year, otherwise the school or university level. Write the level in the field "level".
2. COMPONENTS. Choose 4 to 8 foundation components, ordered from the most basic to the most advanced, that a learner needs before this material. Choose only components the material really needs, at its level:
   - a language: the key words and phrases of the material's topics, forming simple sentences, negatives, forming questions, verb tenses, spelling and punctuation, reading a short text;
   - history or another humanity: the background facts and context that lead up to the main events, key people and terms, the order of events, causes and consequences;
   - maths, science or economics: the prerequisite concepts and the skills underneath (arithmetic and percentages, algebra, derivatives, units…);
   - anything else: the ideas the first chapter takes for granted.
3. QUESTIONS. For each component write the requested number of questions, from easy to harder inside the component. Every question tests ONE thing and has ONE clear, checkable answer.
</steps>

<rules>
1. FOUNDATIONS, NOT CONTENT. A question about something the material is about to teach is the wrong question, because the test must show what the learner already has. Ask about what the material takes for granted.
2. ONE NAME PER COMPONENT. Put the component's name in "topic", spelled identically on every question of that component and short (for example "Negatives", "Background to the war", "Algebra"), because the report groups the answers by this name.
3. THE LEVEL OF THE MATERIAL. Match the level you decided in step 1: a beginner language text gets beginner words and patterns, a university course gets university prerequisites.
4. ANSWERS. Multiple choice has exactly 4 options and one correct answer; true / false has options ["True","False"]; short answer has a bounded expected answer (a word, a number with its unit, one short sentence). A language question may ask the learner to translate, complete, rewrite or form a sentence, and its "answer" is the one correct form.
5. SELF-CONTAINED. Never write "according to the text". Never use outside facts the material would contradict.
6. EXPLANATION. One sentence saying why the answer is right, so a learner who got it wrong learns the foundation.
7. COUNT AND LANGUAGE. Write the requested number of questions per component, in the requested language (keep the target-language sentences of a language test in that language).
8. CHECK BEFORE WRITING. Confirm that every component name is the same on all its questions, that the questions get harder inside each component and that each multiple-choice answer is exactly one of its options.
</rules>

${skillTaggingRule()}`,
  outputExample: "",
  questions: [
    { id: "l-per", text: "How many questions per foundation?", type: "number", required: true, defaultValue: 3 },
    { id: "l-types", text: "Question types", type: "multi-select", options: ["Multiple choice", "True / false", "Short answer"], required: true },
    { id: "l-focus", text: "Anything to focus on? (optional)", type: "text", required: false },
    { id: "l-language", text: "Language", type: "single-select", options: ["Same as material", "English", "Spanish", "French"], required: false }
  ],
  template: {
    fields: [
      { name: "title", label: "Title", type: "string", repeatScope: "once", description: "A short title for THIS test, for example 'Spanish A2 · Level test'. Never the name of the tool." },
      { name: "level", label: "Level", type: "string", repeatScope: "once", description: "The level the material assumes, for example 'A2', 'Year 9' or 'First-year university'." },
      { name: "question", label: "Question", type: "string", repeatScope: "per-output", description: "The question text, self-contained and unambiguous." },
      { name: "type", label: "Question type", type: "string", repeatScope: "per-output", description: "One of: multiple-choice, true-false, short-answer." },
      { name: "options", label: "Answer options", type: "array", repeatScope: "per-output", description: "4 options for multiple choice, 2 for true/false, empty for short answer." },
      { name: "answer", label: "Correct answer", type: "string", repeatScope: "per-output", description: "The correct option text, or the model answer for short answer." },
      { name: "explanation", label: "Explanation", type: "string", repeatScope: "per-output", description: "One sentence saying why the answer is right." },
      { name: "topic", label: "Foundation", type: "string", repeatScope: "per-output", description: "The name of the foundation component this question belongs to, identical on all its questions." },
      { name: "difficulty", label: "Difficulty", type: "string", repeatScope: "per-output", description: "easy, medium or hard." },
      { name: "requires_skills", label: "Skills needed", type: "array", repeatScope: "per-output", description: "0 to 3 skill ids (see <skill_tags>); an empty list for pure recall." }
    ]
  },
  model: "gpt-4o",
  creativity: "low",
  scope: { workspaceId: "", subjectId: "", documentIds: [], styleDocumentIds: [] },
  outputMapping: {
    templateId: "",
    fieldTypeByName: { question: "heading3", options: "bullet_list", answer: "standalone_text", explanation: "paragraph", topic: "paragraph", difficulty: "paragraph", type: "paragraph", level: "paragraph" },
    fieldMappingByTemplateField: {},
    customization: { brand: { title: "Level test", numbered: true, showDividers: true }, hiddenFields: ["type", "difficulty", "requires_skills", "level"], fieldOrder: ["question", "options", "answer", "explanation", "topic"] }
  }
};
