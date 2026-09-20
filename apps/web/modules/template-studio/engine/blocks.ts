/**
 * Blocks — pre-made, reusable objects (exam question card, flashcard, document structure…).
 *
 * A block packages a schema fragment (the fields it needs) with a group of elements bound to
 * those fields. Inserting a block merges the fields into the template's schema (reusing arrays
 * and fields with the same name), remaps ids, applies the chosen accent and places the group in
 * flow. Blocks are plain JSON so creators can save their own and sell them in the marketplace.
 */

import type { Element, FieldDef, GroupElement, ID, TextElement } from "./types";
import { createField, createGroup, createId, createShape, createText, defaultStyle, walkElements } from "./model";

export type BlockCategory = "questions" | "cards" | "structure" | "custom";

export interface BlockOptionDef {
  key: string;
  label: string;
  default: boolean;
}

export interface BlockDef {
  id: string;
  name: string;
  description: string;
  category: BlockCategory;
  icon: string;
  /** Component family (Question card, Header…) and the design variant within it. */
  family?: string;
  variant?: string;
  /** Schema fragment. Arrays carry their item fields; root scalars are "once per document". */
  fields: FieldDef[];
  /** Element tree (normally one group). Field bindings reference ids in `fields`. */
  elements: Element[];
  /** Toggles that show/hide elements tagged with `blockOption` in their name (e.g. "number|Question number"). */
  options?: BlockOptionDef[];
  /** Colours to replace with the chosen accent / tint on insert. */
  accent?: { main: string; tint: string };
  builtIn?: boolean;
  author?: string;
}

export interface AccentPreset { id: string; label: string; main: string; tint: string }

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "blue", label: "Blue", main: "#0071e3", tint: "#eaf3fd" },
  { id: "green", label: "Green", main: "#2f9e5b", tint: "#eaf7ee" },
  { id: "orange", label: "Orange", main: "#e0730f", tint: "#fdf1e4" },
  { id: "purple", label: "Purple", main: "#8a4fd6", tint: "#f3ecfb" },
  { id: "pink", label: "Rose", main: "#d8366f", tint: "#fceaf0" },
  { id: "graphite", label: "Graphite", main: "#1d1d1f", tint: "#f2f2f4" }
];

const A = ACCENT_PRESETS[0];

/** Elements can opt into a block toggle by naming themselves "opt:<key>|Label". */
export function optionKeyOf(element: Element): string | null {
  const match = /^opt:([a-z_]+)\|/i.exec(element.name || "");
  return match ? match[1] : null;
}
export function displayName(element: Element): string {
  return (element.name || "").replace(/^opt:[a-z_]+\|/i, "");
}

/* ---------------------------------------------------------------- built-in blocks */

function tx(fieldId: ID, placeholder: string, frame: TextElement["frame"], style: Partial<TextElement["style"]>, extra: Partial<TextElement> = {}): TextElement {
  return createText({ type: "field", fieldId }, { frame, placeholder, style: defaultStyle(style), ...extra });
}
function st(value: string, frame: TextElement["frame"], style: Partial<TextElement["style"]>, extra: Partial<TextElement> = {}): TextElement {
  return createText({ type: "static", value }, { frame, style: defaultStyle(style), ...extra });
}

function examQuestion(): BlockDef {
  const question = createField("Question", "rich_text", { description: "The question text." });
  const option = createField("Option", "text");
  const options = createField("Options", "array", { children: [option] });
  const answer = createField("Answer", "text", { description: "The correct option." });
  const points = createField("Points", "number");
  const questions = createField("Questions", "array", { children: [createField("item", "object", { children: [question, options, answer, points] })] });
  const group = createGroup({
    name: "Exam question",
    frame: { x: 12, y: 12, w: 186, h: 44 },
    layout: { mode: "free", gap: 2 },
    repeat: { fieldId: questions.id, mode: "flow" },
    style: defaultStyle({ fill: A.tint, stroke: "", radius: 3 }),
    children: [
      createShape("rect", { name: "opt:number|Number badge", frame: { x: 4, y: 4, w: 9, h: 9 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 4.5 }) }),
      st("{{n}}", { x: 4, y: 5.6, w: 9, h: 6 }, { fontSize: 9, fontWeight: "bold", color: "#ffffff", align: "center" }, { name: "opt:number|Number" }),
      tx(points.id, "2", { x: 160, y: 5.5, w: 16, h: 6 }, { fontSize: 8, fontWeight: "bold", color: A.main, align: "right" }, { name: "opt:points|Points" }),
      st("pts", { x: 176, y: 5.5, w: 7, h: 6 }, { fontSize: 8, color: A.main }, { name: "opt:points|Points label" }),
      tx(question.id, "What is the derivative of x²?", { x: 17, y: 5, w: 140, h: 9 }, { fontSize: 11, fontWeight: "bold" }, { format: "rich" }),
      createGroup({
        name: "Options",
        frame: { x: 17, y: 16, w: 160, h: 18 },
        layout: { mode: "vertical", gap: 1.2 },
        repeat: { fieldId: options.id, mode: "flow" },
        children: [
          createGroup({
            name: "Option row",
            frame: { x: 0, y: 0, w: 160, h: 5.5 },
            layout: { mode: "free", gap: 0 },
            repeat: null,
            children: [
              createShape("ellipse", { frame: { x: 0, y: 0.8, w: 4, h: 4 }, style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35 }) }),
              tx(option.id, "2x", { x: 6, y: 0, w: 150, h: 5.5 }, { fontSize: 10 })
            ]
          })
        ]
      }),
      st("Answer:", { x: 17, y: 36, w: 14, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: A.main }, { name: "opt:answer|Answer label" }),
      tx(answer.id, "2x", { x: 32, y: 36, w: 140, h: 5 }, { fontSize: 8.5, color: A.main }, { name: "opt:answer|Answer" })
    ]
  });
  return {
    id: "block-exam-question",
    family: "Question card",
    variant: "Multiple choice",
    name: "Exam question",
    description: "Numbered question card with options, points and an optional answer line.",
    category: "questions",
    icon: "❶",
    fields: [questions],
    elements: [group],
    options: [{ key: "number", label: "Question number", default: true }, { key: "points", label: "Points", default: true }, { key: "answer", label: "Show answer", default: false }],
    accent: A,
    builtIn: true
  };
}

function openQuestion(): BlockDef {
  const question = createField("Question", "rich_text");
  const points = createField("Points", "number");
  const questions = createField("Questions", "array", { children: [createField("item", "object", { children: [question, points] })] });
  const lines = [0, 1, 2].map((row) => createShape("line", { frame: { x: 17, y: 18 + row * 7, w: 160, h: 0.3 }, style: defaultStyle({ stroke: "#c7c7cc", strokeWidth: 0.3 }) }));
  const group = createGroup({
    name: "Open question",
    frame: { x: 12, y: 12, w: 186, h: 42 },
    layout: { mode: "free", gap: 2 },
    repeat: { fieldId: questions.id, mode: "flow" },
    style: defaultStyle({ fill: "", stroke: A.main, strokeWidth: 0.3, radius: 3 }),
    children: [
      createShape("rect", { name: "opt:number|Number badge", frame: { x: 4, y: 4, w: 9, h: 9 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 2 }) }),
      st("{{n}}", { x: 4, y: 5.6, w: 9, h: 6 }, { fontSize: 9, fontWeight: "bold", color: "#ffffff", align: "center" }, { name: "opt:number|Number" }),
      tx(points.id, "5", { x: 160, y: 5.5, w: 16, h: 6 }, { fontSize: 8, fontWeight: "bold", color: A.main, align: "right" }, { name: "opt:points|Points" }),
      st("pts", { x: 176, y: 5.5, w: 7, h: 6 }, { fontSize: 8, color: A.main }, { name: "opt:points|Points label" }),
      tx(question.id, "Explain why the median is robust to outliers.", { x: 17, y: 5, w: 140, h: 9 }, { fontSize: 11, fontWeight: "bold" }, { format: "rich" }),
      ...lines
    ]
  });
  return {
    id: "block-open-question",
    family: "Question card",
    variant: "Open answer",
    name: "Open question",
    description: "Question with ruled space for a written answer.",
    category: "questions",
    icon: "✎",
    fields: [questions],
    elements: [group],
    options: [{ key: "number", label: "Question number", default: true }, { key: "points", label: "Points", default: true }],
    accent: A,
    builtIn: true
  };
}

function trueFalse(): BlockDef {
  const statement = createField("Statement", "rich_text");
  const answer = createField("Answer", "boolean", { description: "true when the statement is correct." });
  const statements = createField("Statements", "array", { children: [createField("item", "object", { children: [statement, answer] })] });
  const group = createGroup({
    name: "True / false",
    frame: { x: 12, y: 12, w: 186, h: 12 },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: statements.id, mode: "flow" },
    style: defaultStyle({ fill: A.tint, stroke: "", radius: 2 }),
    children: [
      st("{{n}}.", { x: 4, y: 3.5, w: 8, h: 6 }, { fontSize: 9.5, fontWeight: "bold", color: A.main }, { name: "opt:number|Number" }),
      tx(statement.id, "The mean is always larger than the median.", { x: 13, y: 3.5, w: 128, h: 6 }, { fontSize: 10 }, { format: "rich" }),
      createShape("rect", { frame: { x: 146, y: 3.5, w: 4.5, h: 4.5 }, style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35, radius: 0.8 }) }),
      st("True", { x: 152, y: 3.5, w: 12, h: 5 }, { fontSize: 8.5 }),
      createShape("rect", { frame: { x: 166, y: 3.5, w: 4.5, h: 4.5 }, style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35, radius: 0.8 }) }),
      st("False", { x: 172, y: 3.5, w: 12, h: 5 }, { fontSize: 8.5 }),
      tx(answer.id, "true", { x: 146, y: 8.5, w: 36, h: 3.5 }, { fontSize: 6.5, color: A.main, align: "right" }, { name: "opt:answer|Answer" })
    ]
  });
  return {
    id: "block-true-false",
    family: "Question card",
    variant: "True / false",
    name: "True / false",
    description: "Statement with tick boxes; the answer can be shown for the key.",
    category: "questions",
    icon: "☑",
    fields: [statements],
    elements: [group],
    options: [{ key: "number", label: "Number", default: true }, { key: "answer", label: "Show answer", default: false }],
    accent: A,
    builtIn: true
  };
}

function flashcard(): BlockDef {
  const front = createField("Front", "text");
  const back = createField("Back", "text");
  const topic = createField("Topic", "text");
  const cards = createField("Cards", "array", { children: [createField("item", "object", { children: [front, back, topic] })] });
  const group = createGroup({
    name: "Flashcards",
    frame: { x: 12, y: 12, w: 186, h: 52 },
    layout: { mode: "grid", gap: 4, columns: 2 },
    repeat: { fieldId: cards.id, mode: "grid", columns: 2 },
    children: [
      createGroup({
        name: "Card",
        frame: { x: 0, y: 0, w: 90, h: 52 },
        layout: { mode: "free", gap: 0 },
        repeat: null,
        style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35, radius: 3 }),
        children: [
          createShape("rect", { frame: { x: 0, y: 0, w: 90, h: 7 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 0 }) }),
          tx(topic.id, "Vocabulary", { x: 4, y: 1.4, w: 82, h: 5 }, { fontSize: 7.5, fontWeight: "bold", color: "#ffffff" }, { name: "opt:topic|Topic" }),
          tx(front.id, "perro", { x: 4, y: 12, w: 82, h: 16 }, { fontSize: 18, fontWeight: "bold", align: "center" }),
          createShape("line", { frame: { x: 12, y: 32, w: 66, h: 0.3 }, style: defaultStyle({ stroke: A.tint === "#f2f2f4" ? "#c7c7cc" : A.main, strokeWidth: 0.3 }) }),
          tx(back.id, "dog", { x: 4, y: 35, w: 82, h: 12 }, { fontSize: 12, align: "center", color: "#6e6e73" })
        ]
      })
    ]
  });
  return {
    id: "block-flashcard",
    family: "Flashcard",
    variant: "Grid, topic ribbon",
    name: "Flashcard",
    description: "Front / back cards in a two-column grid with a topic ribbon.",
    category: "cards",
    icon: "▤",
    fields: [cards],
    elements: [group],
    options: [{ key: "topic", label: "Topic ribbon", default: true }],
    accent: A,
    builtIn: true
  };
}

function vocabularyRow(): BlockDef {
  const word = createField("Word", "text");
  const translation = createField("Translation", "text");
  const example = createField("Example", "text");
  const words = createField("Words", "array", { children: [createField("item", "object", { children: [word, translation, example] })] });
  const group = createGroup({
    name: "Vocabulary rows",
    frame: { x: 12, y: 12, w: 186, h: 30 },
    layout: { mode: "vertical", gap: 0 },
    repeat: null,
    children: [
      createGroup({
        name: "Header",
        frame: { x: 0, y: 0, w: 186, h: 7 },
        layout: { mode: "free", gap: 0 },
        repeat: null,
        style: defaultStyle({ fill: A.main, stroke: "", radius: 1.5 }),
        children: [
          st("Word", { x: 3, y: 1.5, w: 40, h: 5 }, { fontSize: 8, fontWeight: "bold", color: "#ffffff" }),
          st("Translation", { x: 48, y: 1.5, w: 40, h: 5 }, { fontSize: 8, fontWeight: "bold", color: "#ffffff" }),
          st("Example", { x: 96, y: 1.5, w: 80, h: 5 }, { fontSize: 8, fontWeight: "bold", color: "#ffffff" })
        ]
      }),
      createGroup({
        name: "Row",
        frame: { x: 0, y: 7, w: 186, h: 8 },
        layout: { mode: "free", gap: 0 },
        repeat: { fieldId: words.id, mode: "flow" },
        style: defaultStyle({ fill: "", stroke: "#e5e5ea", strokeWidth: 0.25 }),
        children: [
          tx(word.id, "casa", { x: 3, y: 2, w: 42, h: 5 }, { fontSize: 9.5, fontWeight: "bold" }),
          tx(translation.id, "house", { x: 48, y: 2, w: 42, h: 5 }, { fontSize: 9.5, color: A.main }),
          tx(example.id, "Mi casa es pequeña.", { x: 96, y: 2, w: 86, h: 5 }, { fontSize: 9, color: "#6e6e73" })
        ]
      })
    ]
  });
  return {
    id: "block-vocabulary-row",
    family: "Table",
    variant: "Vocabulary rows",
    name: "Vocabulary table",
    description: "Word · translation · example as a clean table with a coloured header.",
    category: "cards",
    icon: "▦",
    fields: [words],
    elements: [group],
    accent: A,
    builtIn: true
  };
}

function documentStructure(): BlockDef {
  const title = createField("Title", "text", { description: "Document title." });
  const subtitle = createField("Subtitle", "text");
  const heading = createField("Heading", "text");
  const body = createField("Body", "rich_text");
  const sections = createField("Sections", "array", { children: [createField("item", "object", { children: [heading, body] })] });
  const group = createGroup({
    name: "Document",
    frame: { x: 12, y: 12, w: 186, h: 60 },
    layout: { mode: "vertical", gap: 3 },
    repeat: null,
    children: [
      tx(title.id, "Key Concepts in Statistics", { x: 0, y: 0, w: 186, h: 12 }, { fontSize: 22, fontWeight: "bold" }),
      tx(subtitle.id, "A short guide for students", { x: 0, y: 12, w: 186, h: 7 }, { fontSize: 11, color: "#6e6e73" }, { name: "opt:subtitle|Subtitle" }),
      createShape("rect", { frame: { x: 0, y: 21, w: 24, h: 1.2 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 0.6 }) }),
      createGroup({
        name: "Section",
        frame: { x: 0, y: 26, w: 186, h: 22 },
        layout: { mode: "vertical", gap: 1.5 },
        repeat: { fieldId: sections.id, mode: "flow" },
        children: [
          tx(heading.id, "Central tendency", { x: 0, y: 0, w: 186, h: 7 }, { fontSize: 13, fontWeight: "bold", color: A.main }),
          tx(body.id, "The mean, median and mode describe where the centre of a distribution lies…", { x: 0, y: 8, w: 186, h: 12 }, { fontSize: 10, lineHeight: 1.45 }, { format: "rich" })
        ]
      })
    ]
  });
  return {
    id: "block-document",
    family: "Document structure",
    variant: "Title + sections",
    name: "Document structure",
    description: "Title, subtitle and repeating sections (heading + paragraph) — great for summaries and guides.",
    category: "structure",
    icon: "≡",
    fields: [title, subtitle, sections],
    elements: [group],
    options: [{ key: "subtitle", label: "Subtitle", default: true }],
    accent: A,
    builtIn: true
  };
}

function keyPoints(): BlockDef {
  const title = createField("Title", "text");
  const point = createField("Point", "rich_text");
  const points = createField("Points", "array", { children: [createField("item", "object", { children: [point] })] });
  const group = createGroup({
    name: "Key points",
    frame: { x: 12, y: 12, w: 186, h: 40 },
    layout: { mode: "vertical", gap: 2.5 },
    repeat: null,
    children: [
      tx(title.id, "Three things to remember", { x: 0, y: 0, w: 186, h: 9 }, { fontSize: 16, fontWeight: "bold" }, { name: "opt:title|Title" }),
      createGroup({
        name: "Point",
        frame: { x: 0, y: 12, w: 186, h: 10 },
        layout: { mode: "free", gap: 0 },
        repeat: { fieldId: points.id, mode: "flow" },
        style: defaultStyle({ fill: A.tint, stroke: "", radius: 2 }),
        children: [
          createShape("rect", { frame: { x: 0, y: 0, w: 1.6, h: 10 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 0.8 }) }),
          st("{{n}}", { x: 4, y: 2.5, w: 6, h: 5 }, { fontSize: 10, fontWeight: "bold", color: A.main }, { name: "opt:number|Number" }),
          tx(point.id, "**Central tendency:** the median resists outliers.", { x: 11, y: 2.5, w: 170, h: 6 }, { fontSize: 10 }, { format: "rich" })
        ]
      })
    ]
  });
  return {
    id: "block-key-points",
    family: "Key points",
    variant: "Numbered rows",
    name: "Key points",
    description: "Title plus numbered highlight rows with an accent bar.",
    category: "structure",
    icon: "•",
    fields: [title, points],
    elements: [group],
    options: [{ key: "title", label: "Title", default: true }, { key: "number", label: "Numbers", default: true }],
    accent: A,
    builtIn: true
  };
}


/* ---------------------------------------------------------------- more families */

function examHeader(): BlockDef {
  const title = createField("Title", "text", { description: "Document title" });
  const subtitle = createField("Subtitle", "text", { description: "Course, class or subject" });
  const group = createGroup({
    name: "Header",
    frame: { x: 12, y: 12, w: 186, h: 26 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    pageScope: { mode: "first" },
    children: [
      createShape("ellipse", { frame: { x: 0, y: 1, w: 5, h: 5 }, style: defaultStyle({ fill: A.main, stroke: "" }) }),
      st("LUNA", { x: 6.5, y: 0.2, w: 30, h: 7 }, { fontSize: 13, fontWeight: "bold" }, { name: "opt:logo|Logo" }),
      tx(subtitle.id, "Biology · Grade 10", { x: 120, y: 1, w: 66, h: 5 }, { fontSize: 8, color: "#6e6e73", align: "right" }, { name: "opt:subtitle|Subtitle" }),
      tx(title.id, "Biology Midterm Exam", { x: 0, y: 9, w: 140, h: 9 }, { fontSize: 18, fontWeight: "bold" }),
      st("Name: ______________________", { x: 0, y: 20, w: 90, h: 5 }, { fontSize: 8.5, color: "#6e6e73" }, { name: "opt:namedate|Name line" }),
      st("Date: ____________", { x: 130, y: 20, w: 56, h: 5 }, { fontSize: 8.5, color: "#6e6e73", align: "right" }, { name: "opt:namedate|Date line" }),
      createShape("line", { frame: { x: 0, y: 25.5, w: 186, h: 0.4 }, style: defaultStyle({ stroke: A.main, strokeWidth: 0.4 }) })
    ]
  });
  return { id: "block-header-exam", family: "Header", variant: "Exam header", name: "Header", description: "Logo, title, subtitle and Name / Date lines on the first page.", category: "structure", icon: "▔", fields: [title, subtitle], elements: [group], options: [{ key: "logo", label: "Logo", default: true }, { key: "subtitle", label: "Subtitle", default: true }, { key: "namedate", label: "Name / Date", default: true }], accent: A, builtIn: true };
}

function minimalHeader(): BlockDef {
  const title = createField("Title", "text", { description: "Document title" });
  const group = createGroup({
    name: "Header",
    frame: { x: 12, y: 12, w: 186, h: 16 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    pageScope: { mode: "first" },
    children: [
      tx(title.id, "Study guide", { x: 0, y: 0, w: 186, h: 10 }, { fontSize: 20, fontWeight: "bold", align: "center" }),
      createShape("rect", { frame: { x: 81, y: 12, w: 24, h: 1.2 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 0.6 }) })
    ]
  });
  return { id: "block-header-minimal", family: "Header", variant: "Centered title", name: "Header", description: "Centered title with an accent rule.", category: "structure", icon: "▔", fields: [title], elements: [group], accent: A, builtIn: true };
}

function footer(): BlockDef {
  const title = createField("Title", "text", { description: "Document title" });
  const group = createGroup({
    name: "Footer",
    frame: { x: 12, y: 280, w: 186, h: 8 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    pageScope: { mode: "every" },
    children: [
      createShape("line", { frame: { x: 0, y: 0, w: 186, h: 0.3 }, style: defaultStyle({ stroke: "#d2d2d7", strokeWidth: 0.3 }) }),
      tx(title.id, "Biology Midterm Exam", { x: 0, y: 2, w: 120, h: 5 }, { fontSize: 7.5, color: "#6e6e73" }),
      st("Page {{page}}", { x: 140, y: 2, w: 46, h: 5 }, { fontSize: 7.5, color: "#6e6e73", align: "right" }, { name: "opt:page|Page number" })
    ]
  });
  return { id: "block-footer", family: "Footer", variant: "Title + page number", name: "Footer", description: "Thin rule, document title and page number on every page.", category: "structure", icon: "▁", fields: [title], elements: [group], options: [{ key: "page", label: "Page number", default: true }], accent: A, builtIn: true };
}

function sectionHeader(): BlockDef {
  const title = createField("Section title", "text");
  const intro = createField("Section intro", "text", { description: "One-line instruction for the section" });
  const sections = createField("Sections", "array", { children: [createField("item", "object", { children: [title, intro] })] });
  const group = createGroup({
    name: "Section header",
    frame: { x: 12, y: 12, w: 186, h: 20 },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: sections.id, mode: "flow" },
    children: [
      createShape("rect", { frame: { x: 0, y: 0, w: 24, h: 5.5 }, style: defaultStyle({ fill: A.tint, stroke: "", radius: 1.2 }) }),
      st("SECTION {{n}}", { x: 0, y: 1, w: 24, h: 4 }, { fontSize: 6.5, fontWeight: "bold", color: A.main, align: "center" }),
      tx(title.id, "Multiple choice", { x: 0, y: 7, w: 186, h: 8 }, { fontSize: 15, fontWeight: "bold" }),
      tx(intro.id, "Choose the correct answer for each question. Only one option is correct.", { x: 0, y: 15, w: 186, h: 5 }, { fontSize: 8.5, color: "#6e6e73" }, { name: "opt:intro|Intro line" })
    ]
  });
  return { id: "block-section-header", family: "Section header", variant: "Badge + title", name: "Section header", description: "Numbered section badge, title and intro line — one per section.", category: "structure", icon: "§", fields: [sections], elements: [group], options: [{ key: "intro", label: "Intro line", default: true }], accent: A, builtIn: true };
}

function sectionWithQuestions(): BlockDef {
  const title = createField("Section title", "text");
  const intro = createField("Section intro", "text", { description: "One-line instruction for the section" });
  const question = createField("Question", "rich_text");
  const option = createField("Option", "text");
  const options = createField("Options", "array", { children: [option] });
  const answer = createField("Answer", "text", { description: "The correct option" });
  const questions = createField("Questions", "array", { children: [createField("item", "object", { children: [question, options, answer] })] });
  const sections = createField("Sections", "array", { description: "One element per section: its title, intro and its own questions", children: [createField("item", "object", { children: [title, intro, questions] })] });
  const card = createGroup({
    name: "Question card",
    frame: { x: 0, y: 22, w: 186, h: 34 },
    layout: { mode: "free", gap: 2 },
    repeat: { fieldId: questions.id, mode: "flow" },
    style: defaultStyle({ fill: "#ffffff", stroke: "#e5e5ea", strokeWidth: 0.3, radius: 2.5 }),
    children: [
      createShape("ellipse", { frame: { x: 4, y: 4, w: 7, h: 7 }, style: defaultStyle({ fill: A.tint, stroke: "" }) }),
      st("{{n}}", { x: 4, y: 5.4, w: 7, h: 5 }, { fontSize: 7.5, fontWeight: "bold", color: A.main, align: "center" }),
      tx(question.id, "What is the main function of chlorophyll in plants?", { x: 15, y: 4.5, w: 165, h: 8 }, { fontSize: 10.5, fontWeight: "bold" }, { format: "rich" }),
      createGroup({
        name: "Options",
        frame: { x: 15, y: 14, w: 165, h: 16 },
        layout: { mode: "vertical", gap: 1.2 },
        repeat: { fieldId: options.id, mode: "flow" },
        children: [createGroup({ name: "Option row", frame: { x: 0, y: 0, w: 165, h: 5.5 }, layout: { mode: "free", gap: 0 }, repeat: null, children: [
          createShape("ellipse", { frame: { x: 0, y: 0.8, w: 4, h: 4 }, style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35 }) }),
          tx(option.id, "Absorb light energy for photosynthesis", { x: 6, y: 0, w: 155, h: 5.5 }, { fontSize: 9.5 })
        ] })]
      }),
      tx(answer.id, "B", { x: 15, y: 31, w: 100, h: 3 }, { fontSize: 7, color: A.main }, { name: "opt:answer|Answer" })
    ]
  });
  const group = createGroup({
    name: "Section",
    frame: { x: 12, y: 12, w: 186, h: 58 },
    layout: { mode: "free", gap: 3 },
    repeat: { fieldId: sections.id, mode: "flow" },
    children: [
      createShape("rect", { frame: { x: 0, y: 0, w: 24, h: 5.5 }, style: defaultStyle({ fill: A.tint, stroke: "", radius: 1.2 }) }),
      st("SECTION {{n}}", { x: 0, y: 1, w: 24, h: 4 }, { fontSize: 6.5, fontWeight: "bold", color: A.main, align: "center" }),
      tx(title.id, "Multiple choice", { x: 0, y: 7, w: 186, h: 8 }, { fontSize: 15, fontWeight: "bold" }),
      tx(intro.id, "Choose the correct answer for each question.", { x: 0, y: 15, w: 186, h: 5 }, { fontSize: 8.5, color: "#6e6e73" }, { name: "opt:intro|Intro line" }),
      card
    ]
  });
  return { id: "block-section-questions", family: "Section header", variant: "Section with question cards", name: "Section + questions", description: "Sections in the agent's order, each with its title and its own question cards.", category: "questions", icon: "§❶", fields: [sections], elements: [group], options: [{ key: "intro", label: "Intro line", default: true }, { key: "answer", label: "Show answer", default: false }], accent: A, builtIn: true };
}

function callout(): BlockDef {
  const note = createField("Note", "rich_text", { description: "Important information, tip or reminder" });
  const group = createGroup({
    name: "Callout",
    frame: { x: 12, y: 12, w: 186, h: 16 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    style: defaultStyle({ fill: A.tint, stroke: "", radius: 2.5 }),
    children: [
      createShape("rect", { frame: { x: 0, y: 0, w: 1.6, h: 16 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 0.8 }) }),
      st("Important", { x: 6, y: 2.5, w: 60, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: A.main }, { name: "opt:label|Label" }),
      tx(note.id, "Remember: photosynthesis only occurs in the presence of light and chlorophyll.", { x: 6, y: 8, w: 175, h: 7 }, { fontSize: 9.5 }, { format: "rich" })
    ]
  });
  return { id: "block-callout", family: "Callout", variant: "Info box", name: "Callout", description: "Highlighted box for important information, tips or notes.", category: "structure", icon: "ⓘ", fields: [note], elements: [group], options: [{ key: "label", label: "Label", default: true }], accent: A, builtIn: true };
}

function answerBox(): BlockDef {
  const answer = createField("Answer", "text");
  const explanation = createField("Explanation", "rich_text");
  const items = createField("Answers", "array", { children: [createField("item", "object", { children: [answer, explanation] })] });
  const green = ACCENT_PRESETS[1];
  const group = createGroup({
    name: "Answer box",
    frame: { x: 12, y: 12, w: 186, h: 22 },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: items.id, mode: "flow" },
    style: defaultStyle({ fill: green.tint, stroke: `${green.main}`, strokeWidth: 0.3, radius: 2.5 }),
    children: [
      createShape("ellipse", { frame: { x: 4, y: 3.5, w: 5, h: 5 }, style: defaultStyle({ fill: green.main, stroke: "" }) }),
      st("✓", { x: 4, y: 4.2, w: 5, h: 4 }, { fontSize: 7, fontWeight: "bold", color: "#ffffff", align: "center" }),
      st("Correct answer {{n}}", { x: 11, y: 3.5, w: 80, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: green.main }),
      tx(answer.id, "B. Absorb light energy for photosynthesis", { x: 11, y: 9, w: 170, h: 5.5 }, { fontSize: 9.5, fontWeight: "bold" }),
      tx(explanation.id, "Chlorophyll absorbs light energy, which is used to convert CO₂ and H₂O into glucose.", { x: 11, y: 15, w: 170, h: 6 }, { fontSize: 8.5, color: "#3a3a3c" }, { format: "rich", name: "opt:explanation|Explanation" })
    ]
  });
  return { id: "block-answer-box", family: "Answer box", variant: "Correct answer + explanation", name: "Answer box", description: "Green box with the correct answer and an explanation — ideal for answer keys.", category: "questions", icon: "✓", fields: [items], elements: [group], options: [{ key: "explanation", label: "Explanation", default: true }], accent: green, builtIn: true };
}

function flashcardSingle(): BlockDef {
  const front = createField("Front", "text");
  const back = createField("Back", "text");
  const cards = createField("Cards", "array", { children: [createField("item", "object", { children: [front, back] })] });
  const group = createGroup({
    name: "Flashcard",
    frame: { x: 12, y: 12, w: 186, h: 60 },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: cards.id, mode: "page" },
    style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.4, radius: 4 }),
    children: [
      st("FRONT", { x: 6, y: 5, w: 30, h: 4 }, { fontSize: 6.5, fontWeight: "bold", color: A.main }),
      tx(front.id, "Photosynthesis", { x: 6, y: 14, w: 174, h: 16 }, { fontSize: 24, fontWeight: "bold", align: "center" }),
      createShape("line", { frame: { x: 20, y: 36, w: 146, h: 0.3 }, style: defaultStyle({ stroke: A.main, strokeWidth: 0.3 }) }),
      tx(back.id, "The process by which plants convert light energy into chemical energy.", { x: 12, y: 40, w: 162, h: 14 }, { fontSize: 11, align: "center", color: "#6e6e73" })
    ]
  });
  return { id: "block-flashcard-single", family: "Flashcard", variant: "One card per page / slide", name: "Flashcard", description: "Large front / back card, one per page or slide.", category: "cards", icon: "▤", fields: [cards], elements: [group], accent: A, builtIn: true };
}

function compactQuestion(): BlockDef {
  const question = createField("Question", "rich_text");
  const option = createField("Option", "text");
  const options = createField("Options", "array", { children: [option] });
  const questions = createField("Questions", "array", { children: [createField("item", "object", { children: [question, options] })] });
  const group = createGroup({
    name: "Question (compact)",
    frame: { x: 12, y: 12, w: 186, h: 16 },
    layout: { mode: "free", gap: 1 },
    repeat: { fieldId: questions.id, mode: "flow" },
    children: [
      st("{{n}}.", { x: 0, y: 0, w: 8, h: 6 }, { fontSize: 10, fontWeight: "bold", color: A.main }),
      tx(question.id, "Which organelle is the powerhouse of the cell?", { x: 8, y: 0, w: 178, h: 6 }, { fontSize: 10, fontWeight: "bold" }, { format: "rich" }),
      createGroup({
        name: "Options",
        frame: { x: 8, y: 7, w: 178, h: 8 },
        layout: { mode: "grid", gap: 2, columns: 2 },
        repeat: { fieldId: options.id, mode: "grid", columns: 2 },
        children: [createGroup({ name: "Option", frame: { x: 0, y: 0, w: 86, h: 5 }, layout: { mode: "free", gap: 0 }, repeat: null, children: [
          st("○", { x: 0, y: 0, w: 4, h: 5 }, { fontSize: 9, color: A.main }),
          tx(option.id, "Mitochondrion", { x: 5, y: 0, w: 80, h: 5 }, { fontSize: 9 })
        ] })]
      })
    ]
  });
  return { id: "block-question-compact", family: "Question card", variant: "Compact, options in 2 columns", name: "Question (compact)", description: "Numbered question with options in two columns — fits many per page.", category: "questions", icon: "❶", fields: [questions], elements: [group], accent: A, builtIn: true };
}


function mixedQuestions(): BlockDef {
  const type = createField("Type", "text", { description: "multiple_choice, true_false or open — decides which design is used", options: ["multiple_choice", "true_false", "open"] });
  const question = createField("Question", "rich_text");
  const option = createField("Option", "text");
  const options = createField("Options", "array", { children: [option] });
  const answer = createField("Answer", "text", { description: "The correct option, true/false, or a model answer" });
  const questions = createField("Questions", "array", { children: [createField("item", "object", { children: [type, question, options, answer] })] });
  const numberBadge = () => [
    createShape("rect", { name: "opt:number|Number badge", frame: { x: 4, y: 4, w: 9, h: 9 }, style: defaultStyle({ fill: A.main, stroke: "", radius: 4.5 }) }),
    st("{{n}}", { x: 4, y: 5.6, w: 9, h: 6 }, { fontSize: 9, fontWeight: "bold", color: "#ffffff", align: "center" }, { name: "opt:number|Number" })
  ];
  const mc = createGroup({
    name: "Multiple choice", frame: { x: 0, y: 0, w: 186, h: 36 }, layout: { mode: "free", gap: 2 }, repeat: null,
    condition: { fieldId: type.id, equals: "multiple_choice" },
    style: defaultStyle({ fill: A.tint, stroke: "", radius: 3 }),
    children: [
      ...numberBadge(),
      tx(question.id, "Which organelle produces ATP?", { x: 17, y: 5, w: 160, h: 8 }, { fontSize: 11, fontWeight: "bold" }, { format: "rich" }),
      createGroup({ name: "Options", frame: { x: 17, y: 15, w: 160, h: 18 }, layout: { mode: "vertical", gap: 1.2 }, repeat: { fieldId: options.id, mode: "flow" }, children: [
        createGroup({ name: "Option row", frame: { x: 0, y: 0, w: 160, h: 5.5 }, layout: { mode: "free", gap: 0 }, repeat: null, children: [
          createShape("ellipse", { frame: { x: 0, y: 0.8, w: 4, h: 4 }, style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35 }) }),
          tx(option.id, "Mitochondrion", { x: 6, y: 0, w: 150, h: 5.5 }, { fontSize: 10 })
        ] })
      ] }),
      tx(answer.id, "B", { x: 17, y: 32, w: 100, h: 3 }, { fontSize: 7, color: A.main }, { name: "opt:answer|Answer" })
    ]
  });
  const tf = createGroup({
    name: "True / false", frame: { x: 0, y: 0, w: 186, h: 14 }, layout: { mode: "free", gap: 0 }, repeat: null,
    condition: { fieldId: type.id, equals: "true_false" },
    style: defaultStyle({ fill: A.tint, stroke: "", radius: 3 }),
    children: [
      ...numberBadge(),
      tx(question.id, "The mitochondrion has its own DNA.", { x: 17, y: 5, w: 120, h: 6 }, { fontSize: 10.5, fontWeight: "bold" }, { format: "rich" }),
      createShape("rect", { frame: { x: 142, y: 5, w: 4.5, h: 4.5 }, style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35, radius: 0.8 }) }),
      st("True", { x: 148, y: 5, w: 12, h: 5 }, { fontSize: 8.5 }),
      createShape("rect", { frame: { x: 162, y: 5, w: 4.5, h: 4.5 }, style: defaultStyle({ fill: "#ffffff", stroke: A.main, strokeWidth: 0.35, radius: 0.8 }) }),
      st("False", { x: 168, y: 5, w: 14, h: 5 }, { fontSize: 8.5 }),
      tx(answer.id, "true", { x: 142, y: 10, w: 40, h: 3 }, { fontSize: 6.5, color: A.main, align: "right" }, { name: "opt:answer|Answer" })
    ]
  });
  const open = createGroup({
    name: "Open answer", frame: { x: 0, y: 0, w: 186, h: 38 }, layout: { mode: "free", gap: 0 }, repeat: null,
    condition: { fieldId: type.id, equals: "open" },
    style: defaultStyle({ fill: "", stroke: A.main, strokeWidth: 0.3, radius: 3 }),
    children: [
      ...numberBadge(),
      tx(question.id, "Explain how ATP is produced in the mitochondrion.", { x: 17, y: 5, w: 160, h: 8 }, { fontSize: 11, fontWeight: "bold" }, { format: "rich" }),
      ...[0, 1, 2].map((row) => createShape("line", { frame: { x: 17, y: 18 + row * 6.5, w: 160, h: 0.3 }, style: defaultStyle({ stroke: "#c7c7cc", strokeWidth: 0.3 }) })),
      tx(answer.id, "Model answer…", { x: 17, y: 34, w: 160, h: 3 }, { fontSize: 6.5, color: A.main }, { name: "opt:answer|Answer" })
    ]
  });
  const group = createGroup({
    name: "Question (any type)", frame: { x: 12, y: 12, w: 186, h: 38 }, layout: { mode: "free", gap: 2 },
    repeat: { fieldId: questions.id, mode: "flow" },
    children: [mc, tf, open]
  });
  return { id: "block-question-mixed", family: "Question card", variant: "Mixed — design chosen by question Type", name: "Question (any type)", description: "One spot, three designs: multiple choice, true/false or open — the agent's Type field decides, in its order.", category: "questions", icon: "❶⁄", fields: [questions], elements: [group], options: [{ key: "number", label: "Question number", default: true }, { key: "answer", label: "Show answer", default: false }], accent: A, builtIn: true };
}

export function builtInBlocks(): BlockDef[] {
  return [examHeader(), minimalHeader(), sectionHeader(), sectionWithQuestions(), mixedQuestions(), examQuestion(), compactQuestion(), openQuestion(), trueFalse(), answerBox(), flashcard(), flashcardSingle(), vocabularyRow(), callout(), documentStructure(), keyPoints(), footer()];
}

/** Blocks grouped by family, in library order. */
export function blockFamilies(blocks: BlockDef[]): { family: string; variants: BlockDef[] }[] {
  const out: { family: string; variants: BlockDef[] }[] = [];
  for (const block of blocks) {
    const family = block.family || block.name;
    const entry = out.find((item) => item.family === family);
    if (entry) entry.variants.push(block); else out.push({ family, variants: [block] });
  }
  return out;
}

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = { questions: "Questions", cards: "Cards & tables", structure: "Document structure", custom: "My blocks" };

/* ---------------------------------------------------------------- insertion */

export interface InsertOptions {
  accent?: AccentPreset;
  toggles?: Record<string, boolean>;
}

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Merges block fields into the template's schema, reusing same-named fields; returns the id map. */
function mergeFields(existing: FieldDef[], incoming: FieldDef[], idMap: Map<ID, ID>): FieldDef[] {
  const out = existing.map((item) => ({ ...item }));
  for (const field of incoming) {
    const match = out.find((item) => item.name.toLowerCase() === field.name.toLowerCase() && item.type === field.type);
    if (!match) {
      const copy = cloneDeep(field);
      remapField(copy, idMap);
      out.push(copy);
      continue;
    }
    idMap.set(field.id, match.id);
    if (field.options && !match.options) match.options = field.options;
    if (field.type === "array" && field.children?.[0] && match.children?.[0]) {
      const incomingItem = field.children[0];
      const matchItem = match.children[0];
      if (incomingItem.type === "object" && matchItem.type === "object") {
        matchItem.children = mergeFields(matchItem.children || [], incomingItem.children || [], idMap);
        idMap.set(incomingItem.id, matchItem.id);
      } else {
        idMap.set(incomingItem.id, matchItem.id);
      }
    } else if (field.type === "object" && match.type === "object") {
      match.children = mergeFields(match.children || [], field.children || [], idMap);
    }
  }
  return out;
}

function remapField(field: FieldDef, idMap: Map<ID, ID>): void {
  const next = createId("fld");
  idMap.set(field.id, next);
  field.id = next;
  field.children?.forEach((child) => remapField(child, idMap));
}

function replaceColor(value: string | undefined, from: string, to: string): string | undefined {
  return value && value.toLowerCase() === from.toLowerCase() ? to : value;
}

export function instantiateBlock(block: BlockDef, templateFields: FieldDef[], options: InsertOptions = {}): { fields: FieldDef[]; elements: Element[] } {
  const idMap = new Map<ID, ID>();
  const fields = mergeFields(templateFields, block.fields, idMap);
  const elements = cloneDeep(block.elements);
  const toggles = options.toggles || {};
  const hidden = new Set((block.options || []).filter((option) => toggles[option.key] === false || (toggles[option.key] === undefined && !option.default)).map((option) => option.key));
  const from = block.accent || A;
  const to = options.accent ? { main: options.accent.main, tint: options.accent.tint } : from;

  const remapElements = (list: Element[]): Element[] =>
    list
      .filter((element) => { const key = optionKeyOf(element); return !key || !hidden.has(key); })
      .map((element) => {
        const next = { ...element, id: createId("el"), name: displayName(element) || element.name } as Element;
        next.style = {
          ...next.style,
          fill: replaceColor(replaceColor(next.style.fill, from.main, to.main), from.tint, to.tint),
          stroke: replaceColor(next.style.stroke, from.main, to.main),
          color: replaceColor(next.style.color, from.main, to.main)
        };
        if ((next.type === "text" || next.type === "image") && next.source.type === "field") {
          next.source = { type: "field", fieldId: idMap.get(next.source.fieldId) || next.source.fieldId };
        }
        if (next.type === "group") {
          const group = next as GroupElement;
          group.repeat = group.repeat ? { ...group.repeat, fieldId: idMap.get(group.repeat.fieldId) || group.repeat.fieldId } : null;
          if (group.condition) group.condition = { ...group.condition, fieldId: idMap.get(group.condition.fieldId) || group.condition.fieldId };
          group.children = remapElements(group.children);
        }
        return next;
      });

  const instantiated = remapElements(elements);
  // Remember the source block on the top-level group so the simple editor can rebuild or regroup it.
  for (const element of instantiated) if (element.type === "group" && !element.origin) element.origin = { blockId: block.id };
  return { fields, elements: instantiated };
}

/* ---------------------------------------------------------------- save a selection as a block */

/** Collects the fields a group references (with their parent arrays) so the block is self-contained. */
export function blockFromElements(elements: Element[], templateFields: FieldDef[], meta: { name: string; description?: string; author?: string }): BlockDef {
  const used = new Set<ID>();
  walkElements(elements, (element) => {
    if ((element.type === "text" || element.type === "image") && element.source.type === "field") used.add(element.source.fieldId);
    if (element.type === "group" && element.repeat) used.add(element.repeat.fieldId);
    if (element.type === "group" && element.condition) used.add(element.condition.fieldId);
  });
  const prune = (fields: FieldDef[]): FieldDef[] =>
    fields
      .map((field) => {
        const children = field.children ? prune(field.children) : undefined;
        const keep = used.has(field.id) || (children && children.length > 0);
        if (!keep) return null;
        const copy: FieldDef = { ...field };
        // An array keeps its single item definition; the item keeps only the members that are used.
        if (field.type === "array" && field.children?.[0]) copy.children = children?.length ? children : field.children;
        else if (children) copy.children = children;
        return copy;
      })
      .filter((field): field is FieldDef => Boolean(field));
  return {
    id: `block-${createId("u")}`,
    name: meta.name,
    description: meta.description || "",
    category: "custom",
    icon: "★",
    fields: prune(templateFields),
    elements: cloneDeep(elements),
    author: meta.author,
    builtIn: false
  };
}

/* ---------------------------------------------------------------- user block library (localStorage until accounts exist) */

export const BLOCK_LIBRARY_KEY = "luna.templateBlocks.v1";

export function readBlockLibrary(): BlockDef[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BLOCK_LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
export function writeBlockLibrary(blocks: BlockDef[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BLOCK_LIBRARY_KEY, JSON.stringify(blocks));
  } catch {
    // quota / private mode — keep in memory
  }
}
export function saveBlockToLibrary(block: BlockDef): BlockDef[] {
  const next = [...readBlockLibrary().filter((item) => item.id !== block.id), block];
  writeBlockLibrary(next);
  return next;
}
export function removeBlockFromLibrary(id: string): BlockDef[] {
  const next = readBlockLibrary().filter((item) => item.id !== id);
  writeBlockLibrary(next);
  return next;
}

/* ---------------------------------------------------------------- agent-ordered content (sequence) */

export interface SequenceChoice { block: BlockDef; typeValue: string }

/** Fields a block contributes to one element of the sequence: its list's item fields, or its scalars. */
function blockItemFields(block: BlockDef): FieldDef[] {
  const out: FieldDef[] = [];
  for (const field of block.fields) {
    if (field.type === "array") {
      const item = field.children?.[0];
      if (item?.type === "object") out.push(...(item.children || []));
      else if (item) out.push(item);
    } else if (field.type !== "object") out.push(field);
  }
  return out;
}

/**
 * Builds ONE block from several designs: a list ("Content") whose elements carry a "Type"; each
 * chosen design is shown only for its type value. The agent decides the order — the user only
 * decides which designs are allowed and how they look.
 */
export function buildSequenceBlock(input: SequenceChoice[], listName = "Content"): BlockDef {
  // Type values must be unique within a set: a second copy of the same design becomes "…_2".
  const seen = new Map<string, number>();
  const choices = input.map((choice) => {
    const base = choice.typeValue || "design";
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return { ...choice, typeValue: count === 1 ? base : `${base}_${count}` };
  });
  const typeField = createField("Type", "text", { description: `Which design this element uses: ${choices.map((c) => c.typeValue).join(", ")}`, options: choices.map((c) => c.typeValue) });
  const itemFields: FieldDef[] = [typeField];
  const elements: Element[] = [];
  let maxH = 0;
  for (const { block, typeValue } of choices) {
    itemFields.push(...cloneDeep(blockItemFields(block)));
    const source = cloneDeep(block.elements[0]);
    const inner: GroupElement = source.type === "group"
      ? { ...source, repeat: null, pageScope: { mode: "page" }, frame: { ...source.frame, x: 0, y: 0 } }
      : createGroup({ name: block.name, frame: { x: 0, y: 0, w: source.frame.w, h: source.frame.h }, layout: { mode: "free", gap: 0 }, repeat: null, children: [{ ...source, frame: { ...source.frame, x: 0, y: 0 } }] });
    inner.name = block.variant ? `${block.family || block.name} · ${block.variant}` : block.name;
    inner.condition = { fieldId: typeField.id, equals: typeValue };
    inner.origin = { blockId: block.id, typeValue };
    elements.push(inner);
    maxH = Math.max(maxH, inner.frame.h);
  }
  const list = createField(listName, "array", { description: "Elements in the agent's order; each says its Type", children: [createField("item", "object", { children: itemFields })] });
  const group = createGroup({
    name: `${listName} (agent order)`,
    frame: { x: 12, y: 12, w: 186, h: maxH },
    layout: { mode: "free", gap: 3 },
    repeat: { fieldId: list.id, mode: "flow" },
    children: elements
  });
  return {
    id: `block-sequence-${createId("s")}`,
    name: `${listName} (agent order)`,
    description: `One of ${choices.length} designs per element, chosen by Type: ${choices.map((c) => c.typeValue).join(" · ")}.`,
    category: "custom",
    icon: "⇅",
    family: "Agent-ordered content",
    fields: [list],
    elements: [group],
    builtIn: false
  };
}

export function typeValueFor(block: BlockDef): string {
  return (block.variant && block.family ? `${block.family} ${block.variant}` : block.name).toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);
}

/** Finds a block by id in the built-in library or the user's saved blocks. */
export function findBlock(blockId: string): BlockDef | null {
  return builtInBlocks().find((b) => b.id === blockId) || readBlockLibrary().find((b) => b.id === blockId) || null;
}

/** Default Type value for a block inside an agent-ordered set: the variant when the family has several, else the family. */
export function defaultTypeValue(block: BlockDef): string {
  const slugify = (text: string) => text.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);
  const family = blockFamilies(builtInBlocks()).find((f) => f.variants.some((v) => v.id === block.id));
  if (!family) return slugify(block.name);
  return family.variants.length > 1 ? slugify((block.variant || block.name).split(",")[0].split(" — ")[0]) : slugify(family.family);
}

/** The members of an agent-ordered set (a sequence group), in order. */
export function sequenceMembers(group: GroupElement): { child: GroupElement; block: BlockDef | null; typeValue: string }[] {
  return group.children.filter((child): child is GroupElement => child.type === "group" && Boolean(child.condition?.fieldId)).map((child) => ({ child, block: child.origin ? findBlock(child.origin.blockId) : null, typeValue: child.condition!.equals }));
}

export function isSequenceGroup(element: Element): element is GroupElement {
  return element.type === "group" && Boolean(element.repeat) && element.children.some((child) => child.type === "group" && Boolean(child.condition?.fieldId));
}
