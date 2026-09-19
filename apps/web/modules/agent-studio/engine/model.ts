import type { AgentSpec, ContextSlot, ExampleDef, InputDef, InputType, ValidationRule } from "./types";
import type { FieldDef } from "./types";
import { createField, createId } from "../../template-studio/engine/model";

export { createField, createId };

export const LANGUAGES = ["English", "Spanish", "French", "German", "Italian", "Portuguese", "Catalan", "Dutch", "Chinese", "Japanese", "Arabic"];
export const MODEL_OPTIONS = [
  { value: "gpt-4o-mini", label: "Luna 3 Mini (fast, low cost)" },
  { value: "gpt-4o", label: "Luna 3 Pro (higher quality)" },
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
    validationRules: [{ type: "required_fields" }],
    model: { model: "gpt-4o-mini", creativity: "medium" },
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

/* ---------------------------------------------------------------- built-in agents */

export function createVocabularyFlashcardsSpec(): AgentSpec {
  const spec = createAgentSpec("Vocabulary Flashcards");
  spec.purpose = { headline: "Vocabulary flashcards", description: "Creates flashcards that pair words between two languages, optionally from material you upload.", category: "Languages" };
  spec.instructions = {
    core: "Create vocabulary flashcards pairing a word in language 1 with its translation in language 2. Choose words that are useful and level-appropriate. If source material is provided, take the vocabulary from it; otherwise use general knowledge for the requested topic level. Never repeat a word.",
    style: "Keep each side to a single word or short phrase; no sentences on the card.",
    constraints: ["Return exactly the requested number of cards.", "Both sides must be in the requested languages."]
  };
  const count = createInput("Number of cards", "number", { description: "How many cards to create", default: 20, min: 1, max: 100 });
  const lang1 = createInput("Language 1", "language", { default: "Spanish" });
  const lang2 = createInput("Language 2", "language", { default: "English" });
  const difficulty = createInput("Difficulty", "choice", { options: ["Beginner", "Intermediate", "Advanced"], default: "Beginner" });
  spec.inputs = [count, lang1, lang2, difficulty];
  spec.contextSlots = [createSlot("user_material", "Source material", { description: "If provided, take the vocabulary from this material; otherwise generate from general knowledge.", required: false, multiple: true })];
  const front = createField("Front", "text", { description: "The word in language 1", required: true });
  const back = createField("Back", "text", { description: "The translation in language 2", required: true });
  const topic = createField("Topic", "text", { description: "The topic or category of the word", required: false });
  const cards = createCollection("Flashcards", [front, back, topic]);
  spec.outputSchema = [cards];
  spec.validationRules = [{ type: "required_fields" }, { type: "count_matches_input", arrayFieldId: cards.id, inputId: count.id }, { type: "no_duplicates", arrayFieldId: cards.id, byFieldId: front.id }];
  spec.examples = [{ id: createId("ex"), source: "pasted", inputs: { [count.id]: 3, [lang1.id]: "Spanish", [lang2.id]: "English", [difficulty.id]: "Beginner" }, output: { items: [{ front: "perro", back: "dog", topic: "Animals" }, { front: "gato", back: "cat", topic: "Animals" }, { front: "caballo", back: "horse", topic: "Animals" }] }, note: "Simple, everyday words for beginners." }];
  spec.model = { model: "gpt-4o-mini", creativity: "medium" };
  return spec;
}

export function createQuizSpec(): AgentSpec {
  const spec = createAgentSpec("Quiz Generator");
  spec.purpose = { headline: "Quiz or exam questions", description: "Reads the documents you choose and writes exam-quality questions with answer options, the correct answer and a short explanation.", category: "Assessment" };
  spec.instructions = {
    core: "You are an expert teacher writing assessment questions. Using ONLY the reference material, write clear, unambiguous questions at the requested difficulty and of the requested types. For multiple-choice give 4 options with exactly one correct answer and plausible distractors; for true/false give the two options; for short-answer give an empty options list and a model answer. Every item needs a one-sentence explanation of why the answer is correct and a short topic tag. Never repeat a question. Spread questions across the material rather than clustering on one passage.",
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
  spec.outputSchema = [questions];
  spec.validationRules = [{ type: "required_fields" }, { type: "count_matches_input", arrayFieldId: questions.id, inputId: count.id }, { type: "no_duplicates", arrayFieldId: questions.id, byFieldId: question.id }, { type: "answer_in_options", arrayFieldId: questions.id, answerFieldId: answer.id, optionsFieldId: options.id }];
  spec.model = { model: "gpt-4o-mini", creativity: "low" };
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
