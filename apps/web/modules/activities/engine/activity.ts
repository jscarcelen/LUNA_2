/**
 * Activities — the interactive form of a generated document. Any block that implies an answer
 * from the student (multiple choice, true/false, fill in the blanks, math, matching, flashcards)
 * becomes a question the child answers on the platform; results are stored as attempts so
 * performance can be tracked per question, topic and activity.
 */
import type { FieldDef } from "../../template-studio/engine/types";

export type QuestionKind = "choice" | "boolean" | "text" | "number" | "match" | "flashcard";

export interface ActivityQuestion {
  id: string;
  kind: QuestionKind;
  prompt: string;
  /** Section / group label when the item came from a nested list. */
  group?: string;
  options?: string[];
  pairs?: { left: string; right: string }[];
  /** Expected answer(s): option text, "true"/"false", text/number, or left→right map for matching. */
  answer: string | Record<string, string>;
  /** Extra info shown after checking (explanation, model answer…). */
  explanation?: string;
  difficulty?: string;
  topic?: string;
  /** Flashcard back side. */
  back?: string;
}

export interface Activity {
  id: string;
  title: string;
  subtitle?: string;
  questions: ActivityQuestion[];
  meta: { templateId?: string; agentId?: string; agentName?: string; createdAt: string };
}

export interface Attempt {
  activityId: string;
  activityTitle: string;
  at: string;
  score: number;
  total: number;
  durationMs?: number;
  results: { id: string; kind: QuestionKind; prompt: string; group?: string; topic?: string; difficulty?: string; correct: boolean | null; given: string; expected: string }[];
}

type Row = Record<string, unknown>;

const slug = (name: string) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const text = (value: unknown): string => (value === undefined || value === null ? "" : Array.isArray(value) ? value.map(text).join(", ") : typeof value === "object" ? JSON.stringify(value) : String(value));
const norm = (value: unknown) => text(value).trim().toLowerCase().replace(/\s+/g, " ").replace(/[.,;:!?"'()]/g, "");

function pick(row: Row, ...names: string[]): unknown {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => slug(k) === name || slug(k).endsWith(`_${name}`));
    if (key !== undefined && row[key] !== undefined && row[key] !== "") return row[key];
  }
  return undefined;
}

/** Questions derived from one list of items. */
function questionsFromList(items: Row[], listName: string, group: string | undefined, out: ActivityQuestion[]): void {
  // Matching lists (left ↔ right) become ONE matching question.
  const isPairs = items.length > 1 && items.every((item) => pick(item, "left") !== undefined && pick(item, "right") !== undefined);
  if (isPairs) {
    const pairs = items.map((item) => ({ left: text(pick(item, "left")), right: text(pick(item, "right")) }));
    out.push({ id: `${slug(listName)}_match`, kind: "match", prompt: group || "Match each pair", group, pairs, answer: Object.fromEntries(pairs.map((p) => [p.left, p.right])) });
    return;
  }
  items.forEach((item, index) => {
    const id = `${slug(listName)}_${index + 1}`;
    const prompt = text(pick(item, "question", "sentence", "statement", "problem", "prompt", "front", "word", "left", "text"));
    const options = pick(item, "options", "choices");
    const answer = pick(item, "answer", "correct", "solution", "right", "back", "translation");
    const explanation = text(pick(item, "explanation", "hint"));
    const difficulty = text(pick(item, "difficulty", "level"));
    const topic = text(pick(item, "topic", "category"));
    // Nested lists (sections → questions) recurse with the section title as the group label.
    for (const [key, value] of Object.entries(item)) {
      if (Array.isArray(value) && value.length && typeof value[0] === "object" && value[0] !== null && slug(key) !== "options" && slug(key) !== "choices") {
        questionsFromList(value as Row[], `${listName}_${key}`, text(pick(item, "section_title", "title", "heading", "name")) || group, out);
      }
    }
    if (!prompt) return;
    if (Array.isArray(options) && options.length && answer !== undefined) {
      const opts = options.map(text);
      // The answer may be the option text or its letter/index.
      const letter = norm(answer);
      const byLetter = /^[a-z]$/.test(letter) ? opts[letter.charCodeAt(0) - 97] : /^\d+$/.test(letter) ? opts[Number(letter) - 1] : undefined;
      out.push({ id, kind: "choice", prompt, group, options: opts, answer: byLetter || text(answer), explanation, difficulty, topic });
      return;
    }
    if (pick(item, "statement") !== undefined || typeof answer === "boolean" || ["true", "false"].includes(norm(answer))) {
      out.push({ id, kind: "boolean", prompt, group, answer: String(norm(answer) === "true" || answer === true), explanation, difficulty, topic });
      return;
    }
    if (pick(item, "front") !== undefined && pick(item, "back") !== undefined) {
      out.push({ id, kind: "flashcard", prompt, group, answer: text(pick(item, "back")), back: text(pick(item, "back")), topic, difficulty });
      return;
    }
    if (answer === undefined) return;
    const numeric = typeof answer === "number" || (/^-?\d+([.,]\d+)?$/.test(text(answer).trim()) && pick(item, "problem") !== undefined);
    out.push({ id, kind: numeric ? "number" : "text", prompt, group, answer: text(answer), explanation, difficulty, topic });
  });
}

/** Builds the interactive activity from a template/agent field tree and its data. */
export function buildActivity(fields: FieldDef[], data: Row, meta: Partial<Activity["meta"]> & { title?: string } = {}): Activity {
  const questions: ActivityQuestion[] = [];
  const rootText = (names: string[]) => { for (const f of fields) if (f.type !== "array" && names.includes(slug(f.name).replace(/^[a-z_]+?_(title|subtitle)$/, "$1"))) { const v = data[slug(f.name)]; if (v) return text(v); } return ""; };
  const title = meta.title || rootText(["title", "header_title", "document_title"]) || text(pick(data, "title")) || "Activity";
  const subtitle = rootText(["subtitle", "header_subtitle"]) || text(pick(data, "subtitle")) || undefined;
  for (const field of fields) {
    if (field.type !== "array") continue;
    const key = Object.keys(data).find((k) => slug(k) === slug(field.name)) || (field === fields.find((f) => f.type === "array") ? "items" : undefined);
    const rows = key ? data[key] : undefined;
    if (!Array.isArray(rows)) continue;
    if (rows.length && typeof rows[0] === "object" && rows[0] !== null) questionsFromList(rows as Row[], field.name, undefined, questions);
  }
  return { id: `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`, title, subtitle, questions, meta: { createdAt: new Date().toISOString(), templateId: meta.templateId, agentId: meta.agentId, agentName: meta.agentName } };
}

export function hasAnswerableContent(fields: FieldDef[], data: Row): boolean {
  return buildActivity(fields, data).questions.length > 0;
}

/** Checks the student's answers. Flashcards are self-assessed (given = "known" | "unknown"). */
export function gradeActivity(activity: Activity, answers: Record<string, unknown>, startedAt?: number): Attempt {
  const results: Attempt["results"] = activity.questions.map((question) => {
    const given = answers[question.id];
    let correct: boolean | null = null;
    let expected = "";
    if (question.kind === "match") {
      const map = question.answer as Record<string, string>;
      const g = (given || {}) as Record<string, string>;
      correct = Object.entries(map).every(([left, right]) => norm(g[left]) === norm(right));
      expected = Object.entries(map).map(([l, r]) => `${l} → ${r}`).join(" · ");
    } else if (question.kind === "flashcard") {
      correct = given === "known" ? true : given === "unknown" ? false : null;
      expected = question.back || "";
    } else if (question.kind === "number") {
      const a = Number(String(question.answer).replace(",", "."));
      const b = Number(String(given ?? "").replace(",", "."));
      correct = Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) < 1e-9 : norm(given) === norm(question.answer);
      expected = String(question.answer);
    } else {
      correct = given === undefined || given === "" ? false : norm(given) === norm(question.answer);
      expected = String(question.answer);
    }
    return { id: question.id, kind: question.kind, prompt: question.prompt, group: question.group, topic: question.topic, difficulty: question.difficulty, correct, given: typeof given === "object" && given ? Object.entries(given as Record<string, string>).map(([l, r]) => `${l} → ${r}`).join(" · ") : text(given), expected };
  });
  const graded = results.filter((r) => r.correct !== null);
  return { activityId: activity.id, activityTitle: activity.title, at: new Date().toISOString(), score: graded.filter((r) => r.correct).length, total: graded.length, durationMs: startedAt ? Date.now() - startedAt : undefined, results };
}
