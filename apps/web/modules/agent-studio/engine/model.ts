import type { AgentSpec, ContextSlot, ExampleDef, InputDef, InputType, ValidationRule } from "./types";
import type { FieldDef } from "./types";
import { createField, createId } from "../../template-studio/engine/model";
import { QUIZ_AGENT } from "../../ai-tools/tools/quiz-generator/quizAgent";

export { createField, createId };

export const LANGUAGES = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Catalan", "Dutch", "Chinese", "Japanese", "Arabic"];
export const MODEL_OPTIONS = [
  { value: "gpt-4o", label: "Luna 3 Pro (recommended, high quality)" },
  { value: "gpt-4.1", label: "Luna 3 Max (most capable)" }
];

export function createInput(name: string, type: InputType, overrides: Partial<InputDef> = {}): InputDef {
  return { id: createId("in"), name, type, required: true, ...overrides };
}

export function createSlot(kind: ContextSlot["kind"], name: string, overrides: Partial<ContextSlot> = {}): ContextSlot {
  return { id: createId("ctx"), kind, name, description: "", required: false, multiple: true, usage: "source", ...overrides };
}

export function createCollection(name: string, fields: FieldDef[]): FieldDef {
  return createField(name, "array", { children: [createField("item", "object", { children: fields })] });
}

export function createAgentSpec(name = "Untitled agent"): AgentSpec {
  const now = new Date().toISOString();
  return {
    id: createId("agent"),
    version: 1,
    name,
    purpose: { headline: "", description: "" },
    instructions: { core: "", constraints: [] },
    inputs: [],
    contextSlots: [createSlot("user_material", "Source material", { description: "Draw the content from this material.", required: false, multiple: true })],
    outputSchema: [createCollection("Items", [createField("Title", "text", { description: "Short title", required: true })])],
    examples: [],
    validationRules: [{ type: "required_fields" }, { type: "no_duplicates", arrayFieldId: "__primary__", byFieldId: "__first__" }],
    model: { model: "gpt-4o", creativity: "medium" },
    createdAt: now,
    updatedAt: now
  };
}

/** The primary collection (first top-level array) — emitted as `items` at run time. */
export function primaryCollection(spec: AgentSpec): FieldDef | null {
  return spec.outputSchema.find((field) => field.type === "array") || null;
}
export function collectionFields(collection: FieldDef | null): FieldDef[] {
  const item = collection?.children?.[0];
  return item?.type === "object" ? item.children || [] : item ? [item] : [];
}

/** The title of the generated work, written by the AI for its content — printed in the document header. */
export function titleField(description = "A short, specific title for this work, written for its content. Never the name of the tool.") {
  // Soft: a missing title falls back to the agent's name and never fails the agent's checks.
  return createField("Title", "text", { description, required: false });
}

/**
 * Agents that return a list of items get a title for the whole work; the header of the document
 * prints it. Agents saved before this existed receive the field when they are opened or run.
 */
export function withTitle(spec: AgentSpec): AgentSpec {
  if (spec.output?.selectedBlocks?.length) return spec;
  if (!primaryCollection(spec)) return spec;
  const has = spec.outputSchema.some((field) => field.type !== "array" && field.type !== "object" && /^(title|heading|name)$/i.test(field.name.trim()));
  return has ? spec : { ...spec, outputSchema: [titleField(), ...spec.outputSchema] };
}

/* ---------------------------------------------------------------- built-in agents */

export function createVocabularyFlashcardsSpec(): AgentSpec {
  const spec = createAgentSpec("Vocabulary Flashcards");
  spec.purpose = { headline: "Vocabulary flashcards", description: "Creates flashcards that pair words between two languages, optionally from material you upload.", category: "Languages" };
  spec.instructions = {
    core: "Create vocabulary flashcards pairing a word in language 1 with its translation in language 2. Choose words that are useful and level-appropriate. If source material is provided, take the vocabulary from it; otherwise use general knowledge for the requested topic level. Never repeat a word.",
    style: "Keep each side to a single word or short phrase; no sentences on the card.",
    constraints: ["Return exactly the requested number of cards.", "Both sides must be in the requested languages."]
  };
  const count = createInput("Number of cards", "number", { description: "How many cards to create (max 30 per set — keeps each set focused and usable in one study session)", default: 20, min: 1, max: 30 });
  const lang1 = createInput("Language 1", "language", { default: "Spanish" });
  const lang2 = createInput("Language 2", "language", { default: "English" });
  const difficulty = createInput("Difficulty", "choice", { options: ["Beginner", "Intermediate", "Advanced"], default: "Beginner" });
  spec.inputs = [count, lang1, lang2, difficulty];
  spec.contextSlots = [createSlot("user_material", "Source material", { description: "If provided, take the vocabulary from this material; otherwise generate from general knowledge.", required: false, multiple: true })];
  const front = createField("Front", "text", { description: "The word in language 1", required: true });
  const back = createField("Back", "text", { description: "The translation in language 2", required: true });
  const topic = createField("Topic", "text", { description: "The topic or category of the word", required: false });
  const cards = createCollection("Flashcards", [front, back, topic]);
  spec.outputSchema = [titleField("A short, specific title for this set, e.g. 'Animals · Spanish → English'"), cards];
  spec.validationRules = [{ type: "required_fields" }, { type: "count_matches_input", arrayFieldId: cards.id, inputId: count.id }, { type: "no_duplicates", arrayFieldId: cards.id, byFieldId: front.id }];
  spec.examples = [{ id: createId("ex"), source: "pasted", inputs: { [count.id]: 3, [lang1.id]: "Spanish", [lang2.id]: "English", [difficulty.id]: "Beginner" }, output: { title: "Animals · Spanish → English", items: [{ front: "perro", back: "dog", topic: "Animals" }, { front: "gato", back: "cat", topic: "Animals" }, { front: "caballo", back: "horse", topic: "Animals" }] }, note: "Simple, everyday words for beginners." }];
  spec.model = { model: "gpt-4o", creativity: "medium" };
  return spec;
}

/**
 * Concept flashcards: the key concepts or terms of a document and their definitions, as front / back pairs in the
 * language the runner chooses. (Vocabulary Flashcards is different: it pairs words between two languages.)
 */
export function createConceptFlashcardsSpec(): AgentSpec {
  const spec = createAgentSpec("Concept Flashcards");
  spec.purpose = { headline: "Concept and definition flashcards", description: "Finds the key concepts and terms in your material and turns each into a card: the concept on the front, its definition on the back.", category: "Study" };
  spec.instructions = {
    core: `<role>
You make concept flashcards from the learner's material so that they can learn its key ideas by recalling each definition.
</role>

<rules>
1. SELECT. Choose the concepts, terms, laws, formulas and named ideas a student must be able to define to understand and be examined on this material. Prefer the ones the material defines or stresses (headings, bold or repeated terms, worked definitions) over passing mentions. Cover the whole material in the order it teaches it, so the set is balanced and no section is skipped.
2. FRONT. The front is the concept alone: a term or a short name (at most six words), such as "Opportunity cost" or "Net present value". It never contains the definition and never a full question.
3. BACK. The back is the definition in one to three plain sentences taken from the material's own meaning. Define what it is, then, when the material gives it, say what it is for or how it is calculated (formulas in LaTeX). The back never starts with the term itself, so the card is not circular.
4. ONE IDEA PER CARD. If two terms are only different names for the same thing, make one card and mention the other name on the back. Never repeat a concept.
5. SOURCE. Use only the reference material; never add outside facts.
6. CHECK BEFORE WRITING. Reread each card: the front names one concept, the back defines it correctly and completely according to the material, and nothing on the back is a guess.
7. LANGUAGE AND COUNT. Write both sides in the requested language, keeping formulas, symbols and proper names as they are. Return exactly the requested number of cards (if the material has fewer distinct concepts, return as many as it supports and no filler).
</rules>`,
    style: "Plain, precise language a student can learn from. No sentences on the front.",
    constraints: ["Return exactly the requested number of cards.", "Front: the concept only. Back: its definition."]
  };
  const count = createInput("Number of cards", "number", { description: "How many cards to create (max 30 per set — keeps each set focused and usable in one study session)", default: 20, min: 1, max: 30 });
  const language = createInput("Language", "language", { default: "English", description: "The language of both sides of every card." });
  const focus = createInput("Focus (optional)", "text", { required: false, description: "A chapter or topic to take the concepts from. Leave empty to cover everything." });
  spec.inputs = [count, language, focus];
  spec.contextSlots = [createSlot("user_material", "Documents to take the concepts from", { description: "The concepts and their definitions come from this material.", required: true, multiple: true, usage: "source" })];
  const front = createField("Front", "text", { description: "The concept or term alone, at most six words", required: true });
  const back = createField("Back", "text", { description: "Its definition in one to three plain sentences", required: true });
  const topic = createField("Topic", "text", { description: "The section or topic of the material the concept belongs to", required: false });
  const cards = createCollection("Flashcards", [front, back, topic]);
  spec.outputSchema = [titleField("A short, specific title for this set, written for its content, e.g. 'Microeconomics · Key concepts'. Never the name of the tool."), cards];
  spec.validationRules = [{ type: "required_fields" }, { type: "count_matches_input", arrayFieldId: cards.id, inputId: count.id }, { type: "no_duplicates", arrayFieldId: cards.id, byFieldId: front.id }];
  spec.examples = [{ id: createId("ex"), source: "pasted", inputs: { [count.id]: 2, [language.id]: "English" }, output: { title: "Microeconomics · Key concepts", items: [{ front: "Opportunity cost", back: "The value of the next best alternative given up when a choice is made.", topic: "Scarcity and choice" }, { front: "Price elasticity of demand", back: "How much the quantity demanded changes when the price changes: the percentage change in quantity divided by the percentage change in price.", topic: "Demand" }] }, note: "Concept alone on the front; a definition that does not repeat the term on the back." }];
  spec.model = { model: "gpt-4o", creativity: "low" };
  return spec;
}

/**
 * The document summarizer: one or more documents become ONE structured document of one or two pages, written the
 * way a consultant would write it, so a student can read it and know what the material is about, what to focus
 * on and what to remember. A single model call (the documents' best-matching passages), unlike the Summary Notes
 * Consolidator, which keeps everything.
 */
export function createDocumentSummarySpec(): AgentSpec {
  const spec = createAgentSpec("Document Summarizer");
  spec.purpose = { headline: "A one-to-two page summary of your documents", description: "Reads any document or documents and writes ONE structured summary of one or two pages: the key messages, formulas, concepts and takeaways, as clear and direct as a consultant's briefing.", category: "Study" };
  spec.instructions = {
    core: `<role>
You write the briefing a student reads instead of the documents: one structured document that says what the material is about, what matters, what to remember and what to focus on. Write it the way a good consultant writes for a busy client: clear, direct, nothing that does not earn its place.
</role>

<structure>
Write, in this order, using the available blocks:
1. document_header: a specific title.
2. callout (info): "The big picture" in two or three sentences: what this material is about and why it matters.
3. section_header + bullet_list: "Key messages": the three to six conclusions the material wants the reader to take away, each one a full short sentence that states the message, not the topic.
4. section_header + heading + paragraph / bullet_list: "Key concepts": each concept in one line with a plain definition, grouped under short headings when there are many.
5. section_header + paragraph: "Key formulas": only when the material has formulas. Each formula in LaTeX with a one-line meaning of its symbols and when to use it. Leave this section out when there are none.
6. section_header + bullet_list: "What to remember": facts, rules, numbers, dates or distinctions that are likely to be examined.
7. callout (tip): "Where to focus": the two or three ideas that are hardest or most important, and why.
</structure>

<rules>
1. LENGTH IS A LIMIT. The result fits the requested length (one page is about 400 words, two pages about 800). Cut detail, never the key messages. A reader must finish it in a few minutes.
2. SOURCE. Use only the reference material; never add outside facts. When several documents are given, merge them by theme and write each idea once.
3. EASY TO READ. Short sentences, plain words, active voice; define a technical term the first time it appears. Prefer a concrete number or example from the material to a general statement.
4. PRIORITISE. Put what matters most first inside each section. Leave out history of the author, structure of the chapters and anything that does not help the student understand or remember the content.
5. CHECK BEFORE WRITING. Confirm that every formula and number matches the material, that the title says what is in this material, and that the document stays within the requested length.
6. LANGUAGE. Write in the requested language, keeping formulas, symbols and proper names as they are. If a focus is given, give it the most room and keep everything else brief.
</rules>`,
    style: "Consultant-style: direct, structured, plain language.",
    constraints: ["One to two pages in total.", "Key messages are full sentences that state the message."]
  };
  const length = createInput("Length", "choice", { options: ["1 page", "2 pages"], default: "1 page", description: "How long the summary may be: one page is about 400 words, two pages about 800." });
  const language = createInput("Language", "language", { default: "English", description: "The language the summary is written in." });
  const focus = createInput("Focus (optional)", "text", { required: false, description: "A topic to give the most room. Everything else stays brief." });
  spec.inputs = [length, language, focus];
  spec.contextSlots = [createSlot("user_material", "Documents to summarise", { description: "One or several documents; they are merged into a single summary.", required: true, multiple: true, usage: "source" })];
  spec.output = { selectedBlocks: ["document_header", "section_header", "heading", "paragraph", "bullet_list", "callout"].map((blockId) => ({ blockId, formatId: "", color: "blue" })) };
  spec.model = { model: "gpt-4o", creativity: "low" };
  return spec;
}

/**
 * Merges several documents (from any subject or folder) into ONE exhaustive set of notes organised by
 * topic, with overlapping information written once and every statement tagged with the original
 * document and page/section it came from. Runs through its own multi-pass pipeline
 * (`pipeline: "consolidate"`), so it can read inputs far longer than one model call.
 */
export function createSummaryNotesConsolidatorSpec(): AgentSpec {
  const spec = createAgentSpec("Summary Notes Consolidator");
  spec.pipeline = "consolidate";
  spec.purpose = { headline: "Merge several documents into one complete set of notes", description: "Reads every document you choose and writes ONE exhaustive, organised document: all the information, formulas, tables and figure descriptions, with overlapping content written once and every statement traced back to its original document.", category: "Study notes" };
  spec.instructions = {
    core: "Consolidate the chosen documents into one exhaustive, structured set of notes. Keep every distinct fact, definition, rule, formula (LaTeX), table row and figure description. Organise by topic, not by document. When the same information appears in several documents write it once, merged. End every statement with a tag naming the original document and page or section it came from.",
    constraints: ["Never drop information.", "Never repeat the same information twice.", "Every statement is traceable to an original document."]
  };
  spec.inputs = [
    createInput("Language", "language", { default: "English", description: "The language the notes are written in." }),
    createInput("Focus (optional)", "text", { required: false, description: "A topic to put first and treat in the most depth. Everything else is still included." })
  ];
  spec.contextSlots = [createSlot("user_material", "Documents to consolidate", { description: "Pick the documents from any subject or folder of your workspace. All of their information ends up in the notes.", required: true, multiple: true, usage: "source" })];
  spec.output = {
    selectedBlocks: ["document_header", "section_header", "heading", "paragraph", "bullet_list", "callout", "vocabulary"].map((blockId) => ({ blockId, formatId: "", color: "blue" }))
  };
  spec.model = { model: "gpt-4o", creativity: "low" };
  return spec;
}

export function createQuizSpec(): AgentSpec {
  const spec = createAgentSpec("Quiz Generator");
  spec.purpose = { headline: "Quiz or exam questions", description: "Reads the documents you choose and writes exam-quality questions with answer options, the correct answer and a short explanation.", category: "Assessment" };
  spec.instructions = {
    // One prompt for the built-in quiz agent, wherever it is built from.
    core: QUIZ_AGENT.instructions,
    constraints: ["Return exactly the requested number of questions."]
  };
  const count = createInput("How many questions?", "number", { default: 10, min: 1, max: 50 });
  const difficulty = createInput("Difficulty", "choice", { options: ["Easy", "Medium", "Hard", "Mixed"], default: "Medium" });
  const types = createInput("Question types", "multi_choice", { options: ["Multiple choice", "True / false", "Short answer"], default: ["Multiple choice"] });
  const focus = createInput("Anything to focus on?", "text", { required: false });
  const language = createInput("Language", "choice", { options: ["Same as material", "English", "Spanish", "French"], required: false, default: "Same as material" });
  spec.inputs = [count, difficulty, types, focus, language];
  spec.contextSlots = [
    createSlot("user_material", "Documents to write questions from", { description: "The questions must come from this material.", required: true, multiple: true, usage: "source" }),
    createSlot("user_material", "Style example (optional)", { description: "A past paper: imitate its format and level, do not take content from it.", required: false, multiple: true, usage: "style" })
  ];
  const question = createField("Question", "text", { description: "The question text, self-contained and unambiguous.", required: true });
  const type = createField("Type", "text", { description: "One of: multiple-choice, true-false, short-answer.", required: true });
  const options = createField("Options", "array", { description: "Answer choices in display order (4 for multiple choice, 2 for true/false, empty for short answer).", children: [createField("Option", "text")] });
  const answer = createField("Answer", "text", { description: "The correct option text, or the model answer for short-answer questions.", required: true });
  const explanation = createField("Explanation", "text", { description: "One sentence explaining why the answer is correct.", required: true });
  const topic = createField("Topic", "text", { description: "Short topic tag taken from the material.", required: true });
  const diff = createField("Difficulty", "text", { description: "easy, medium or hard.", required: true });
  const questions = createCollection("Questions", [question, type, options, answer, explanation, topic, diff]);
  spec.outputSchema = [titleField("A short, specific title for this quiz, written for its content, e.g. 'Median and outliers · Quiz 1'. Never the name of the tool."), questions];
  spec.validationRules = [{ type: "required_fields" }, { type: "count_matches_input", arrayFieldId: questions.id, inputId: count.id }, { type: "no_duplicates", arrayFieldId: questions.id, byFieldId: question.id }, { type: "answer_in_options", arrayFieldId: questions.id, answerFieldId: answer.id, optionsFieldId: options.id }];
  spec.model = { model: "gpt-4o", creativity: "low" };
  return spec;
}

export const QUICK_ACTIONS: { id: string; label: string; feedback: string }[] = [
  { id: "harder", label: "🎯 Make harder", feedback: "Make the content more challenging and appropriate for advanced learners." },
  { id: "easier", label: "🌱 Make easier", feedback: "Make the content simpler and appropriate for beginners." },
  { id: "source", label: "📚 Follow source more closely", feedback: "Take content strictly from the provided material; do not add outside knowledge." },
  { id: "variety", label: "✨ More variety", feedback: "Vary the items more: different topics, phrasing and angles; avoid similar items." },
  { id: "shorter", label: "📝 Shorter answers", feedback: "Keep every text field concise: one short sentence at most." },
  { id: "exact", label: "🔢 Exactly the requested number", feedback: "Always return exactly the number of items the user asked for." }
];

export function isRule<T extends ValidationRule["type"]>(rule: ValidationRule, type: T): rule is Extract<ValidationRule, { type: T }> {
  return rule.type === type;
}
export type { ExampleDef };
