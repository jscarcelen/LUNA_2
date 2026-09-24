/**
 * A finished template built from an agent's output fields.
 *
 * When someone defines what an agent returns, they should not then have to design a document to
 * see it: Luna lays the fields out for them — a header with the once-per-document data, a card (or
 * a slide) per item with the important fields large and the incidental ones as small chips, an
 * answer view when there is something to reveal, and a page footer. The result is an ordinary
 * template: editable in Template Studio, swappable for another, and saveable to the library.
 */
import type { Element, FieldDef, Template, View } from "./types";
import { createField, createGroup, createLayout, createPage, createShape, createTemplate, createText, createView, defaultStyle } from "./model";
import { importanceOf } from "./fit";

const INK = "#1f2a6b";
const SOFT = "#6e6e73";
const ACCENT = "#0071e3";
const ANSWER = "#2f9e5b";

type Frame = { x: number; y: number; w: number; h: number };

const tx = (fieldId: string, placeholder: string, frame: Frame, style: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  createText({ type: "field", fieldId }, { frame, placeholder, style: defaultStyle(style), ...extra });
const st = (value: string, frame: Frame, style: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  createText({ type: "static", value }, { frame, style: defaultStyle(style), ...extra });

const isAnswerField = (field: FieldDef) => /^(answer|correct[_ ]?answer|solution|explanation|why|rationale|back|translation)$/i.test(field.name.trim());
const isTitleField = (field: FieldDef) => /^(title|heading|name|document[_ ]?title)$/i.test(field.name.trim());

/** Leaf fields of an array item, in the order they should be read. */
function itemFields(list: FieldDef): FieldDef[] {
  const item = list.children?.[0];
  if (!item) return [];
  return item.type === "object" ? item.children || [] : [item];
}

function sampleFor(field: FieldDef): string {
  const name = field.name.toLowerCase();
  if (field.type === "number") return "2";
  if (/question|prompt|task/.test(name)) return "What is the main function of chlorophyll in plants?";
  if (/answer|solution/.test(name)) return "It absorbs the light used in photosynthesis";
  if (/explanation|why/.test(name)) return "Chlorophyll captures light energy and passes it to the reaction centre.";
  if (/topic|subject|category/.test(name)) return "Photosynthesis";
  if (/difficulty|level/.test(name)) return "medium";
  if (/front|word|term/.test(name)) return "perro";
  if (/back|translation/.test(name)) return "dog";
  return `Sample ${field.name.toLowerCase()}`;
}

/** Fields that belong in the header: everything the agent returns once per document. */
function headerFields(fields: FieldDef[]): FieldDef[] {
  return fields.filter((field) => field.type !== "array" && field.type !== "object");
}

export interface AutoTemplateOptions {
  name?: string;
  /** "document" = A4 pages of cards; "slides" = one item per 16:9 slide. */
  kind?: "document" | "slides";
}

/** Builds a complete template for these output fields. */
export function templateFromFields(fields: FieldDef[], options: AutoTemplateOptions = {}): Template {
  const kind = options.kind === "slides" ? "slides" : "document";
  const template = createTemplate(options.name || "Generated template");
  template.fields = fields.length ? fields : [createField("Content", "text")];
  template.editorMode = "simple";

  const lists = template.fields.filter((field) => field.type === "array");
  const heads = headerFields(template.fields);
  const list = lists[0] || null;
  const perItem = list ? itemFields(list) : [];
  const answers = perItem.filter(isAnswerField);

  const layout = kind === "slides" ? createLayout("Slides", "slides-16-9") : template.layouts[0];
  if (kind === "slides") template.layouts = [layout];
  const mainView = layout.views[0];
  mainView.name = answers.length ? "Without answers" : "Document";
  mainView.description = answers.length ? "The version to hand out — answers hidden." : "The document as generated.";
  let answerView: View | null = null;
  if (answers.length) {
    answerView = createView("With answers", { description: "Same document with the answers and explanations shown." });
    layout.views.push(answerView);
  }

  const pageWidth = layout.canvas.width;
  const left = layout.margins.left;
  const width = pageWidth - layout.margins.left - layout.margins.right;
  const elements: Element[] = [];

  /* ---------------------------------------------------------------- header */
  const titleField = heads.find(isTitleField) || heads[0] || null;
  const otherHeads = heads.filter((field) => field !== titleField);
  const headerChildren: Element[] = [];
  let headerY = 0;
  if (titleField) {
    headerChildren.push(tx(titleField.id, "Document title", { x: 0, y: 0, w: width * 0.68, h: 11 }, { fontSize: kind === "slides" ? 24 : 21, fontWeight: "bold", color: INK }));
  } else {
    headerChildren.push(st(template.name, { x: 0, y: 0, w: width * 0.68, h: 11 }, { fontSize: 21, fontWeight: "bold", color: INK }));
  }
  headerY = 12;
  otherHeads.slice(0, 3).forEach((field, index) => {
    headerChildren.push(tx(field.id, sampleFor(field), { x: index === 0 ? 0 : width * 0.68, y: index === 0 ? headerY : 2, w: index === 0 ? width * 0.66 : width * 0.32, h: 6 }, { fontSize: 9.5, color: SOFT, align: index === 0 ? "left" : "right" }));
  });
  headerChildren.push(createShape("line", { frame: { x: 0, y: headerY + 8, w: width, h: 0.5 }, style: defaultStyle({ stroke: ACCENT, strokeWidth: 0.5 }) }));
  const headerHeight = headerY + 10;
  elements.push(createGroup({
    name: "Header", frame: { x: left, y: layout.margins.top, w: width, h: headerHeight },
    layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: kind === "slides" ? "every" : "first" },
    children: headerChildren
  }));

  /* ---------------------------------------------------------------- items */
  if (list) {
    const cardChildren: Element[] = [];
    const essentials = perItem.filter((field) => importanceOf(field) === "essential" && !isAnswerField(field) && field.type !== "array");
    const useful = perItem.filter((field) => importanceOf(field) === "useful" && !isAnswerField(field) && field.type !== "array");
    const extras = perItem.filter((field) => importanceOf(field) === "extra" && field.type !== "array");
    const innerLists = perItem.filter((field) => field.type === "array");

    let y = 5;
    // Number badge, so items are countable however they are laid out.
    cardChildren.push(createShape("ellipse", { frame: { x: 5, y: 5, w: 8, h: 8 }, style: defaultStyle({ fill: "#eaf3fd", stroke: "" }) }));
    cardChildren.push(st("{{n}}", { x: 5, y: 6.6, w: 8, h: 5 }, { fontSize: 8.5, fontWeight: "bold", color: ACCENT, align: "center" }));
    const textLeft = 15;
    const textWidth = width - textLeft - 5;

    essentials.forEach((field, index) => {
      cardChildren.push(tx(field.id, sampleFor(field), { x: textLeft, y, w: textWidth - (extras.length && index === 0 ? 30 : 0), h: 8 }, { fontSize: index === 0 ? (kind === "slides" ? 16 : 11.5) : 10.5, fontWeight: index === 0 ? "bold" : "normal", color: INK }, { format: field.type === "rich_text" ? "rich" : "plain" }));
      y += index === 0 ? 10 : 7;
    });
    // Incidental fields ride along the top right as small grey chips.
    extras.slice(0, 3).forEach((field, index) => {
      cardChildren.push(tx(field.id, sampleFor(field), { x: width - 35, y: 5 + index * 5, w: 30, h: 5 }, { fontSize: 7.5, color: SOFT, align: "right" }));
    });

    innerLists.forEach((inner) => {
      const leaf = itemFields(inner)[0] || inner.children?.[0];
      const optionGroup = createGroup({
        name: inner.name, frame: { x: textLeft, y, w: textWidth, h: 13 }, layout: { mode: "vertical", gap: 1.4 },
        repeat: { fieldId: inner.id, mode: "flow" },
        children: [createGroup({
          name: leaf?.name || "Item", frame: { x: 0, y: 0, w: textWidth, h: 6 }, layout: { mode: "free", gap: 0 }, repeat: null,
          children: [
            createShape("ellipse", { frame: { x: 0, y: 1, w: 4, h: 4 }, style: defaultStyle({ fill: "#ffffff", stroke: "#b9c6e8", strokeWidth: 0.35 }) }),
            leaf ? tx(leaf.id, `${inner.name} 1`, { x: 6.5, y: 0, w: textWidth - 8, h: 6 }, { fontSize: 10, color: INK }) : st("", { x: 6.5, y: 0, w: textWidth - 8, h: 6 }, {})
          ]
        })]
      });
      cardChildren.push(optionGroup);
      y += 16;
    });

    useful.forEach((field) => {
      cardChildren.push(tx(field.id, sampleFor(field), { x: textLeft, y, w: textWidth, h: 6 }, { fontSize: 9.5, color: SOFT }, { format: field.type === "rich_text" ? "rich" : "plain" }));
      y += 7;
    });

    answers.forEach((field, index) => {
      cardChildren.push(tx(field.id, sampleFor(field), { x: textLeft, y, w: textWidth, h: 6 }, { fontSize: index === 0 ? 9.5 : 8.5, fontWeight: index === 0 ? "bold" : "normal", color: index === 0 ? ANSWER : SOFT }, {
        name: field.name,
        format: field.type === "rich_text" ? "rich" : "plain",
        visibility: answerView ? { views: [answerView.id] } : {}
      }));
      y += 7;
    });

    elements.push(createGroup({
      name: list.name, frame: { x: left, y: layout.margins.top + headerHeight + 4, w: width, h: Math.max(28, y + 5) },
      layout: { mode: "free", gap: 3 },
      repeat: { fieldId: list.id, mode: kind === "slides" ? "page" : "flow" },
      pagination: { breakBefore: false, breakAfter: false, keepTogether: true, allowSplit: false, overflow: "continue" },
      style: defaultStyle({ fill: "#ffffff", stroke: "#e5e5ea", strokeWidth: 0.35, radius: 3 }),
      children: cardChildren
    }));
  } else {
    // No list: one document of once-fields, already in the header — show the rest as a body.
    elements.push(createGroup({
      name: "Body", frame: { x: left, y: layout.margins.top + headerHeight + 4, w: width, h: 60 }, layout: { mode: "vertical", gap: 4 }, repeat: null,
      children: heads.slice(1).map((field) => tx(field.id, sampleFor(field), { x: 0, y: 0, w: width, h: 8 }, { fontSize: 11, color: INK }, { format: field.type === "rich_text" ? "rich" : "plain" }))
    }));
  }

  /* ---------------------------------------------------------------- footer */
  if (kind === "document") {
    elements.push(createGroup({
      name: "Footer", frame: { x: left, y: layout.canvas.height - layout.margins.bottom - 7, w: width, h: 7 },
      layout: { mode: "free", gap: 0 }, repeat: null, pageScope: { mode: "every" }, placement: "fixed",
      children: [
        createShape("line", { frame: { x: 0, y: 0, w: width, h: 0.3 }, style: defaultStyle({ stroke: "#e5e5ea", strokeWidth: 0.3 }) }),
        titleField
          ? tx(titleField.id, "Document title", { x: 0, y: 1.5, w: width * 0.6, h: 5 }, { fontSize: 7.5, color: SOFT })
          : st(template.name, { x: 0, y: 1.5, w: width * 0.6, h: 5 }, { fontSize: 7.5, color: SOFT }),
        st("Page {{page}} of {{pages}}", { x: width * 0.62, y: 1.5, w: width * 0.38, h: 5 }, { fontSize: 7.5, color: SOFT, align: "right" })
      ]
    }));
  }

  layout.pages = [createPage({ elements })];
  return template;
}
