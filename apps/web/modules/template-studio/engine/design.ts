/**
 * The design language of Luna's components.
 *
 * Every built-in block is built from these tokens and pieces, which is why a template assembled out
 * of six different components still looks like one document: the same type scale, the same spacing
 * rhythm, the same corner radius, the same hairline, the same tinted accent. The values are in
 * millimetres, because that is what the page is measured in.
 *
 * The rules behind them, in case a new component is added:
 * - One accent per document. Colour is used for structure (a badge, an edge, a band), never as
 *   decoration sprinkled over the page.
 * - Contrast comes from weight and size, not from more colours: display → title → heading → body →
 *   meta is a real scale, not three sizes of the same thing.
 * - Cards sit on white with a hairline and a generous radius; a tint is a wash, never a slab.
 * - Space is the design. Padding is 5–8mm, not 2mm, and the gap between repeated items is bigger
 *   than the gap inside one item, so a list reads as a list.
 */

import type { Element, ShapeElement, TextElement, ID } from "./types";
import { createGroup, createShape, createText, defaultStyle } from "./model";

export interface Palette {
  id: string;
  label: string;
  /** The accent itself: badges, bands, rules. */
  main: string;
  /** A darker version for text on white, where the accent alone would be too pale to read. */
  deep: string;
  /** A wash behind a card. */
  tint: string;
  /** A slightly stronger wash, for a band inside a tinted card. */
  soft: string;
  /** The hairline that draws a card on white. */
  line: string;
}

export const PALETTES: Palette[] = [
  { id: "blue", label: "Blue", main: "#0071e3", deep: "#0a4f9e", tint: "#f0f6fe", soft: "#dfecfc", line: "#cfe1f9" },
  { id: "green", label: "Green", main: "#2f9e5b", deep: "#1d7a44", tint: "#f0f9f3", soft: "#dff1e6", line: "#c9e7d5" },
  { id: "orange", label: "Orange", main: "#e0730f", deep: "#a1530a", tint: "#fef5ec", soft: "#fce7d2", line: "#f7d6b6" },
  { id: "purple", label: "Purple", main: "#8a4fd6", deep: "#6a35b0", tint: "#f6f1fd", soft: "#ebe0fa", line: "#ded0f4" },
  { id: "rose", label: "Rose", main: "#d8366f", deep: "#a92253", tint: "#fdf0f4", soft: "#fadfe8", line: "#f6cfdc" },
  { id: "graphite", label: "Graphite", main: "#3a3a3c", deep: "#1d1d1f", tint: "#f5f5f7", soft: "#ebebed", line: "#dcdce0" }
];

export const palette = (id: string): Palette => PALETTES.find((entry) => entry.id === id) || PALETTES[0];

/** Ink. Body text is not pure black — pure black on white is harsh in print. */
export const INK = {
  strong: "#15161a",
  body: "#2b2c31",
  muted: "#6e6e73",
  faint: "#9b9ba1",
  hairline: "#e7e7ec",
  rule: "#c9c9ce",
  paper: "#ffffff"
};

/** The type scale. Each step is far enough from the next to read as a different level. */
export const TYPE = {
  display: 25,
  title: 18,
  subtitle: 11,
  heading: 13,
  question: 10.8,
  body: 9.8,
  small: 8.8,
  meta: 8.2,
  /** The smallest type Luna prints. The design critic refuses anything under 7pt, and so does paper. */
  micro: 7.2
};

/** The spacing rhythm: a multiple of these, never a number picked by eye. */
export const SPACE = { hair: 1, xs: 2, sm: 3, md: 5, lg: 8, xl: 12 };

export const RADIUS = { card: 3.4, panel: 2.4, chip: 1.6, pill: 2.6, round: 999 };

/** The page's own measurements, so components agree about where the content starts and ends. */
export const PAGE = { margin: 12, width: 186 };

export const CONFIDENCE_LEVELS = ["High", "Medium", "Low"];

/* ---------------------------------------------------------------- small builders */

type Frame = { x: number; y: number; w: number; h: number };

export function text(source: { type: "field"; fieldId: ID } | { type: "static"; value: string }, frame: Frame, style: Partial<TextElement["style"]>, extra: Partial<TextElement> = {}): TextElement {
  return createText(source, { frame, style: defaultStyle({ color: INK.body, ...style }), ...extra });
}

/** A field, with the sample value people see while designing. */
export const field = (fieldId: ID, placeholder: string, frame: Frame, style: Partial<TextElement["style"]>, extra: Partial<TextElement> = {}): TextElement =>
  text({ type: "field", fieldId }, frame, style, { placeholder, ...extra });

export const label = (value: string, frame: Frame, style: Partial<TextElement["style"]>, extra: Partial<TextElement> = {}): TextElement =>
  text({ type: "static", value }, frame, style, extra);

/** A small uppercase label — the quiet voice of the design ("SECTION 1", "ANSWER", "FRONT"). */
export const kicker = (value: string, frame: Frame, colour: string, extra: Partial<TextElement> = {}): TextElement =>
  label(value.toUpperCase(), frame, { fontSize: TYPE.micro, fontWeight: "bold", color: colour }, extra);

/** A white card with a hairline: the default container for anything repeated. */
export const cardStyle = (accent: Palette, variant: "plain" | "tinted" | "outlined" = "plain") => defaultStyle({
  fill: variant === "tinted" ? accent.tint : INK.paper,
  stroke: variant === "outlined" ? accent.line : INK.hairline,
  strokeWidth: 0.3,
  radius: RADIUS.card
});

/** The coloured edge down the left of a card — structure from colour, with no slab of it. */
export const accentEdge = (accent: Palette, height: number, extra: Partial<ShapeElement> = {}): ShapeElement =>
  createShape("rect", { frame: { x: 0, y: 0, w: 1.4, h: height }, style: defaultStyle({ fill: accent.main, stroke: "", radius: 0.7 }), ...extra });

/** A round number badge and its numeral, optically centred. */
export function numberBadge(accent: Palette, x: number, y: number, size = 8, optionKey = "number"): Element[] {
  const prefix = optionKey ? `opt:${optionKey}|` : "";
  return [
    createShape("ellipse", { name: `${prefix}Number badge`, frame: { x, y, w: size, h: size }, style: defaultStyle({ fill: accent.main, stroke: "", radius: size / 2 }) }),
    // The numeral is sized to be read, not to fit the circle: a badge never shrinks type below 8pt.
    label("{{n}}", { x, y: y + size * 0.24, w: size, h: size * 0.56 }, { fontSize: Math.max(TYPE.meta, Math.min(TYPE.body, size * 0.62)), fontWeight: "bold", color: INK.paper, align: "center" }, { name: `${prefix}Number` })
  ];
}

/** "2 pts" in the top right of a card, as a quiet pill rather than loose text. */
export function pointsPill(accent: Palette, fieldId: ID, x: number, y: number, optionKey = "points"): Element[] {
  const prefix = `opt:${optionKey}|`;
  return [
    createShape("rect", { name: `${prefix}Points pill`, frame: { x, y, w: 14, h: 5.4 }, style: defaultStyle({ fill: accent.soft, stroke: "", radius: RADIUS.pill }) }),
    field(fieldId, "2", { x: x + 1.5, y: y + 1, w: 6, h: 4 }, { fontSize: TYPE.meta, fontWeight: "bold", color: accent.deep, align: "right" }, { name: `${prefix}Points` }),
    label("pts", { x: x + 8.2, y: y + 1, w: 5, h: 4 }, { fontSize: TYPE.micro, color: accent.deep }, { name: `${prefix}Points label` })
  ];
}

/**
 * One answer option: a lettered circle and the option text. The letter is what makes a printed
 * multiple-choice question look like an exam rather than a bullet list — and it gives the learner
 * something to write down.
 */
export function optionRow(accent: Palette, optionFieldId: ID, width: number, letters = true): Element {
  return createGroup({
    name: "Option",
    frame: { x: 0, y: 0, w: width, h: 6.2 },
    layout: { mode: "free", gap: 0 },
    repeat: null,
    children: [
      createShape("ellipse", { frame: { x: 0, y: 0.5, w: 5, h: 5 }, style: defaultStyle({ fill: INK.paper, stroke: accent.line, strokeWidth: 0.35 }) }),
      // {{A}} is the repeated item's index as a letter — A, B, C — so options read like an exam.
      ...(letters ? [label("{{A}}", { x: 0, y: 1.5, w: 5, h: 4 }, { fontSize: TYPE.micro, fontWeight: "bold", color: accent.deep, align: "center" })] : []),
      field(optionFieldId, "Absorbs light energy for photosynthesis", { x: 7, y: 0.6, w: width - 7, h: 5.2 }, { fontSize: TYPE.body })
    ]
  });
}

/** The answer strip at the foot of a card, shown only in an answer key. */
export function answerBand(accent: Palette, answerFieldId: ID, y: number, width: number, optionKey = "answer"): Element[] {
  const prefix = `opt:${optionKey}|`;
  void accent;
  const green = palette("green");
  return [
    createShape("rect", { name: `${prefix}Answer band`, frame: { x: 0, y, w: width, h: 6.4 }, style: defaultStyle({ fill: green.tint, stroke: "", radius: RADIUS.panel }) }),
    kicker("Answer", { x: 4, y: y + 1.6, w: 14, h: 4 }, green.deep, { name: `${prefix}Answer label` }),
    field(answerFieldId, "B · Absorbs light energy", { x: 19, y: y + 1.3, w: width - 23, h: 4.6 }, { fontSize: TYPE.small, fontWeight: "bold", color: green.deep }, { name: `${prefix}Answer` })
  ];
}

/**
 * "How sure are you?" — three boxes the learner ticks before checking the answer.
 *
 * Confidence is worth asking for because a wrong answer given with certainty and a wrong answer
 * given with a shrug are different problems: the first is a misconception to correct, the second is
 * a gap to teach. It is a block option, so any card can print it or leave it out.
 */
export function confidenceRow(accent: Palette, y: number, width: number, optionKey = "confidence"): Element[] {
  const prefix = `opt:${optionKey}|`;
  const out: Element[] = [
    label("How sure are you?", { x: 0, y: y + 0.6, w: 32, h: 4.6 }, { fontSize: TYPE.meta, fontWeight: "bold", color: INK.muted }, { name: `${prefix}Confidence label` })
  ];
  CONFIDENCE_LEVELS.forEach((level, index) => {
    const x = 34 + index * 24;
    out.push(createShape("rect", { name: `${prefix}${level} box`, frame: { x, y: y + 0.8, w: 4.2, h: 4.2 }, style: defaultStyle({ fill: INK.paper, stroke: accent.line, strokeWidth: 0.35, radius: 0.9 }) }));
    out.push(label(level, { x: x + 5.6, y: y + 0.9, w: 17, h: 4.4 }, { fontSize: TYPE.meta, color: INK.muted }, { name: `${prefix}${level}` }));
  });
  void width;
  return out;
}

/** A hairline divider — the cheapest way to separate two things without a box around each. */
export const divider = (y: number, width: number, colour = INK.hairline): ShapeElement =>
  createShape("line", { frame: { x: 0, y, w: width, h: 0.25 }, style: defaultStyle({ stroke: colour, strokeWidth: 0.25 }) });

/** A ruled writing line: darker than a divider, because somebody has to write on it. */
export const writingLine = (y: number, x: number, width: number): ShapeElement =>
  createShape("line", { frame: { x, y, w: width, h: 0.3 }, style: defaultStyle({ stroke: INK.rule, strokeWidth: 0.3 }) });

/** A small tinted pill with a word in it — section badges, topic ribbons, tags. */
export function chip(value: string, accent: Palette, frame: Frame, extra: Partial<TextElement> = {}): Element[] {
  return [
    createShape("rect", { frame, style: defaultStyle({ fill: accent.soft, stroke: "", radius: RADIUS.pill }) }),
    label(value, { x: frame.x, y: frame.y + (frame.h - 4) / 2, w: frame.w, h: 4 }, { fontSize: TYPE.micro, fontWeight: "bold", color: accent.deep, align: "center" }, extra)
  ];
}
