/**
 * Ready-to-use templates. Each one is a clean, finished document built from the block system:
 * a header, the repeating content, a footer, and the views (student / answer key / print) that
 * make sense for it. They are the starting point in Template Studio and in the agent composer.
 */
import type { Element, Template, View } from "./types";
import { createField, createGroup, createLayout, createPage, createShape, createTemplate, createText, createView, defaultStyle } from "./model";
import { INK as PALETTE_INK, TYPE, palette } from "./design";

/** The starters use the same design language as the components, so a document made of both agrees. */
const BLUE = palette("blue");
const GREEN = palette("green");
const INK = PALETTE_INK.strong;
const SOFT = PALETTE_INK.muted;
const ACCENT = BLUE.main;

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
    name: "Header", frame: { x: 12, y: 12, w: 186, h: 34 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "first" },
    children: [
      createShape("rect", { name: "Title band", frame: { x: 0, y: 0, w: 186, h: 20 }, style: defaultStyle({ fill: "#eaf3fd", stroke: "", radius: 4 }) }),
      createShape("rect", { name: "Accent", frame: { x: 0, y: 0, w: 3, h: 20 }, style: defaultStyle({ fill: ACCENT, stroke: "", radius: 1.5 }) }),
      tx(title.id, "Biology · Midterm exam", { x: 8, y: 3.5, w: 132, h: 9 }, { fontSize: TYPE.title, fontWeight: "bold", color: INK }),
      tx(subtitle.id, "Grade 10 · Spring 2026", { x: 8, y: 13, w: 132, h: 5 }, { fontSize: TYPE.small, color: SOFT }),
      st("Name", { x: 146, y: 4, w: 12, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: ACCENT }),
      createShape("line", { frame: { x: 158, y: 8.5, w: 24, h: 0.3 }, style: defaultStyle({ stroke: PALETTE_INK.faint, strokeWidth: 0.3 }) }),
      st("Date", { x: 146, y: 12, w: 12, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: ACCENT }),
      createShape("line", { frame: { x: 158, y: 16.5, w: 24, h: 0.3 }, style: defaultStyle({ stroke: PALETTE_INK.faint, strokeWidth: 0.3 }) }),
      tx(instructions.id, "Answer every question. Only one option is correct.", { x: 0, y: 23, w: 186, h: 6 }, { fontSize: TYPE.small, color: SOFT })
    ]
  });

  const answerBand = createShape("rect", { name: "Answer band", frame: { x: 15, y: 28.5, w: 166, h: 13 }, style: defaultStyle({ fill: GREEN.tint, stroke: "", radius: 3 }) });
  (answerBand as unknown as { visibility: { views: string[] } }).visibility = { views: [] };
  const answerLine = tx(answer.id, "B. Absorb light energy", { x: 19, y: 30, w: 120, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: GREEN.deep }, { name: "Answer", visibility: { views: [key.id] } });
  const explanationLine = tx(explanation.id, "Chlorophyll captures the light used to convert CO₂ and water into glucose.", { x: 19, y: 35.5, w: 158, h: 6 }, { fontSize: TYPE.meta, color: SOFT }, { name: "Explanation", format: "rich", visibility: { views: [key.id] } });

  const card = createGroup({
    name: "Question", frame: { x: 12, y: 50, w: 186, h: 42 }, layout: { mode: "free", gap: 4 },
    repeat: { fieldId: questions.id, mode: "flow" },
    pagination: { breakBefore: false, breakAfter: false, keepTogether: true, allowSplit: false, overflow: "continue" },
    style: defaultStyle({ fill: "#f7faff", stroke: BLUE.soft, strokeWidth: 0.35, radius: 4 }),
    children: [
      createShape("rect", { name: "Edge", frame: { x: 0, y: 0, w: 2.5, h: 40 }, style: defaultStyle({ fill: ACCENT, stroke: "", radius: 1.2 }) }),
      createShape("ellipse", { frame: { x: 5, y: 5, w: 8, h: 8 }, style: defaultStyle({ fill: ACCENT, stroke: "" }) }),
      st("{{n}}", { x: 5, y: 6.6, w: 8, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: "#ffffff", align: "center" }),
      tx(question.id, "What is the main function of chlorophyll in plants?", { x: 15, y: 5, w: 150, h: 8 }, { fontSize: TYPE.question, fontWeight: "bold", color: INK }, { format: "rich" }),
      createShape("rect", { name: "Points pill", frame: { x: 166, y: 5, w: 15, h: 5.6 }, style: defaultStyle({ fill: BLUE.soft, stroke: "", radius: 2.8 }) }),
      tx(points.id, "2", { x: 167.5, y: 6, w: 6, h: 4.4 }, { fontSize: TYPE.meta, fontWeight: "bold", color: BLUE.deep, align: "right" }),
      st("pts", { x: 174.5, y: 6, w: 6, h: 4.4 }, { fontSize: TYPE.micro, color: BLUE.deep }),
      createGroup({
        name: "Options", frame: { x: 15, y: 15, w: 165, h: 13 }, layout: { mode: "vertical", gap: 1.4 },
        repeat: { fieldId: options.id, mode: "flow" },
        children: [createGroup({
          name: "Option", frame: { x: 0, y: 0, w: 165, h: 7 }, layout: { mode: "free", gap: 0 }, repeat: null,
          children: [
            createShape("rect", { name: "Pill", frame: { x: 0, y: 0, w: 165, h: 7 }, style: defaultStyle({ fill: "#ffffff", stroke: BLUE.soft, strokeWidth: 0.3, radius: 3.5 }) }),
            createShape("ellipse", { frame: { x: 2.2, y: 1.2, w: 4.6, h: 4.6 }, style: defaultStyle({ fill: "#ffffff", stroke: BLUE.line, strokeWidth: 0.35 }) }),
            // {{A}} letters the options A, B, C — an exam paper the student can write an answer on.
            st("{{A}}", { x: 2.2, y: 2, w: 4.6, h: 4 }, { fontSize: TYPE.micro, fontWeight: "bold", color: BLUE.deep, align: "center" }),
            tx(option.id, "Absorb light energy for photosynthesis", { x: 9, y: 0.6, w: 152, h: 6 }, { fontSize: TYPE.body, color: INK })
          ]
        })]
      }),
      { ...answerBand, visibility: { views: [key.id] } } as Element,
      answerLine,
      explanationLine
    ]
  });

  const footer = createGroup({
    name: "Footer", frame: { x: 12, y: 282, w: 186, h: 7 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "every" }, placement: "fixed",
    children: [
      createShape("line", { frame: { x: 0, y: 0, w: 186, h: 0.3 }, style: defaultStyle({ stroke: PALETTE_INK.hairline, strokeWidth: 0.3 }) }),
      tx(title.id, "Biology · Midterm exam", { x: 0, y: 1.5, w: 120, h: 5 }, { fontSize: TYPE.micro, color: SOFT }),
      st("Page {{page}} of {{pages}}", { x: 126, y: 1.5, w: 60, h: 5 }, { fontSize: TYPE.micro, color: SOFT, align: "right" })
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
      createShape("rect", { name: "Cut line", frame: { x: 4, y: 4, w: 140, h: 97 }, style: defaultStyle({ fill: "#ffffff", stroke: BLUE.line, strokeWidth: 0.3, radius: 6 }) }),
      createShape("rect", { name: "Ribbon", frame: { x: 4, y: 4, w: 140, h: 13 }, style: defaultStyle({ fill: ACCENT, stroke: "", radius: 6 }) }),
      createShape("rect", { name: "Ribbon base", frame: { x: 4, y: 12, w: 140, h: 5 }, style: defaultStyle({ fill: ACCENT, stroke: "" }) }),
      tx(topic.id, "Vocabulary · Unit 3", { x: 11, y: 7, w: 126, h: 7 }, { fontSize: TYPE.meta, fontWeight: "bold", color: "#ffffff" }),
      tx(front.id, "perro", { x: 11, y: 30, w: 126, h: 18 }, { fontSize: 25, fontWeight: "bold", align: "center", color: INK }),
      tx(hint.id, "(animal)", { x: 11, y: 50, w: 126, h: 6 }, { fontSize: TYPE.small, align: "center", color: SOFT }),
      createShape("rect", { name: "Back panel", frame: { x: 11, y: 62, w: 126, h: 22 }, style: defaultStyle({ fill: GREEN.tint, stroke: "", radius: 4 }), visibility: { views: [study.id] } }),
      tx(back.id, "dog", { x: 14, y: 68, w: 120, h: 14 }, { fontSize: 16, fontWeight: "bold", align: "center", color: GREEN.deep }, { name: "Back", visibility: { views: [study.id] } }),
      st("✂ cut here", { x: 11, y: 90, w: 126, h: 5 }, { fontSize: TYPE.micro, color: PALETTE_INK.faint, align: "center" })
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
    name: "Header", frame: { x: 12, y: 12, w: 186, h: 26 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "first" },
    children: [
      createShape("rect", { name: "Band", frame: { x: 0, y: 0, w: 186, h: 22 }, style: defaultStyle({ fill: BLUE.tint, stroke: "", radius: 4 }) }),
      createShape("rect", { name: "Accent", frame: { x: 0, y: 0, w: 3, h: 22 }, style: defaultStyle({ fill: ACCENT, stroke: "", radius: 1.5 }) }),
      tx(title.id, "Spanish · English vocabulary", { x: 8, y: 3.5, w: 176, h: 10 }, { fontSize: TYPE.title, fontWeight: "bold", color: INK }),
      tx(subtitle.id, "Unit 3 · 12 words", { x: 8, y: 14, w: 176, h: 6 }, { fontSize: TYPE.small, color: SOFT })
    ]
  });

  const tableHead = createGroup({
    name: "Table header", frame: { x: 12, y: 42, w: 186, h: 9 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "every" },
    style: defaultStyle({ fill: ACCENT, stroke: "", radius: 3 }),
    children: [
      st("Word", { x: 5, y: 2.2, w: 44, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: "#ffffff" }),
      st("Translation", { x: 55, y: 2.2, w: 44, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: "#ffffff" }),
      st("Example", { x: 105, y: 2.2, w: 76, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: "#ffffff" })
    ]
  });

  const row = createGroup({
    name: "Word row", frame: { x: 12, y: 53, w: 186, h: 11 }, layout: { mode: "free", gap: 0 },
    repeat: { fieldId: words.id, mode: "flow" },
    style: defaultStyle({ fill: "#ffffff", stroke: PALETTE_INK.hairline, strokeWidth: 0.25, radius: 2 }),
    children: [
      createShape("rect", { name: "Marker", frame: { x: 0, y: 0, w: 1.6, h: 11 }, style: defaultStyle({ fill: BLUE.soft, stroke: "" }) }),
      tx(word.id, "casa", { x: 5, y: 2.8, w: 46, h: 5.5 }, { fontSize: TYPE.body, fontWeight: "bold", color: INK }),
      tx(translation.id, "house", { x: 55, y: 2.8, w: 46, h: 5.5 }, { fontSize: TYPE.body, color: ACCENT }, { name: "Translation", visibility: { views: [full.id] } }),
      st("______________", { x: 55, y: 2.8, w: 46, h: 5.5 }, { fontSize: TYPE.body, color: PALETTE_INK.faint }, { name: "Blank", visibility: { views: [practice.id] } }),
      tx(example.id, "Mi casa es pequeña.", { x: 105, y: 2.8, w: 76, h: 5.5 }, { fontSize: TYPE.small, color: SOFT })
    ]
  });

  const footer = createGroup({
    name: "Footer", frame: { x: 12, y: 282, w: 186, h: 7 }, layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "every" }, placement: "fixed",
    children: [
      createShape("line", { frame: { x: 0, y: 0, w: 186, h: 0.3 }, style: defaultStyle({ stroke: PALETTE_INK.hairline, strokeWidth: 0.3 }) }),
      tx(title.id, "Spanish · English vocabulary", { x: 0, y: 1.5, w: 120, h: 5 }, { fontSize: TYPE.micro, color: SOFT }),
      st("Page {{page}} of {{pages}}", { x: 126, y: 1.5, w: 60, h: 5 }, { fontSize: TYPE.micro, color: SOFT, align: "right" })
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
