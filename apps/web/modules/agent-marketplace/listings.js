/**
 * Marketplace listings live in localStorage until real auth/payments exist. A listing carries the
 * full agent config so it can be installed into a subject as a runnable `.agent.json` document.
 */

export const AGENT_MARKETPLACE_STORAGE_KEY = "luna.agentMarketplaceListings.v1";

export const PRICING_TYPE_LABELS = {
  "pay-as-you-go": "Pay as you go",
  monthly: "Monthly",
  "one-time": "One-time"
};

export const CATEGORIES = ["All", "Study aids", "Assessment", "Languages", "Writing", "Community"];

export function readListings() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AGENT_MARKETPLACE_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeListings(listings = []) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(AGENT_MARKETPLACE_STORAGE_KEY, JSON.stringify(Array.isArray(listings) ? listings : []));
  } catch {
    // Storage quota exceeded or unavailable; keep in-memory state only.
  }
}

export function removeListing(listingId) {
  const next = readListings().filter((listing) => listing.id !== listingId);
  writeListings(next);
  return next;
}

function field(name, label, type = "string", repeatScope = "per-output") {
  return { name, label, type, repeatScope };
}

function question(id, text, type = "text", options = [], required = true) {
  return { id, text, type, options, required };
}

/** Curated, fully working agents shown alongside community listings. */
export const STARTER_AGENTS = [
  {
    id: "starter-flashcards",
    name: "Flashcard Maker",
    tagline: "Turn any chapter into spaced-repetition flashcards.",
    description: "Reads your uploaded notes or textbook chapters and produces concise question/answer flashcards, grouped by concept, with a difficulty tag so students can start with the basics.",
    category: "Study aids",
    author: "LUNA",
    price: 0,
    pricingType: "pay-as-you-go",
    accent: "#2f6df6",
    agent: {
      name: "Flashcard Maker",
      instructions: "Create study flashcards from the reference material. Each card has a clear prompt on the front and a precise, self-contained answer on the back. Cover the key definitions, formulas, dates and cause/effect relationships. Avoid trivia. Tag each card with a difficulty of easy, medium or hard.",
      contextPrompt: "",
      questions: [
        question("q-count", "How many flashcards do you want?", "number"),
        question("q-level", "Which level are the students?", "single-select", ["Primary", "Secondary", "University"]),
        question("q-lang", "Language for the cards", "single-select", ["English", "Spanish", "French"], false)
      ],
      outputExample: "",
      template: { fields: [field("front", "Front"), field("back", "Back"), field("topic", "Topic"), field("difficulty", "Difficulty")] },
      model: "gpt-4o-mini",
      creativity: "low",
      scope: { workspaceId: "", subjectId: "", documentIds: [] }
    }
  },
  {
    id: "starter-exam",
    name: "Exam Question Writer",
    tagline: "Exam-style questions with model answers and marking notes.",
    description: "Generates exam questions at a chosen difficulty from your material, each with a model answer and short marking guidance, so teachers can assemble tests in minutes.",
    category: "Assessment",
    author: "LUNA",
    price: 4.99,
    pricingType: "monthly",
    accent: "#c2418a",
    agent: {
      name: "Exam Question Writer",
      instructions: "Write exam questions strictly grounded in the reference material. Mix question types (short answer, explain, apply, compare). For each question give a model answer and a one-line marking note describing what earns full marks. Match the requested difficulty and exam board style.",
      contextPrompt: "",
      questions: [
        question("q-count", "Number of questions", "number"),
        question("q-difficulty", "Difficulty", "single-select", ["Foundation", "Standard", "Higher"]),
        question("q-types", "Question types to include", "multi-select", ["Short answer", "Explain", "Apply", "Compare"], false)
      ],
      outputExample: "",
      template: { fields: [field("question", "Question"), field("modelAnswer", "Model answer"), field("marks", "Marks", "number"), field("markingNote", "Marking note")] },
      model: "gpt-4o",
      creativity: "low",
      scope: { workspaceId: "", subjectId: "", documentIds: [] }
    }
  },
  {
    id: "starter-vocab",
    name: "Vocabulary Builder",
    tagline: "Bilingual word lists with example sentences.",
    description: "Extracts the most useful vocabulary from a text and returns translations, part of speech and a natural example sentence for each word — ideal for language classes and parents helping at home.",
    category: "Languages",
    author: "LUNA",
    price: 0,
    pricingType: "pay-as-you-go",
    accent: "#0ea5a3",
    agent: {
      name: "Vocabulary Builder",
      instructions: "Select the most valuable vocabulary from the reference material for a learner at the requested level. For each word give the translation into the target language, the part of speech and one short example sentence in the source language that uses the word naturally.",
      contextPrompt: "",
      questions: [
        question("q-target", "Translate into", "single-select", ["Spanish", "English", "French", "German"]),
        question("q-count", "How many words?", "number"),
        question("q-level", "Learner level", "single-select", ["A1-A2", "B1-B2", "C1-C2"])
      ],
      outputExample: "",
      template: { fields: [field("word", "Word"), field("translation", "Translation"), field("partOfSpeech", "Part of speech"), field("example", "Example sentence")] },
      model: "gpt-4o-mini",
      creativity: "medium",
      scope: { workspaceId: "", subjectId: "", documentIds: [] }
    }
  }
];

/** Builds the `.agent.json` file payload used by AI Tools for a listing. */
export function buildAgentFileFromListing(listing, { workspaceId = "", subjectId = "" } = {}) {
  const agent = listing?.agent || {};
  const name = String(listing?.name || agent.name || "Untitled Agent").trim() || "Untitled Agent";
  const config = {
    ...agent,
    name,
    scope: { workspaceId, subjectId, documentIds: [] },
    installedFrom: { listingId: listing?.id || "", author: listing?.author || "", installedAt: new Date().toISOString() }
  };
  const content = JSON.stringify(config, null, 2);
  return { name: `${name}.agent.json`, content, sizeBytes: content.length };
}

export function listingInitials(name = "") {
  return String(name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("") || "?";
}
