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
import { INK, PAGE, PALETTES, RADIUS, SPACE, TYPE, ANSWER_INSET, accentEdge, accentMark, answerBand, cardStyle, chip, confidenceRow, divider, field, kicker, label, numberBadge, optionRow, palette, pointsPill, writingLine } from "./design";

export type BlockCategory = "questions" | "cards" | "structure" | "kids" | "custom";

export interface BlockOptionDef {
  key: string;
  label: string;
  default: boolean;
  /** Extra height (mm) the card needs while this option is on, e.g. the source line under an answer. */
  grow?: number;
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

/** The accents a template can be recoloured with — the same palettes the components are built from. */
export const ACCENT_PRESETS: AccentPreset[] = PALETTES.map(({ id, label: name, main, tint }) => ({ id, label: name, main, tint }));

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

/** Moves a piece built at x = 0 into place, so a row of parts can be composed once and reused. */
function shift<T extends Element>(element: T, dx: number, dy = 0): T {
  return { ...element, frame: { ...element.frame, x: element.frame.x + dx, y: element.frame.y + dy } };
}

/** A tick box and its word — True / False, or anything else that gets ticked. */
function tickBox(accent: ReturnType<typeof palette>, x: number, y: number, word: string): Element[] {
  return [
    createShape("rect", { frame: { x, y, w: 4.6, h: 4.6 }, style: defaultStyle({ fill: INK.paper, stroke: accent.line, strokeWidth: 0.35, radius: 0.9 }) }),
    label(word, { x: x + 6, y: y + 0.2, w: 16, h: 4.6 }, { fontSize: TYPE.small, color: INK.body })
  ];
}

/**
 * The teaching components, built from the design language in `design.ts`.
 *
 * Each one is a real piece of print design: a white card with a hairline and a generous radius, a
 * coloured badge for structure, lettered options, an answer band that only appears in the key, and
 * enough room around everything that a page of them reads as a document rather than a form.
 */

function examQuestion(): BlockDef {
  const accent = palette("blue");
  const question = createField("Question", "rich_text", { description: "The question text." });
  const option = createField("Option", "text", { description: "One answer option text, e.g. 'Absorbs light energy for photosynthesis'" });
  const options = createField("Options", "array", { children: [option] });
  const answer = createField("Answer", "text", { description: "The letter of the correct option: A, B, C or D" });
  const points = createField("Points", "number", { description: "Point value for this question, e.g. 2" });
  // Classification: used by the platform to measure mistakes by skill and difficulty (never printed).
  const skill = createField("Skill", "text", { description: "What this question tests: concept, definition, vocabulary, calculation, problem solving, application, comprehension, recall or analysis", options: ["concept", "definition", "vocabulary", "calculation", "problem solving", "application", "comprehension", "recall", "analysis"], required: false });
  const difficulty = createField("Difficulty", "text", { description: "easy, medium or hard", options: ["easy", "medium", "hard"], required: false });
  const source = createField("Source", "text", { description: "Where in the material the answer is found: document and passage", required: false });
  const sourceLink = createField("Source link", "text", { description: "Link to that passage (filled by Luna)", required: false });
  const questions = createField("Questions", "array", { children: [createField("item", "object", { children: [question, options, answer, points, skill, difficulty, source, sourceLink] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "Exam question",
    fitContent: true,
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 52 },
    layout: { mode: "free", gap: SPACE.md },
    repeat: { fieldId: questions.id, mode: "flow" },
    style: cardStyle(accent, "plain", { squareLeft: true }),
    children: [
      accentEdge(accent, 52),
      ...numberBadge(accent, 6, 6),
      ...pointsPill(accent, points.id, W - 20, 6.6),
      field(question.id, "Which organelle absorbs light energy for photosynthesis?", { x: 17, y: 6.4, w: W - 40, h: 9 }, { fontSize: TYPE.question, fontWeight: "bold", color: INK.strong, lineHeight: 1.3 }, { format: "rich" }),
      createGroup({
        name: "Options",
        frame: { x: 17, y: 18, w: W - 24, h: 20 },
        layout: { mode: "vertical", gap: 1.6 },
        repeat: { fieldId: options.id, mode: "flow" },
        children: [optionRow(accent, option.id, W - 24)]
      }),
      ...confidenceRow(accent, 40, W - 24).map((element) => shift(element, 17)),
      ...answerBand(accent, answer.id, 46, W).map((element) => element),
      field(source.id, "Source: Accounting.pdf · passage 12", { x: ANSWER_INSET, y: 53.2, w: W - 2 * ANSWER_INSET, h: 8 }, { fontSize: TYPE.meta, color: INK.muted, lineHeight: 1.3 }, { name: "opt:answer|Source", linkFieldId: sourceLink.id, collapseEmpty: true })
    ]
  });
  return {
    id: "block-exam-question",
    family: "Multiple choice",
    variant: "Lettered options",
    name: "Exam question",
    description: "Numbered card with lettered options, points, an optional confidence check and an answer band for the key.",
    category: "questions",
    icon: "❶",
    fields: [questions],
    elements: [group],
    options: [
      { key: "number", label: "Question number", default: true },
      { key: "points", label: "Points", default: true },
      { key: "confidence", label: "How sure are you? (High / Medium / Low)", default: true },
      { key: "answer", label: "Show answer", default: false, grow: 10 }
    ],
    accent: { main: accent.main, tint: accent.tint },
    builtIn: true
  };
}

function openQuestion(): BlockDef {
  const accent = palette("blue");
  const question = createField("Question", "rich_text", { description: "The question text" });
  const points = createField("Points", "number", { description: "Point value for this question, e.g. 2" });
  const answer = createField("Answer", "rich_text", { description: "A model answer or marking guide, 1–3 sentences", required: false });
  const source = createField("Source", "text", { description: "Where in the material the answer is found: document and passage", required: false });
  const sourceLink = createField("Source link", "text", { description: "Link to that passage (filled by Luna)", required: false });
  const questions = createField("Questions", "array", { children: [createField("item", "object", { children: [question, points, answer, source, sourceLink] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "Open question",
    fitContent: true,
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 64 },
    layout: { mode: "free", gap: SPACE.md },
    repeat: { fieldId: questions.id, mode: "flow" },
    style: cardStyle(accent, "plain", { squareLeft: true }),
    children: [
      accentEdge(accent, 64),
      ...numberBadge(accent, 6, 6),
      ...pointsPill(accent, points.id, W - 20, 6.6),
      field(question.id, "Explain why the median resists outliers.", { x: 17, y: 6.4, w: W - 40, h: 9 }, { fontSize: TYPE.question, fontWeight: "bold", color: INK.strong, lineHeight: 1.3 }, { format: "rich" }),
      ...[0, 1, 2, 3].map((row) => writingLine(20 + row * 7.5, 17, W - 28)),
      ...confidenceRow(accent, 44, W - 24).map((element) => shift(element, 17)),
      // The model answer sits in a taller band than a multiple-choice letter: it is a sentence or two.
      createShape("rect", { name: "opt:answer|Answer band", frame: { x: ANSWER_INSET, y: 51, w: W - 2 * ANSWER_INSET, h: 11.4 }, style: defaultStyle({ fill: palette("green").tint, stroke: "", radius: RADIUS.panel }) }),
      kicker("Answer", { x: ANSWER_INSET + 4, y: 52.6, w: 22, h: 4 }, palette("green").deep, { name: "opt:answer|Answer label" }),
      field(answer.id, "The median is the middle value, so extreme values do not move it.", { x: ANSWER_INSET + 27, y: 52.3, w: W - 2 * ANSWER_INSET - 31, h: 8.4 }, { fontSize: TYPE.small, fontWeight: "bold", color: palette("green").deep, lineHeight: 1.35 }, { format: "rich", name: "opt:answer|Answer" }),
      field(source.id, "Source: Accounting.pdf · passage 12", { x: ANSWER_INSET, y: 63.6, w: W - 2 * ANSWER_INSET, h: 8 }, { fontSize: TYPE.meta, color: INK.muted, lineHeight: 1.3 }, { name: "opt:answer|Source", linkFieldId: sourceLink.id, collapseEmpty: true })
    ]
  });
  return {
    id: "block-open-question",
    family: "Open answer",
    variant: "Ruled lines",
    name: "Open question",
    description: "Question with ruled space to write in, points, an optional confidence check and a model answer for the key.",
    category: "questions",
    icon: "✎",
    fields: [questions],
    elements: [group],
    options: [
      { key: "number", label: "Question number", default: true },
      { key: "points", label: "Points", default: true },
      { key: "confidence", label: "How sure are you? (High / Medium / Low)", default: true },
      { key: "answer", label: "Show answer", default: false, grow: 10 }
    ],
    accent: { main: accent.main, tint: accent.tint },
    builtIn: true
  };
}

function trueFalse(): BlockDef {
  const accent = palette("blue");
  const statement = createField("Statement", "rich_text", { description: "A declarative sentence that is either factually correct or incorrect" });
  const answer = createField("Answer", "boolean", { description: "true when the statement is correct." });
  const source = createField("Source", "text", { description: "Where in the material the answer is found: document and passage", required: false });
  const sourceLink = createField("Source link", "text", { description: "Link to that passage (filled by Luna)", required: false });
  const statements = createField("Statements", "array", { children: [createField("item", "object", { children: [statement, answer, source, sourceLink] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "True / false",
    fitContent: true,
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 16 },
    layout: { mode: "free", gap: SPACE.md },
    repeat: { fieldId: statements.id, mode: "flow" },
    style: cardStyle(accent, "plain", { squareLeft: true }),
    children: [
      accentEdge(accent, 16),
      label("{{n}}", { x: 6, y: 5.4, w: 7, h: 5.5 }, { fontSize: TYPE.small, fontWeight: "bold", color: accent.deep }, { name: "opt:number|Number" }),
      field(statement.id, "The mean is always larger than the median.", { x: 15, y: 5.2, w: W - 72, h: 6 }, { fontSize: TYPE.body, color: INK.strong }, { format: "rich" }),
      ...tickBox(accent, W - 54, 5, "True"),
      ...tickBox(accent, W - 30, 5, "False"),
      // "How sure are you?" matters as much here as on a multiple-choice question.
      ...confidenceRow(accent, 14, W - 24).map((element) => shift(element, 15)),
      // The answer looks like everywhere else: a full-width green band that says True or False.
      ...answerBand(accent, answer.id, 21, W),
      field(source.id, "Source: Accounting.pdf · passage 12", { x: ANSWER_INSET, y: 28.6, w: W - 2 * ANSWER_INSET, h: 8 }, { fontSize: TYPE.meta, color: INK.muted, lineHeight: 1.3 }, { name: "opt:answer|Source", linkFieldId: sourceLink.id, collapseEmpty: true })
    ]
  });
  return {
    id: "block-true-false",
    family: "True / false",
    variant: "Tick boxes",
    name: "True / false",
    description: "Statement with tick boxes on one tidy line; the answer can be shown for the key.",
    category: "questions",
    icon: "☑",
    fields: [statements],
    elements: [group],
    options: [{ key: "number", label: "Number", default: true }, { key: "confidence", label: "How sure are you? (High / Medium / Low)", default: true, grow: 8 }, { key: "answer", label: "Show answer", default: false, grow: 20 }],
    accent: { main: accent.main, tint: accent.tint },
    builtIn: true
  };
}


function vocabularyRow(): BlockDef {
  const accent = palette("green");
  const word = createField("Word", "text");
  const translation = createField("Translation", "text");
  const example = createField("Example", "text");
  const words = createField("Words", "array", { children: [createField("item", "object", { children: [word, translation, example] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "Vocabulary rows",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 34 },
    layout: { mode: "vertical", gap: 0 },
    repeat: null,
    children: [
      createGroup({
        name: "Header",
        frame: { x: 0, y: 0, w: W, h: 9 },
        layout: { mode: "free", gap: 0 },
        repeat: null,
        style: defaultStyle({ fill: accent.main, stroke: "", radius: RADIUS.panel }),
        children: [
          kicker("Word", { x: 5, y: 2.6, w: 40, h: 4 }, INK.paper),
          kicker("Translation", { x: 55, y: 2.6, w: 40, h: 4 }, INK.paper),
          kicker("Example", { x: 105, y: 2.6, w: 70, h: 4 }, INK.paper)
        ]
      }),
      createGroup({
        name: "Row",
        frame: { x: 0, y: 9, w: W, h: 10 },
        layout: { mode: "free", gap: 0 },
        repeat: { fieldId: words.id, mode: "flow" },
        style: defaultStyle({ fill: "", stroke: INK.hairline, strokeWidth: 0.25 }),
        children: [
          field(word.id, "casa", { x: 5, y: 2.6, w: 46, h: 5.5 }, { fontSize: TYPE.body, fontWeight: "bold", color: INK.strong }),
          field(translation.id, "house", { x: 55, y: 2.6, w: 46, h: 5.5 }, { fontSize: TYPE.body, color: accent.deep }),
          field(example.id, "Mi casa es pequeña.", { x: 105, y: 2.6, w: W - 110, h: 5.5 }, { fontSize: TYPE.small, color: INK.muted })
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
    category: "structure",
    icon: "▦",
    fields: [words],
    elements: [group],
    accent: { main: accent.main, tint: accent.tint },
    builtIn: true
  };
}


function keyPoints(): BlockDef {
  const accent = palette("orange");
  const title = createField("Title", "text", { description: "Title for the key-points box, e.g. 'Three things to remember'" });
  const point = createField("Point", "rich_text", { description: "One key point, concise, may use **bold** for emphasis" });
  const points = createField("Points", "array", { children: [createField("item", "object", { children: [point] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "Key points",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 46 },
    layout: { mode: "vertical", gap: SPACE.sm },
    repeat: null,
    children: [
      field(title.id, "Three things to remember", { x: 0, y: 0, w: W, h: 10 }, { fontSize: TYPE.title, fontWeight: "bold", color: INK.strong }, { name: "opt:title|Title" }),
      createGroup({
        name: "Point",
        frame: { x: 0, y: 13, w: W, h: 13 },
        layout: { mode: "free", gap: SPACE.sm },
        repeat: { fieldId: points.id, mode: "flow" },
        style: defaultStyle({ fill: accent.tint, stroke: "", radius: RADIUS.panel }),
        children: [
          accentMark(accent, 3.4, 6.2),
          ...numberBadge(accent, 5, 3.4, 6.2),
          field(point.id, "**Central tendency:** the median resists outliers.", { x: 14, y: 3.6, w: W - 19, h: 6.5 }, { fontSize: TYPE.body, color: INK.strong }, { format: "rich" })
        ]
      })
    ]
  });
  return {
    id: "block-key-points",
    family: "Key points",
    variant: "Numbered rows",
    name: "Key points",
    description: "Title plus numbered highlight rows with a coloured edge.",
    category: "structure",
    icon: "•",
    fields: [title, points],
    elements: [group],
    options: [{ key: "title", label: "Title", default: true }, { key: "number", label: "Numbers", default: true }],
    accent: { main: accent.main, tint: accent.tint },
    builtIn: true
  };
}


/* ---------------------------------------------------------------- more families */

function examHeader(): BlockDef {
  const accent = palette("blue");
  const title = createField("Title", "text", { description: "Title of this exam or worksheet, written for its content (not the agent's name)" });
  const subtitle = createField("Subtitle", "text", { description: "Course, class or subject" });
  const W = PAGE.width;
  const group = createGroup({
    name: "Header",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 34 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    pageScope: { mode: "first" },
    children: [
      createShape("rect", { frame: { x: 0, y: 0, w: W, h: 22 }, style: defaultStyle({ fill: accent.tint, stroke: "", radius: RADIUS.card }) }),
      createShape("rect", { frame: { x: 0, y: 0, w: 2, h: 22 }, style: defaultStyle({ fill: accent.main, stroke: "", radius: 1 }) }),
      createShape("ellipse", { name: "opt:logo|Logo mark", frame: { x: 7, y: 4.2, w: 4.6, h: 4.6 }, style: defaultStyle({ fill: accent.main, stroke: "" }) }),
      label("LUNA", { x: 13, y: 4.2, w: 26, h: 5 }, { fontSize: TYPE.small, fontWeight: "bold", color: accent.deep }, { name: "opt:logo|Logo" }),
      field(subtitle.id, "Biology · Grade 10", { x: 42, y: 4.4, w: W - 49, h: 5 }, { fontSize: TYPE.meta, color: INK.muted, align: "right" }, { name: "opt:subtitle|Subtitle" }),
      field(title.id, "Biology Midterm Exam", { x: 7, y: 11, w: W - 14, h: 10 }, { fontSize: TYPE.title, fontWeight: "bold", color: INK.strong }),
      label("Name", { x: 0, y: 26, w: 12, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: INK.muted }, { name: "opt:namedate|Name label" }),
      writingLine(30.5, 12, 76, { name: "opt:namedate|Name line" }),
      label("Date", { x: W - 62, y: 26, w: 12, h: 5 }, { fontSize: TYPE.meta, fontWeight: "bold", color: INK.muted }, { name: "opt:namedate|Date label" }),
      writingLine(30.5, W - 50, 50, { name: "opt:namedate|Date line" })
    ]
  });
  return { id: "block-header-exam", family: "Exam header", variant: "Title, name and date", name: "Exam header", description: "Tinted title panel with the subject, plus Name / Date lines on the first page. For exams and worksheets.", category: "structure", icon: "▔", fields: [title, subtitle], elements: [group], options: [{ key: "logo", label: "Logo", default: true }, { key: "subtitle", label: "Subtitle", default: true }, { key: "namedate", label: "Name / Date", default: true }], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

function minimalHeader(): BlockDef {
  const accent = palette("blue");
  const title = createField("Title", "text", { description: "Title of this document, written for its content (not the agent's name)" });
  const W = PAGE.width;
  const group = createGroup({
    name: "Header",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 20 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    pageScope: { mode: "first" },
    children: [
      field(title.id, "Study guide", { x: 0, y: 0, w: W, h: 12 }, { fontSize: TYPE.display, fontWeight: "bold", align: "center", color: INK.strong }),
      createShape("rect", { frame: { x: W / 2 - 13, y: 15, w: 26, h: 1.4 }, style: defaultStyle({ fill: accent.main, stroke: "", radius: 0.7 }) })
    ]
  });
  return { id: "block-header-minimal", family: "Document header", variant: "Centered title", name: "Document header", description: "Centred title with an accent rule. For summaries, guides and any document that is not an exam.", category: "structure", icon: "▔", fields: [title], elements: [group], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

function footer(): BlockDef {
  const title = createField("Footer text", "text", { description: "Footer text: by default the subject and what this is (Quiz, Summary…); the user can change it" });
  const W = PAGE.width;
  const group = createGroup({
    name: "Footer",
    frame: { x: PAGE.margin, y: 280, w: W, h: 8 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    pageScope: { mode: "every" },
    children: [
      divider(0, W),
      field(title.id, "Biology – Quiz", { x: 0, y: 2.4, w: 120, h: 5 }, { fontSize: TYPE.micro, color: INK.faint }),
      label("Page {{page}}", { x: W - 46, y: 2.4, w: 46, h: 5 }, { fontSize: TYPE.micro, color: INK.faint, align: "right" }, { name: "opt:page|Page number" })
    ]
  });
  return { id: "block-footer", family: "Footer", variant: "Title + page number", name: "Footer", description: "Hairline, document title and page number on every page.", category: "structure", icon: "▁", fields: [title], elements: [group], options: [{ key: "page", label: "Page number", default: true }], accent: { main: palette("blue").main, tint: palette("blue").tint }, builtIn: true };
}

function sectionHeader(): BlockDef {
  const accent = palette("blue");
  const title = createField("Section title", "text");
  const intro = createField("Section intro", "text", { description: "One-line instruction for the section" });
  const sections = createField("Sections", "array", { children: [createField("item", "object", { children: [title, intro] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "Section header",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 24 },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: sections.id, mode: "flow" },
    children: [
      ...chip("SECTION {{n}}", accent, { x: 0, y: 0, w: 27, h: 6 }),
      field(title.id, "Multiple choice", { x: 0, y: 8, w: W, h: 9 }, { fontSize: TYPE.heading + 2, fontWeight: "bold", color: INK.strong }),
      field(intro.id, "Choose the correct answer for each question. Only one option is correct.", { x: 0, y: 17.5, w: W, h: 5.5 }, { fontSize: TYPE.small, color: INK.muted }, { name: "opt:intro|Intro line" })
    ]
  });
  return { id: "block-section-header", family: "Section header", variant: "Badge + title", name: "Section header", description: "Numbered section badge, title and intro line — one per section.", category: "structure", icon: "§", fields: [sections], elements: [group], options: [{ key: "intro", label: "Intro line", default: true }], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

function bodyText(): BlockDef {
  const accent = palette("blue");
  const text = createField("Text", "rich_text", { description: "One paragraph of body text; may use **bold** for emphasis" });
  const paragraphs = createField("Paragraphs", "array", { children: [createField("item", "object", { children: [text] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "Paragraph",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 16 },
    layout: { mode: "free", gap: SPACE.md },
    repeat: { fieldId: paragraphs.id, mode: "flow" },
    children: [
      accentMark(accent, 2.4, 8),
      field(text.id, "Photosynthesis converts light energy into chemical energy stored in glucose.", { x: 6, y: 2, w: W - 10, h: 12 }, { fontSize: TYPE.body, color: INK.body, lineHeight: 1.5 }, { format: "rich" })
    ]
  });
  return { id: "block-paragraph", family: "Paragraph", variant: "Body text", name: "Paragraph", description: "A paragraph of body text with a slim accent edge.", category: "structure", icon: "¶", fields: [paragraphs], elements: [group], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

function sectionTitle(): BlockDef {
  const accent = palette("blue");
  const title = createField("Section title", "text");
  const intro = createField("Section intro", "text", { description: "One-line instruction for the section" });
  const sections = createField("Sections", "array", { children: [createField("item", "object", { children: [title, intro] })] });
  const W = PAGE.width;
  const group = createGroup({
    name: "Section title",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 22 },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: sections.id, mode: "flow" },
    children: [
      field(title.id, "Multiple choice", { x: 0, y: 0, w: W, h: 9 }, { fontSize: TYPE.heading + 2, fontWeight: "bold", color: INK.strong }),
      createShape("rect", { frame: { x: 0, y: 10.4, w: 20, h: 1.1 }, style: defaultStyle({ fill: accent.main, stroke: "", radius: 0.55 }) }),
      field(intro.id, "Choose the correct answer for each question. Only one option is correct.", { x: 0, y: 13.4, w: W, h: 5.5 }, { fontSize: TYPE.small, color: INK.muted }, { name: "opt:intro|Intro line" })
    ]
  });
  return { id: "block-section-title", family: "Section header", variant: "Title only", name: "Section header", description: "Plain section title with a short accent rule and an optional intro line — no badge.", category: "structure", icon: "§", fields: [sections], elements: [group], options: [{ key: "intro", label: "Intro line", default: true }], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

/**
 * Headings with levels: one component, as many levels as the content needs. Every element of the
 * list says which level it is, and the matching design (size, indent, colour) is drawn for it.
 */
function headings(): BlockDef {
  const accent = palette("blue");
  const level = createField("Level", "text", { description: "Heading level: 1 = main section, 2 = subsection, 3 = sub-subsection, 4 = smallest. Use as many levels as the content needs.", options: ["1", "2", "3", "4"] });
  const text = createField("Text", "text", { description: "The heading text, short" });
  const list = createField("Headings", "array", { children: [createField("item", "object", { children: [level, text] })] });
  const W = PAGE.width;
  const designs = [
    { level: "1", size: 20, height: 10, indent: 0, color: INK.strong, rule: true },
    { level: "2", size: 15, height: 8, indent: 0, color: INK.strong, rule: false },
    { level: "3", size: 12, height: 7, indent: 4, color: accent.deep, rule: false },
    { level: "4", size: 10, height: 6, indent: 8, color: INK.muted, rule: false }
  ];
  const variants = designs.map((design) => {
    const inner = createGroup({
      name: `Level ${design.level}`,
      frame: { x: 0, y: 0, w: W, h: design.height + (design.rule ? 3 : 0) },
      layout: { mode: "free", gap: 0 },
      repeat: null,
      children: [
        field(text.id, `Heading level ${design.level}`, { x: design.indent, y: 0, w: W - design.indent, h: design.height }, { fontSize: design.size, fontWeight: "bold", color: design.color, lineHeight: 1.2 }),
        ...(design.rule ? [createShape("rect", { frame: { x: 0, y: design.height + 1.2, w: 22, h: 1.1 }, style: defaultStyle({ fill: accent.main, stroke: "", radius: 0.55 }) })] : [])
      ]
    });
    inner.condition = { fieldId: level.id, equals: design.level };
    return inner;
  });
  const group = createGroup({
    name: "Headings",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 13 },
    layout: { mode: "free", gap: SPACE.sm },
    repeat: { fieldId: list.id, mode: "flow" },
    children: variants
  });
  return { id: "block-headings", family: "Headings", variant: "Levels 1–4", name: "Headings", description: "Section and sub-section headings at several levels — the bigger the level, the smaller the heading.", category: "structure", icon: "H", fields: [list], elements: [group], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

function callout(): BlockDef {
  const accent = palette("orange");
  const note = createField("Note", "rich_text", { description: "Important information, tip or reminder" });
  const W = PAGE.width;
  const group = createGroup({
    name: "Callout",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: 20 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    style: defaultStyle({ fill: accent.tint, stroke: "", radius: RADIUS.card }),
    children: [
      accentMark(accent, 5.4, 9),
      createShape("ellipse", { name: "opt:label|Icon", frame: { x: 6, y: 6.4, w: 6, h: 6 }, style: defaultStyle({ fill: accent.main, stroke: "" }) }),
      label("!", { x: 6, y: 7.4, w: 6, h: 4.5 }, { fontSize: TYPE.small, fontWeight: "bold", color: INK.paper, align: "center" }, { name: "opt:label|Icon mark" }),
      kicker("Important", { x: 15, y: 4.6, w: 60, h: 4 }, accent.deep, { name: "opt:label|Label" }),
      field(note.id, "Photosynthesis only happens where there is both light and chlorophyll.", { x: 15, y: 9.4, w: W - 20, h: 8 }, { fontSize: TYPE.body, color: INK.strong }, { format: "rich" })
    ]
  });
  return { id: "block-callout", family: "Callout", variant: "Info box", name: "Callout", description: "Highlighted box for important information, tips or notes.", category: "structure", icon: "ⓘ", fields: [note], elements: [group], options: [{ key: "label", label: "Label", default: true }], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

/**
 * Flashcards, in two views of the same component (placeholders "@both" / "@sides" are turned into
 * the template's real view ids when it is assembled):
 *  - both sides on one page: the front above the middle line, the back below it, the line as wide as
 *    the card;
 *  - one side per page: a page with the front, a page with the back, for each card — so the deck can
 *    be printed back to back or played as a memory game.
 */
export const FLASH_BOTH = "@both";
export const FLASH_SIDES = "@sides";

function flashcardSingle(): BlockDef {
  const accent = palette("purple");
  const front = createField("Front", "text");
  const back = createField("Back", "text");
  const cards = createField("Cards", "array", { children: [createField("item", "object", { children: [front, back] })] });
  // Derived from the cards (never written by the AI): FRONT page, BACK page, for each card.
  const label_ = createField("Label", "text");
  const text_ = createField("Text", "text");
  const sides = createField("Sides", "array", { derive: { kind: "sides", from: "Cards" }, children: [createField("item", "object", { children: [label_, text_] })] });
  const W = PAGE.width;
  const H = 76;
  const tab = () => createShape("rect", { frame: { x: 10, y: 0, w: W - 20, h: 1.8 }, style: defaultStyle({ fill: accent.main, stroke: "", radius: 0.9 }) });
  const both = createGroup({
    name: "Flashcard",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: H },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: cards.id, mode: "page" },
    style: cardStyle(accent, "outlined"),
    visibility: { views: [FLASH_BOTH] },
    children: [
      tab(),
      kicker("Front", { x: 8, y: 6, w: 30, h: 4 }, accent.deep),
      field(front.id, "Photosynthesis", { x: 8, y: 13, w: W - 16, h: 17 }, { fontSize: 24, fontWeight: "bold", align: "center", color: INK.strong }),
      // The middle of the card, edge to edge.
      divider(H / 2, W, accent.line),
      kicker("Back", { x: 8, y: H / 2 + 5, w: 30, h: 4 }, INK.faint),
      field(back.id, "The process by which plants convert light energy into chemical energy.", { x: 14, y: H / 2 + 12, w: W - 28, h: 16 }, { fontSize: TYPE.subtitle, align: "center", color: INK.muted, lineHeight: 1.45 })
    ]
  });
  const oneSide = createGroup({
    name: "Flashcard side",
    frame: { x: PAGE.margin, y: PAGE.margin, w: W, h: H },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: sides.id, mode: "page" },
    style: cardStyle(accent, "outlined"),
    visibility: { views: [FLASH_SIDES] },
    children: [
      tab(),
      field(label_.id, "FRONT", { x: 8, y: 6, w: 40, h: 4 }, { fontSize: TYPE.micro, fontWeight: "bold", color: accent.deep }),
      field(text_.id, "Photosynthesis", { x: 10, y: 27, w: W - 20, h: 30 }, { fontSize: 30, fontWeight: "bold", align: "center", color: INK.strong, lineHeight: 1.25 })
    ]
  });
  return { id: "block-flashcard-single", family: "Flashcard", variant: "One card per page / slide", name: "Flashcard", description: "Large front / back card — both sides on one page, or one side per page for printing back to back and memory games.", category: "cards", icon: "▤", fields: [cards, sides], elements: [both, oneSide], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}



/* ---------------------------------------------------------------- kids learning & worksheets */


function matchPairs(): BlockDef {
  const left = createField("Left", "text", { description: "Word or picture on the left" });
  const right = createField("Right", "text", { description: "Its match on the right (shown shuffled)" });
  const pairs = createField("Pairs", "array", { description: "Matching pairs (left ↔ right)", children: [createField("item", "object", { children: [left, right] })] });
  const title = createField("Title", "text", { description: "Activity title" });
  const instruction = createField("Instruction", "text", { description: "One-line instruction for the child" });
  const accent = palette("blue");
  const group = createGroup({
    name: "Match the pairs",
    frame: { x: 12, y: 12, w: 186, h: 34 },
    layout: { mode: "vertical", gap: 2 },
    repeat: null,
    pagination: { breakBefore: false, breakAfter: false, keepTogether: false, allowSplit: true, overflow: "continue" as const },
    children: [
      tx(title.id, "Match the Pairs", { x: 0, y: 0, w: 186, h: 12 }, { fontSize: 22, fontWeight: "bold", align: "center", color: accent.deep }),
      tx(instruction.id, "Draw a line to connect each pair.", { x: 0, y: 12, w: 186, h: 6 }, { fontSize: TYPE.body, align: "center", color: INK.muted }, { name: "opt:instruction|Instruction" }),
      createGroup({
        name: "Pair row",
        frame: { x: 0, y: 20, w: 186, h: 14 },
        layout: { mode: "free", gap: 0 },
        repeat: { fieldId: pairs.id, mode: "flow" },
        children: [
          createShape("rect", { frame: { x: 8, y: 1, w: 66, h: 11 }, style: defaultStyle({ fill: accent.tint, stroke: accent.line, strokeWidth: 0.3, radius: 3 }) }),
          tx(left.id, "Apple", { x: 12, y: 3.5, w: 52, h: 6 }, { fontSize: 12, fontWeight: "bold", color: INK.strong }),
          createShape("ellipse", { frame: { x: 70, y: 4.5, w: 4, h: 4 }, style: defaultStyle({ fill: INK.paper, stroke: accent.main, strokeWidth: 0.5 }) }),
          createShape("ellipse", { name: "opt:answer|Left dot filled", frame: { x: 70, y: 4.5, w: 4, h: 4 }, style: defaultStyle({ fill: accent.main, stroke: accent.main, strokeWidth: 0.5 }) }),
          createShape("line", { name: "opt:answer|Connection line", frame: { x: 74, y: 6.5, w: 38, h: 0.1 }, style: defaultStyle({ stroke: accent.main, strokeWidth: 0.8 }) }),
          createShape("ellipse", { frame: { x: 112, y: 4.5, w: 4, h: 4 }, style: defaultStyle({ fill: INK.paper, stroke: accent.main, strokeWidth: 0.5 }) }),
          createShape("ellipse", { name: "opt:answer|Right dot filled", frame: { x: 112, y: 4.5, w: 4, h: 4 }, style: defaultStyle({ fill: accent.main, stroke: accent.main, strokeWidth: 0.5 }) }),
          createShape("rect", { frame: { x: 112, y: 1, w: 66, h: 11 }, style: defaultStyle({ fill: accent.soft, stroke: accent.line, strokeWidth: 0.3, radius: 3 }) }),
          tx(right.id, "Manzana", { x: 122, y: 3.5, w: 52, h: 6 }, { fontSize: 12, fontWeight: "bold", color: INK.strong })
        ]
      })
    ]
  });
  return { id: "block-match-pairs", family: "Match the pairs", variant: "Two columns with dots", name: "Match the pairs", description: "Two columns to connect with a line — words, translations, pictures. Interactive: the child picks each match.", category: "questions", icon: "⋯", fields: [title, instruction, pairs], elements: [group], options: [{ key: "instruction", label: "Instruction line", default: true }, { key: "answer", label: "Show answer key", default: false }], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

function fillBlanks(): BlockDef {
  const sentence = createField("Sentence", "text", { description: "The sentence with ____ where the missing word goes" });
  const answer = createField("Answer", "text", { description: "The missing word" });
  const hint = createField("Hint", "text", { description: "Optional hint, e.g. first letter", required: false });
  const items = createField("Sentences", "array", { children: [createField("item", "object", { children: [sentence, answer, hint] })] });
  const accent = palette("blue");
  const group = createGroup({
    name: "Fill in the blanks",
    frame: { x: 12, y: 12, w: 186, h: 13 },
    layout: { mode: "free", gap: 0 },
    repeat: { fieldId: items.id, mode: "flow" },
    style: cardStyle(accent, "plain", { squareLeft: true }),
    children: [
      accentEdge(accent, 13),
      st("{{n}}.", { x: 5, y: 3.5, w: 8, h: 6 }, { fontSize: 11, fontWeight: "bold", color: accent.deep }, { name: "opt:number|Number" }),
      tx(sentence.id, "The ____ is shining in the sky.", { x: 14, y: 3.5, w: 129, h: 6 }, { fontSize: 11, color: INK.strong }),
      tx(hint.id, "(s...)", { x: 146, y: 3.5, w: 36, h: 6 }, { fontSize: TYPE.meta, color: INK.muted, align: "right" }, { name: "opt:hint|Hint" }),
      tx(answer.id, "sun", { x: 14, y: 9.4, w: 60, h: 3.4 }, { fontSize: TYPE.micro, fontWeight: "bold", color: accent.deep }, { name: "opt:answer|Answer" })
    ]
  });
  return { id: "block-fill-blanks", family: "Fill in the blanks", variant: "Sentence + hint", name: "Fill in the blanks", description: "Sentences with a missing word. Interactive: the child types the word; checked automatically.", category: "questions", icon: "Aa", fields: [items], elements: [group], options: [{ key: "number", label: "Numbers", default: true }, { key: "hint", label: "Hint", default: true }, { key: "answer", label: "Show answer", default: false }], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}

function mathPractice(): BlockDef {
  const problem = createField("Problem", "formula", { description: "The operation, e.g. 24 + 18 =" });
  const answer = createField("Answer", "number", { description: "The result" });
  const problems = createField("Problems", "array", { children: [createField("item", "object", { children: [problem, answer] })] });
  const title = createField("Title", "text", { description: "Worksheet title, e.g. Math Practice · Level 3" });
  const accent = palette("blue");
  const cell = createGroup({
    name: "Problem",
    frame: { x: 0, y: 0, w: 90, h: 22 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    children: [
      st("{{n}}.", { x: 0, y: 1, w: 8, h: 6 }, { fontSize: 11, fontWeight: "bold", color: accent.deep }),
      tx(problem.id, "24 + 18 =", { x: 9, y: 1, w: 70, h: 7 }, { fontSize: 13, color: INK.strong }),
      createShape("rect", { frame: { x: 9, y: 9, w: 56, h: 11 }, style: defaultStyle({ fill: INK.paper, stroke: accent.line, strokeWidth: 0.4, radius: 2 }) }),
      createShape("rect", { frame: { x: 68, y: 9, w: 14, h: 11 }, style: defaultStyle({ fill: INK.paper, stroke: accent.line, strokeWidth: 0.4, radius: 2 }) }),
      tx(answer.id, "42", { x: 69, y: 12.4, w: 12, h: 5 }, { fontSize: TYPE.small, fontWeight: "bold", color: accent.deep, align: "center" }, { name: "opt:answer|Answer" })
    ]
  });
  const group = createGroup({
    name: "Math practice set",
    frame: { x: 12, y: 12, w: 186, h: 40 },
    layout: { mode: "vertical", gap: 3 },
    repeat: null,
    children: [
      tx(title.id, "Math Practice · Level 3", { x: 0, y: 0, w: 186, h: 11 }, { fontSize: 20, fontWeight: "bold", align: "center", color: accent.deep }),
      st("Name ______________________     Date ____________", { x: 0, y: 12, w: 186, h: 6 }, { fontSize: TYPE.meta, color: INK.muted }, { name: "opt:namedate|Name / Date" }),
      createGroup({ name: "Problems", frame: { x: 0, y: 20, w: 186, h: 22 }, layout: { mode: "grid", gap: 6, columns: 2 }, repeat: { fieldId: problems.id, mode: "grid", columns: 2 }, children: [cell] })
    ]
  });
  return { id: "block-math-practice", family: "Math practice set", variant: "Two columns with answer boxes", name: "Math practice set", description: "Numbered operations in two columns with a working box and an answer box. Interactive: the child types results.", category: "questions", icon: "±", fields: [title, problems], elements: [group], options: [{ key: "namedate", label: "Name / Date", default: true }, { key: "answer", label: "Show answers", default: false }], accent: { main: accent.main, tint: accent.tint }, builtIn: true };
}


export function builtInBlocks(): BlockDef[] {
  return [
    // Structure
    examHeader(), minimalHeader(), sectionHeader(), sectionTitle(), headings(), bodyText(), keyPoints(), callout(), vocabularyRow(), footer(),
    // Questions (every question type has an answer for the key)
    examQuestion(), openQuestion(), trueFalse(), fillBlanks(), matchPairs(), mathPractice(),
    // Cards & games
    flashcardSingle()
  ];
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

export const BLOCK_CATEGORY_LABELS: Record<BlockCategory, string> = { questions: "Questions", cards: "Cards & tables", structure: "Document structure", kids: "Kids learning & worksheets", custom: "My blocks" };

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

/**
 * Recolouring a block means swapping its whole palette, not just its brightest colour: the badge,
 * the darker ink used for the option letters, the tinted band and the hairline all move together,
 * or an orange card ends up with blue lettering.
 */
function paletteMap(fromMain: string, toId: string): Record<string, string> {
  const source = PALETTES.find((entry) => entry.main.toLowerCase() === String(fromMain).toLowerCase());
  const target = PALETTES.find((entry) => entry.id === toId);
  if (!source || !target || source.id === target.id) return {};
  return {
    [source.main.toLowerCase()]: target.main,
    [source.deep.toLowerCase()]: target.deep,
    [source.tint.toLowerCase()]: target.tint,
    [source.soft.toLowerCase()]: target.soft,
    [source.line.toLowerCase()]: target.line
  };
}

export function instantiateBlock(block: BlockDef, templateFields: FieldDef[], options: InsertOptions = {}): { fields: FieldDef[]; elements: Element[] } {
  const idMap = new Map<ID, ID>();
  const fields = mergeFields(templateFields, block.fields, idMap);
  const elements = cloneDeep(block.elements);
  const toggles = options.toggles || {};
  const hidden = new Set((block.options || []).filter((option) => toggles[option.key] === false || (toggles[option.key] === undefined && !option.default)).map((option) => option.key));
  const from = block.accent || A;
  const to = options.accent ? { main: options.accent.main, tint: options.accent.tint } : from;
  const swatches = options.accent ? paletteMap(from.main, options.accent.id) : {};
  const recolour = (value: string | undefined): string | undefined => {
    if (!value) return value;
    const mapped = swatches[value.toLowerCase()];
    return mapped || value;
  };

  const remapElements = (list: Element[]): Element[] =>
    list
      .filter((element) => { const key = optionKeyOf(element); return !key || !hidden.has(key); })
      .map((element) => {
        const next = { ...element, id: createId("el"), name: displayName(element) || element.name } as Element;
        next.style = {
          ...next.style,
          fill: recolour(replaceColor(replaceColor(next.style.fill, from.main, to.main), from.tint, to.tint)),
          stroke: recolour(replaceColor(next.style.stroke, from.main, to.main)),
          color: recolour(replaceColor(next.style.color, from.main, to.main))
        };
        if ((next.type === "text" || next.type === "image") && next.source.type === "field") {
          next.source = { type: "field", fieldId: idMap.get(next.source.fieldId) || next.source.fieldId };
        }
        if (next.type === "text" && next.linkFieldId) next.linkFieldId = idMap.get(next.linkFieldId) || next.linkFieldId;
        if (next.type === "group") {
          const group = next as GroupElement;
          group.repeat = group.repeat ? { ...group.repeat, fieldId: idMap.get(group.repeat.fieldId) || group.repeat.fieldId } : null;
          if (group.condition) group.condition = { ...group.condition, fieldId: idMap.get(group.condition.fieldId) || group.condition.fieldId };
          group.children = remapElements(group.children);
        }
        return next;
      });

  const instantiated = remapElements(elements);
  // Options that add a row (the source under an answer) make the card taller only while they are on.
  const grow = (block.options || []).filter((option) => !hidden.has(option.key) && option.grow).reduce((sum, option) => sum + (option.grow || 0), 0);
  if (grow) {
    for (const element of instantiated) {
      if (element.type !== "group") continue;
      const original = element.frame.h;
      element.frame = { ...element.frame, h: original + grow };
      element.children = element.children.map((child) => (child.frame.x === 0 && child.frame.y === 0 && Math.abs(child.frame.h - original) < 0.01 ? { ...child, frame: { ...child.frame, h: child.frame.h + grow } } : child));
    }
  }
  // Remember the source block on the top-level group so the simple editor can rebuild or regroup it.
  for (const element of instantiated) if (element.type === "group" && !element.origin) element.origin = { blockId: block.id, ...(options.accent ? { accentId: options.accent.id } : {}) };
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
