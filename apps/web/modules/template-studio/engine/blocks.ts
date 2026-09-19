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

export function builtInBlocks(): BlockDef[] {
  return [examQuestion(), openQuestion(), trueFalse(), flashcard(), vocabularyRow(), documentStructure(), keyPoints()];
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
          group.children = remapElements(group.children);
        }
        return next;
      });

  return { fields, elements: remapElements(elements) };
}

/* ---------------------------------------------------------------- save a selection as a block */

/** Collects the fields a group references (with their parent arrays) so the block is self-contained. */
export function blockFromElements(elements: Element[], templateFields: FieldDef[], meta: { name: string; description?: string; author?: string }): BlockDef {
  const used = new Set<ID>();
  walkElements(elements, (element) => {
    if ((element.type === "text" || element.type === "image") && element.source.type === "field") used.add(element.source.fieldId);
    if (element.type === "group" && element.repeat) used.add(element.repeat.fieldId);
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
