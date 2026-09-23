/**
 * Ready-to-use templates. Each one is a clean, finished document built from the block system:
 * a header, the repeating content, a footer, and the views (student / answer key / print) that
 * make sense for it. They are the starting point in Template Studio and in the agent composer.
 */
import type { Element, Template, View } from "./types";
import { createField, createGroup, createLayout, createPage, createShape, createTemplate, createText, createView, defaultStyle } from "./model";

const INK = "#1f2a6b";
const SOFT = "#6e6e73";
const ACCENT = "#0071e3";

const tx = (fieldId: string, placeholder: string, frame: { x: number; y: number; w: number; h: number }, style: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  createText({ type: "field", fieldId }, { frame, placeholder, style: defaultStyle(style), ...extra });
const st = (value: string, frame: { x: number; y: number; w: number; h: number }, style: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  createText({ type: "static", value }, { frame, style: defaultStyle(style), ...extra });

/** Exam · A4, numbered question cards with options, a Student view and an Answer key view. */
export function createExamTemplate(): Template {
  const template = createTemplate("Exam");
  const title = createField("Title", "text", { description: "Exam title" });
  const subtitle = createField("Subtitle", "text", { description: "Course, class or date", required: false });
  const instructions = createField("Instructions", "text", { description: "One line telling the student what to do", required: false });
  const question = createField("Question", "rich_text", { description: "The question text" });
  const option = createField("Option", "text");
  const options = createField("Options", "array", { description: "Answer options", children: [option] });
  const answer = createField("Answer", "text", { description: "The correct option" });
  const explanation = createField("Explanation", "rich_text", { description: "Why it is correct — answer key only", required: false });
  const points = createField("Points", "number", { required: false });
  const questions = createField("Questions", "array", { description: "One element per question", sampleCount: 6, children: [createField("item", "object", { children: [question, options, answer, explanation, points] })] });
  template.fields = [title, subtitle, instructions, questions];

  const layout = template.layouts[0];
  layout.name = "Exam";
  const student = layout.views[0];
  student.name = "Student";
  student.description = "The version the student answers — no answers shown.";
  student.exports = ["pdf", "docx", "html_print"];
  const key: View = createView("Answer key", { description: "Same exam with the correct answer and the explanation.", exports: ["pdf", "docx"] });
  layout.views.push(key);

  const header = createGroup({
    name: "Header", frame: { x: 12, y: 12, w: 186, h: 30 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "first" },
    children: [
      tx(title.id, "Biology · Midterm exam", { x: 0, y: 0, w: 140, h: 11 }, { fontSize: 21, fontWeight: "bold", color: INK }),
      tx(subtitle.id, "Grade 10 · Spring 2026", { x: 140, y: 2, w: 46, h: 6 }, { fontSize: 9, color: SOFT, align: "right" }),
      st("Name: ______________________________", { x: 0, y: 14, w: 110, h: 6 }, { fontSize: 9.5, color: SOFT }),
      st("Date: ______________", { x: 130, y: 14, w: 56, h: 6 }, { fontSize: 9.5, color: SOFT, align: "right" }),
      tx(instructions.id, "Answer every question. Only one option is correct.", { x: 0, y: 22, w: 186, h: 6 }, { fontSize: 9, color: SOFT }),
      createShape("line", { frame: { x: 0, y: 29, w: 186, h: 0.5 }, style: defaultStyle({ stroke: ACCENT, strokeWidth: 0.5 }) })
    ]
  });

  const answerLine = tx(answer.id, "B. Absorb light energy", { x: 15, y: 30, w: 120, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: "#2f9e5b" }, { name: "Answer", visibility: { views: [key.id] } });
  const explanationLine = tx(explanation.id, "Chlorophyll captures the light used to convert CO₂ and water into glucose.", { x: 15, y: 35.5, w: 165, h: 6 }, { fontSize: 8, color: SOFT }, { name: "Explanation", format: "rich", visibility: { views: [key.id] } });

  const card = createGroup({
    name: "Question", frame: { x: 12, y: 46, w: 186, h: 42 }, layout: { mode: "free", gap: 3 },
    repeat: { fieldId: questions.id, mode: "flow" },
    pagination: { breakBefore: false, breakAfter: false, keepTogether: true, allowSplit: false, overflow: "continue" },
    style: defaultStyle({ fill: "#ffffff", stroke: "#e5e5ea", strokeWidth: 0.35, radius: 3 }),
    children: [
      createShape("ellipse", { frame: { x: 5, y: 5, w: 8, h: 8 }, style: defaultStyle({ fill: "#eaf3fd", stroke: "" }) }),
      st("{{n}}", { x: 5, y: 6.6, w: 8, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: ACCENT, align: "center" }),
      tx(question.id, "What is the main function of chlorophyll in plants?", { x: 15, y: 5, w: 150, h: 8 }, { fontSize: 11, fontWeight: "bold", color: INK }, { format: "rich" }),
      tx(points.id, "2", { x: 168, y: 5.5, w: 10, h: 5 }, { fontSize: 8, fontWeight: "bold", color: SOFT, align: "right" }),
      st("pts", { x: 178, y: 5.5, w: 6, h: 5 }, { fontSize: 8, color: SOFT }),
      createGroup({
        name: "Options", frame: { x: 15, y: 15, w: 165, h: 13 }, layout: { mode: "vertical", gap: 1.4 },
        repeat: { fieldId: options.id, mode: "flow" },
        children: [createGroup({
          name: "Option", frame: { x: 0, y: 0, w: 165, h: 6 }, layout: { mode: "free", gap: 0 }, repeat: null,
          children: [
            createShape("ellipse", { frame: { x: 0, y: 1, w: 4, h: 4 }, style: defaultStyle({ fill: "#ffffff", stroke: "#b9c6e8", strokeWidth: 0.35 }) }),
            tx(option.id, "Absorb light energy for photosynthesis", { x: 6.5, y: 0, w: 156, h: 6 }, { fontSize: 10, color: INK })
          ]
        })]
      }),
      answerLine,
      explanationLine
    ]
  });

  const footer = createGroup({
    name: "Footer", frame: { x: 12, y: 282, w: 186, h: 7 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "every" }, placement: "fixed",
    children: [
      createShape("line", { frame: { x: 0, y: 0, w: 186, h: 0.3 }, style: defaultStyle({ stroke: "#e5e5ea", strokeWidth: 0.3 }) }),
      tx(title.id, "Biology · Midterm exam", { x: 0, y: 1.5, w: 120, h: 5 }, { fontSize: 7.5, color: SOFT }),
      st("Page {{page}} of {{pages}}", { x: 126, y: 1.5, w: 60, h: 5 }, { fontSize: 7.5, color: SOFT, align: "right" })
    ]
  });

  layout.pages[0].elements = [header, card, footer] as Element[];
  return template;
}

/** Flashcards · A6 cards, one per item, with a topic ribbon. Front-only and front+back views. */
export function createFlashcardsTemplate(): Template {
  const template = createTemplate("Flashcards");
  const front = createField("Front", "text", { description: "The word, question or prompt" });
  const back = createField("Back", "text", { description: "The translation, answer or definition" });
  const topic = createField("Topic", "text", { description: "Topic or unit", required: false });
  const hint = createField("Hint", "text", { description: "Optional clue", required: false });
  const cards = createField("Cards", "array", { description: "One element per card", sampleCount: 8, children: [createField("item", "object", { children: [front, back, topic, hint] })] });
  template.fields = [cards];

  const layout = createLayout("Cards", "card-a6");
  template.layouts = [layout];
  const study = layout.views[0];
  study.name = "Study cards";
  study.description = "Front and back on the same card — for studying.";
  study.exports = ["pdf", "png"];
  const printView = createView("Front only", { description: "Only the prompt, to test yourself.", exports: ["pdf"] });
  layout.views.push(printView);

  const card = createGroup({
    name: "Card", frame: { x: 0, y: 0, w: 148, h: 105 }, layout: { mode: "free", gap: 0 },
    repeat: { fieldId: cards.id, mode: "page" },
    children: [
      createShape("rect", { frame: { x: 6, y: 6, w: 136, h: 93 }, style: defaultStyle({ fill: "#ffffff", stroke: "#d9e2f5", strokeWidth: 0.4, radius: 5 }) }),
      createShape("rect", { frame: { x: 6, y: 6, w: 136, h: 10 }, style: defaultStyle({ fill: "#eaf3fd", stroke: "", radius: 5 }) }),
      tx(topic.id, "Vocabulary · Unit 3", { x: 12, y: 8.5, w: 124, h: 6 }, { fontSize: 8, fontWeight: "bold", color: ACCENT }),
      tx(front.id, "perro", { x: 12, y: 30, w: 124, h: 18 }, { fontSize: 24, fontWeight: "bold", align: "center", color: INK }),
      tx(hint.id, "(animal)", { x: 12, y: 50, w: 124, h: 6 }, { fontSize: 9, align: "center", color: SOFT }),
      createShape("line", { frame: { x: 24, y: 62, w: 100, h: 0.3 }, style: defaultStyle({ stroke: "#d9e2f5", strokeWidth: 0.3 }) }),
      tx(back.id, "dog", { x: 12, y: 68, w: 124, h: 14 }, { fontSize: 15, align: "center", color: "#2f9e5b" }, { name: "Back", visibility: { views: [study.id] } })
    ]
  });
  layout.pages[0].elements = [card] as Element[];
  return template;
}

/** Vocabulary list · A4 table: word, translation, example. Study and gap-fill views. */
export function createVocabularyTemplate(): Template {
  const template = createTemplate("Vocabulary list");
  const title = createField("Title", "text", { description: "List title" });
  const subtitle = createField("Subtitle", "text", { description: "Languages, unit or level", required: false });
  const word = createField("Word", "text", { description: "The word in the first language" });
  const translation = createField("Translation", "text", { description: "Its translation" });
  const example = createField("Example", "text", { description: "A short sentence using the word", required: false });
  const words = createField("Words", "array", { description: "One element per word", sampleCount: 12, children: [createField("item", "object", { children: [word, translation, example] })] });
  template.fields = [title, subtitle, words];

  const layout = template.layouts[0];
  layout.name = "List";
  const full = layout.views[0];
  full.name = "Full list";
  full.description = "Word, translation and example — for studying.";
  full.exports = ["pdf", "docx", "html_print"];
  const practice = createView("Practice", { description: "Translations hidden, to fill in.", exports: ["pdf", "docx"] });
  layout.views.push(practice);

  const header = createGroup({
    name: "Header", frame: { x: 12, y: 12, w: 186, h: 24 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "first" },
    children: [
      tx(title.id, "Spanish · English vocabulary", { x: 0, y: 0, w: 186, h: 11 }, { fontSize: 20, fontWeight: "bold", color: INK }),
      tx(subtitle.id, "Unit 3 · 12 words", { x: 0, y: 12, w: 186, h: 6 }, { fontSize: 9.5, color: SOFT }),
      createShape("rect", { frame: { x: 0, y: 20, w: 24, h: 1.2 }, style: defaultStyle({ fill: ACCENT, stroke: "", radius: 0.6 }) })
    ]
  });

  const tableHead = createGroup({
    name: "Table header", frame: { x: 12, y: 40, w: 186, h: 8 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "every" },
    style: defaultStyle({ fill: "#eaf3fd", stroke: "", radius: 1.5 }),
    children: [
      st("Word", { x: 4, y: 1.8, w: 44, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: ACCENT }),
      st("Translation", { x: 54, y: 1.8, w: 44, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: ACCENT }),
      st("Example", { x: 104, y: 1.8, w: 78, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: ACCENT })
    ]
  });

  const row = createGroup({
    name: "Word row", frame: { x: 12, y: 50, w: 186, h: 10 }, layout: { mode: "free", gap: 0 },
    repeat: { fieldId: words.id, mode: "flow" },
    style: defaultStyle({ fill: "", stroke: "#eef0f4", strokeWidth: 0.25 }),
    children: [
      tx(word.id, "casa", { x: 4, y: 2.4, w: 46, h: 5.5 }, { fontSize: 10.5, fontWeight: "bold", color: INK }),
      tx(translation.id, "house", { x: 54, y: 2.4, w: 46, h: 5.5 }, { fontSize: 10.5, color: ACCENT }, { name: "Translation", visibility: { views: [full.id] } }),
      st("______________", { x: 54, y: 2.4, w: 46, h: 5.5 }, { fontSize: 10.5, color: "#c7c7cc" }, { name: "Blank", visibility: { views: [practice.id] } }),
      tx(example.id, "Mi casa es pequeña.", { x: 104, y: 2.4, w: 78, h: 5.5 }, { fontSize: 9.5, color: SOFT })
    ]
  });

  const footer = createGroup({
    name: "Footer", frame: { x: 12, y: 282, w: 186, h: 7 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "every" }, placement: "fixed",
    children: [
      createShape("line", { frame: { x: 0, y: 0, w: 186, h: 0.3 }, style: defaultStyle({ stroke: "#e5e5ea", strokeWidth: 0.3 }) }),
      tx(title.id, "Spanish · English vocabulary", { x: 0, y: 1.5, w: 120, h: 5 }, { fontSize: 7.5, color: SOFT }),
      st("Page {{page}} of {{pages}}", { x: 126, y: 1.5, w: 60, h: 5 }, { fontSize: 7.5, color: SOFT, align: "right" })
    ]
  });

  layout.pages[0].elements = [header, tableHead, row, footer] as Element[];
  return template;
}

export const STARTER_TEMPLATES = [
  { kind: "exam", name: "Exam", icon: "📝", description: "Numbered question cards with options · Student and Answer key views.", create: createExamTemplate },
  { kind: "flashcards", name: "Flashcards", icon: "🃏", description: "One A6 card per item, topic ribbon · Study and Front-only views.", create: createFlashcardsTemplate },
  { kind: "vocabulary", name: "Vocabulary list", icon: "🔤", description: "Word · translation · example table · Full list and Practice views.", create: createVocabularyTemplate }
] as const;

export function createStarter(kind: string): Template {
  return (STARTER_TEMPLATES.find((item) => item.kind === kind) || STARTER_TEMPLATES[0]).create();
}
