/**
 * Output document — how an agent's output becomes a Template Studio document.
 *
 * Template Studio is the only source of components, formats (design variants) and colours. An
 * agent's output (typed blocks, quiz items, flashcards…) is planned into runs of components, each
 * component gets a format + colour, and the result is assembled by the same function the Template
 * Wizard uses — so previews, the page-size × view matrix and every export behave exactly like
 * Template Studio's.
 *
 * A template is, in this model, nothing but "which format and colour each component has":
 * `styleFromTemplate` reads exactly that out of any saved template.
 */
import { ACCENT_PRESETS, builtInBlocks, type AccentPreset, type BlockDef } from "../engine/blocks";
import { DESIGN_VARIANTS, assembleTemplate, defaultToggles, findBlock } from "../engine/outputTemplate";
import { compileForSave } from "../adapters/agentTemplate";
import { fieldsFromAgentFields, slug } from "../engine/model";
import { templateFromFields } from "../engine/autoTemplate";
import { PALETTES } from "../engine/design";
import type { DataObject, Element, GroupElement, Template } from "../engine/types";

export type FlatBlock = { type: string } & Record<string, unknown>;

/* ---------------------------------------------------------------- catalog bridge */

/** Which Template Studio component renders each flat block type an agent can produce. */
export const COMPONENT_FOR_BLOCK: Record<string, string | null> = {
  heading: "block-section-header",
  paragraph: "block-paragraph",
  bullet_list: "block-key-points",
  callout: "block-callout",
  divider: null,
  question_mc: "block-exam-question",
  question_open: "block-open-question",
  question_tf: "block-true-false",
  question_fill: "block-fill-blanks",
  flashcard: "block-flashcard-single"
};

const QUIZ_HEADER = "block-header-exam";
const CARDS_HEADER = "block-header-minimal";
const FOOTER = "block-footer";

export interface ComponentStyle { blockId?: string; accentId?: string; toggles?: Record<string, boolean> }
export type OutputStyles = Record<string, ComponentStyle>;

const allBlocks = (): BlockDef[] => builtInBlocks();

/** The formats (design variants) a component can take — the same list Template Studio offers. */
export function formatsOf(componentKey: string): BlockDef[] {
  const blocks = allBlocks();
  const base = blocks.find((block) => block.id === componentKey);
  if (!base) return [];
  const ids = DESIGN_VARIANTS[componentKey];
  if (ids) return ids.map((id) => blocks.find((block) => block.id === id)).filter(Boolean) as BlockDef[];
  return [base];
}

/** The accent a component has when nobody chose one: the colour Template Studio designed it in. */
export function nativeAccentId(block: BlockDef): string {
  const main = String(block.accent?.main || "").toLowerCase();
  return ACCENT_PRESETS.find((preset) => preset.main.toLowerCase() === main)?.id || ACCENT_PRESETS[0].id;
}

/** Style of one component with every gap filled in. */
export function resolveStyle(componentKey: string, styles: OutputStyles): { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> } | null {
  const base = findBlock(componentKey);
  if (!base) return null;
  const style = styles[componentKey] || {};
  const formats = formatsOf(componentKey);
  const block = formats.find((format) => format.id === style.blockId) || base;
  const accent = ACCENT_PRESETS.find((preset) => preset.id === style.accentId) || ACCENT_PRESETS.find((preset) => preset.id === nativeAccentId(block)) || ACCENT_PRESETS[0];
  return { block, accent, toggles: { ...defaultToggles(block), ...(style.toggles || {}) } };
}

/* ---------------------------------------------------------------- legacy values (saved agents) */

const LEGACY_COLOR: Record<string, string> = { default: "blue", blue: "blue", purple: "purple", green: "green", orange: "orange", red: "rose", rose: "rose", gray: "graphite", grey: "graphite", graphite: "graphite" };
const LEGACY_HEX: Record<string, string> = { "#0071e3": "blue", "#6f42c1": "purple", "#28a745": "green", "#fd7e14": "orange", "#dc3545": "rose", "#6c757d": "graphite" };

/** Colour value saved by an older version (id, hex or accent id) → a Template Studio accent id. */
export function accentIdFromLegacy(value: unknown): string | undefined {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return undefined;
  if (text.startsWith("#")) {
    const palette = PALETTES.find((entry) => entry.main.toLowerCase() === text);
    return palette?.id || LEGACY_HEX[text];
  }
  return LEGACY_COLOR[text];
}

/**
 * Agents saved before Template Studio became the only catalog stored `{ blockId, formatId, color }`
 * per registry block type, with formats and colours that do not exist in Template Studio. This
 * turns those entries into styles keyed by component.
 */
export function stylesFromSelectedBlocks(selectedBlocks: unknown): OutputStyles {
  const out: OutputStyles = {};
  if (!Array.isArray(selectedBlocks)) return out;
  for (const entry of selectedBlocks as Array<Record<string, unknown>>) {
    const component = COMPONENT_FOR_BLOCK[String(entry?.blockId || "")];
    if (!component) continue;
    const formatId = String(entry?.formatId || "");
    out[component] = {
      ...(formatsOf(component).some((format) => format.id === formatId) ? { blockId: formatId } : {}),
      ...(accentIdFromLegacy(entry?.color) ? { accentId: accentIdFromLegacy(entry?.color) } : {})
    };
  }
  return out;
}

/**
 * One selected block of an agent, with its format and colour forced into Template Studio's catalog:
 * the format becomes the id of one of the component's real formats, the colour one of the six
 * accents. Values saved by older versions are converted; anything unknown falls back to the default.
 */
export function normalizeSelectedBlock<T extends { blockId: string; formatId?: string; color?: string }>(entry: T): T & { formatId: string; color: string } {
  const key = COMPONENT_FOR_BLOCK[entry.blockId] || null;
  const base = key ? findBlock(key) : null;
  const formats = key ? formatsOf(key) : [];
  return {
    ...entry,
    formatId: formats.some((format) => format.id === entry.formatId) ? String(entry.formatId) : key || String(entry.formatId || ""),
    color: ACCENT_PRESETS.some((preset) => preset.id === entry.color) ? String(entry.color) : accentIdFromLegacy(entry.color) || (base ? nativeAccentId(base) : ACCENT_PRESETS[0].id)
  };
}

/* ---------------------------------------------------------------- quiz items / flashcards → blocks */

const letter = (index: number) => String.fromCharCode(65 + index);
const text = (value: unknown) => (value === undefined || value === null ? "" : String(value));
const isTrue = (value: unknown, options: string[]) => {
  const answer = text(value).trim().toLowerCase();
  if (options.length && answer === options[0].trim().toLowerCase()) return true;
  return /^(true|verdadero|cierto|vrai|wahr|vero|verdadeiro|waar)\b/.test(answer);
};

/**
 * Agents that return flat items (the Quiz Generator, flashcards…) are read as the same typed
 * blocks the block agents return, so one pipeline renders them all. Returns null when the items do
 * not look like questions or cards (the output then falls back to an automatic layout).
 */
export function itemsToBlocks(items: unknown): FlatBlock[] | null {
  const rows = (Array.isArray(items) ? items : []).filter((row) => row && typeof row === "object") as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const get = (row: Record<string, unknown>, ...names: string[]) => {
    for (const name of names) {
      const key = Object.keys(row).find((candidate) => slug(candidate) === name);
      if (key !== undefined && row[key] !== undefined && row[key] !== null) return row[key];
    }
    return undefined;
  };
  if (rows.every((row) => get(row, "front") !== undefined && get(row, "back") !== undefined)) {
    return rows.map((row) => ({ type: "flashcard", front: text(get(row, "front")), back: text(get(row, "back")), hint: text(get(row, "hint")) }));
  }
  if (!rows.every((row) => get(row, "question") !== undefined)) return null;
  return rows.map((row, index) => {
    const question = text(get(row, "question"));
    const options = (Array.isArray(get(row, "options")) ? (get(row, "options") as unknown[]) : []).map(text);
    const answer = text(get(row, "answer"));
    const kind = text(get(row, "type")).toLowerCase();
    const explanation = text(get(row, "explanation"));
    const points = get(row, "points");
    const number = index + 1;
    if (/true|false|verdad|v_f|vf/.test(kind) || (options.length === 2 && /^(true|verdadero|cierto|vrai|wahr)/i.test(options[0] || ""))) {
      return { type: "question_tf", number, statement: question, is_true: isTrue(answer, options), explanation, points };
    }
    if (/short|open|abiert|corta|free/.test(kind) || !options.length) {
      return { type: "question_open", number, question, answer_guide: answer, explanation, points };
    }
    const answerIndex = Math.max(0, options.findIndex((option) => option.trim().toLowerCase() === answer.trim().toLowerCase()));
    return { type: "question_mc", number, question, options, answer_index: answerIndex, explanation, points };
  });
}

/** Flat blocks → the item rows the activity engine (Do it on Luna) understands. */
export function blocksToActivityItems(blocks: FlatBlock[]): Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const block of blocks) {
    if (block.type === "question_mc") {
      const options = (Array.isArray(block.options) ? block.options : []).map(text);
      items.push({ question: text(block.question), type: "multiple-choice", options, answer: options[Number(block.answer_index) || 0] ?? "", explanation: text(block.explanation) });
    } else if (block.type === "question_tf") {
      items.push({ question: text(block.statement), type: "true-false", options: ["True", "False"], answer: block.is_true ? "True" : "False", explanation: text(block.explanation) });
    } else if (block.type === "question_open") {
      items.push({ question: text(block.question), type: "short-answer", options: [], answer: text(block.answer_guide), explanation: text(block.explanation) });
    } else if (block.type === "question_fill") {
      items.push({ question: text(block.sentence).replace(/_{2,}/g, "____"), type: "short-answer", options: [], answer: text(block.answer), explanation: "" });
    } else if (block.type === "flashcard") {
      items.push({ front: text(block.front), back: text(block.back) });
    }
  }
  return items;
}

/* ---------------------------------------------------------------- plan */

export type OutputKind = "quiz" | "document" | "cards";

export interface PlannedRun {
  /** Instance number (unique per document) — keeps two runs of the same component apart. */
  n: number;
  componentKey: string;
  data: Record<string, unknown>;
  /** Options that make no sense for this data (e.g. points nobody supplied) start switched off. */
  autoOff: Record<string, boolean>;
}

export interface OutputPlan {
  kind: OutputKind;
  title: string;
  subtitle: string;
  /** Header / footer components around the content. */
  start: string[];
  end: string[];
  runs: PlannedRun[];
  /** Every component in display order: structure first, then content in order of appearance. */
  components: { key: string; fixed: boolean }[];
}

interface RunSpec {
  /** A run folds consecutive blocks of the component into one list. */
  merge: boolean;
  build(blocks: FlatBlock[]): { data: Record<string, unknown>; autoOff: Record<string, boolean> };
}

/** Switches an option off when it has nothing to show. */
const off = (key: string, when: boolean): Record<string, boolean> => (when ? { [key]: false } : {});
const hasValue = (value: unknown) => value !== undefined && value !== null && text(value).trim() !== "";

const RUNS: Record<string, RunSpec> = {
  "block-section-header": {
    merge: true,
    build: (blocks) => ({
      data: { sections: blocks.map((block) => ({ section_title: text(block.text), section_intro: "" })) },
      autoOff: { intro: false }
    })
  },
  "block-paragraph": {
    merge: true,
    build: (blocks) => ({ data: { paragraphs: blocks.map((block) => ({ text: text(block.text) })) }, autoOff: {} })
  },
  "block-key-points": {
    merge: true,
    build: (blocks) => {
      const title = text(blocks.find((block) => hasValue(block.title))?.title);
      const points = blocks.flatMap((block) => (Array.isArray(block.items) ? block.items : []).map((item) => ({ point: text(item) })));
      return { data: { title, points }, autoOff: off("title", !title) };
    }
  },
  "block-callout": {
    merge: false,
    build: (blocks) => ({ data: { note: text(blocks[0]?.text) }, autoOff: {} })
  },
  "block-exam-question": {
    merge: true,
    build: (blocks) => ({
      data: {
        questions: blocks.map((block) => {
          const options = (Array.isArray(block.options) ? block.options : []).map(text);
          const index = Math.max(0, Number(block.answer_index) || 0);
          const explanation = text(block.explanation).trim();
          const answer = options.length ? `${letter(index)} · ${options[index] ?? ""}` : "";
          return {
            question: text(block.question),
            options,
            answer: explanation && answer.length + explanation.length < 150 ? `${answer} — ${explanation}` : answer,
            points: hasValue(block.points) ? Number(block.points) : ""
          };
        })
      },
      autoOff: off("points", !blocks.some((block) => hasValue(block.points)))
    })
  },
  "block-open-question": {
    merge: true,
    build: (blocks) => ({
      data: { questions: blocks.map((block) => ({ question: text(block.question), points: hasValue(block.points) ? Number(block.points) : "" })) },
      autoOff: off("points", !blocks.some((block) => hasValue(block.points)))
    })
  },
  "block-true-false": {
    merge: true,
    build: (blocks) => ({ data: { statements: blocks.map((block) => ({ statement: text(block.statement), answer: Boolean(block.is_true) })) }, autoOff: {} })
  },
  "block-fill-blanks": {
    merge: true,
    build: (blocks) => ({
      data: { sentences: blocks.map((block) => ({ sentence: text(block.sentence).replace(/_{2,}/g, "____"), answer: text(block.answer), hint: text(block.hint) })) },
      autoOff: off("hint", !blocks.some((block) => hasValue(block.hint)))
    })
  },
  "block-flashcard-single": {
    merge: true,
    build: (blocks) => ({ data: { cards: blocks.map((block) => ({ front: text(block.front), back: text(block.back) })) }, autoOff: {} })
  }
};

const QUESTION_TYPES = new Set(["question_mc", "question_open", "question_tf", "question_fill"]);

/**
 * Plans the document: which components the output uses, in which runs. `framed` outputs (quiz
 * items, flashcard sets) get the header/footer Template Studio's quiz and game types always have;
 * block agents bring their own headings, so nothing is added around them.
 */
export function planOutput(input: { blocks: FlatBlock[]; title?: string; subtitle?: string; framed?: boolean }): OutputPlan | null {
  const blocks = input.blocks.filter((block) => block && typeof block.type === "string");
  const runs: PlannedRun[] = [];
  let open: { componentKey: string; blocks: FlatBlock[] } | null = null;
  const groups: { componentKey: string; blocks: FlatBlock[] }[] = [];
  for (const block of blocks) {
    const componentKey = COMPONENT_FOR_BLOCK[block.type];
    // Dividers only separate: they end a run only for components that cannot merge.
    if (componentKey === null) continue;
    if (!componentKey || !RUNS[componentKey]) continue;
    if (open && open.componentKey === componentKey && RUNS[componentKey].merge) open.blocks.push(block);
    else { open = { componentKey, blocks: [block] }; groups.push(open); }
  }
  if (!groups.length) return null;
  groups.forEach((group, index) => {
    const built = RUNS[group.componentKey].build(group.blocks);
    runs.push({ n: index + 1, componentKey: group.componentKey, data: built.data, autoOff: built.autoOff });
  });

  const hasQuestions = blocks.some((block) => QUESTION_TYPES.has(block.type));
  const onlyCards = blocks.every((block) => block.type === "flashcard" || COMPONENT_FOR_BLOCK[block.type] === null);
  const kind: OutputKind = onlyCards ? "cards" : input.framed && hasQuestions ? "quiz" : "document";
  const start = input.framed ? [kind === "quiz" ? QUIZ_HEADER : CARDS_HEADER] : [];
  const end = input.framed && kind === "quiz" ? [FOOTER] : [];

  const content: string[] = [];
  for (const run of runs) if (!content.includes(run.componentKey)) content.push(run.componentKey);
  return {
    kind,
    title: input.title || "Untitled",
    subtitle: input.subtitle || "",
    start,
    end,
    runs,
    components: [...start.map((key) => ({ key, fixed: true })), ...content.map((key) => ({ key, fixed: false })), ...end.map((key) => ({ key, fixed: true }))]
  };
}

/* ---------------------------------------------------------------- document */

export interface OutputDocument {
  template: Template;
  /** The saved-row shape the render API expects. */
  compiled: ReturnType<typeof compileForSave>;
  data: DataObject;
  /** Page sizes (layouts) and views, as the preview matrix shows them. */
  layouts: { id: string; label: string; class: "paged" | "slides" }[];
  views: { name: string }[];
}

/** Gives every top-level field of a block a unique name, so two runs of one component never share data. */
function renameFields(block: BlockDef, n: number): BlockDef {
  const copy = JSON.parse(JSON.stringify(block)) as BlockDef;
  copy.fields = copy.fields.map((field) => ({ ...field, name: `${field.name} ${n}` }));
  return copy;
}

/** Builds the Template Studio document for a plan: assembled template + the data that fills it. */
export function buildOutputDocument(plan: OutputPlan, styles: OutputStyles): OutputDocument {
  const selections: { block: BlockDef; accent: AccentPreset; toggles: Record<string, boolean> }[] = [];
  const data: DataObject = {};

  const pushFixed = (key: string) => {
    const resolved = resolveStyle(key, styles);
    if (!resolved) return;
    const autoOff = off("subtitle", key === QUIZ_HEADER && !plan.subtitle);
    selections.push({ block: resolved.block, accent: resolved.accent, toggles: { ...resolved.toggles, ...autoOff, ...(styles[key]?.toggles || {}) } });
  };

  plan.start.forEach(pushFixed);
  for (const run of plan.runs) {
    const resolved = resolveStyle(run.componentKey, styles);
    if (!resolved) continue;
    const block = renameFields(resolved.block, run.n);
    selections.push({ block, accent: resolved.accent, toggles: { ...defaultToggles(resolved.block), ...run.autoOff, ...(styles[run.componentKey]?.toggles || {}) } });
    for (const [key, value] of Object.entries(run.data)) data[`${slug(key)}_${run.n}`] = value as DataObject[string];
  }
  plan.end.forEach(pushFixed);
  data.title = plan.title;
  data.subtitle = plan.subtitle;

  const cards = plan.kind === "cards";
  const template = assembleTemplate(plan.title || "Output", cards ? 148 : 210, cards ? 105 : 297, selections);
  const labels = cards ? ["Cards"] : ["A4", "Letter", "Slides 16:9"];
  return {
    template,
    compiled: compileForSave(template, ""),
    data,
    layouts: template.layouts.map((layout, index) => ({ id: layout.id, label: labels[index] || layout.name || `Layout ${index + 1}`, class: layout.class })),
    views: (template.layouts[0]?.views || []).map((view) => ({ name: view.name }))
  };
}

/* ---------------------------------------------------------------- saved templates → styles */

function inferAccent(group: GroupElement): string | undefined {
  const counts = new Map<string, number>();
  const palettesByColour = new Map<string, string>();
  for (const palette of PALETTES) for (const colour of [palette.main, palette.deep, palette.tint, palette.soft, palette.line]) palettesByColour.set(colour.toLowerCase(), palette.id);
  const visit = (element: Element) => {
    for (const colour of [element.style?.fill, element.style?.stroke, element.style?.color]) {
      const id = colour ? palettesByColour.get(String(colour).toLowerCase()) : undefined;
      // Green is used for the answer band in every component; ignore it unless nothing else shows up.
      if (id) counts.set(id, (counts.get(id) || 0) + (id === "green" ? 0.1 : 1));
    }
    if (element.type === "group") element.children.forEach(visit);
  };
  visit(group);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/**
 * A template, reduced to what it really is: which format and colour each component has. Only
 * components the output actually uses (`componentKeys`) are returned.
 */
export function styleFromTemplate(template: Template | null | undefined, componentKeys: string[]): OutputStyles {
  const out: OutputStyles = {};
  const layout = template?.layouts?.[0];
  if (!layout) return out;
  const visit = (elements: Element[]) => {
    for (const element of elements) {
      if (element.type !== "group") continue;
      const origin = element.origin;
      if (origin?.blockId) {
        const key = componentKeys.find((candidate) => candidate === origin.blockId || formatsOf(candidate).some((format) => format.id === origin.blockId));
        if (key && !out[key]) out[key] = { blockId: origin.blockId, accentId: origin.accentId || inferAccent(element) };
      }
    }
  };
  for (const page of layout.pages) visit(page.elements);
  return out;
}


/* ---------------------------------------------------------------- outputs that are neither blocks nor questions */

/**
 * Agents with free-form fields (no quiz questions, no cards) are laid out automatically by
 * Template Studio's own generator: a header, a card per item and a footer. The accent is the only
 * thing to choose, and it comes from the same palette as every other component.
 */
export function buildAutoDocument(input: { fields: { name: string; label?: string; type?: string; repeatScope?: string; description?: string }[]; items: Record<string, unknown>[]; rootData?: Record<string, unknown>; title: string; accentId?: string }): OutputDocument {
  const accent = ACCENT_PRESETS.find((preset) => preset.id === input.accentId) || ACCENT_PRESETS[0];
  const fields = fieldsFromAgentFields(input.fields);
  const template = templateFromFields(fields, { name: input.title || "Output", accent });
  const keyed = (row: Record<string, unknown>) => Object.fromEntries(Object.entries(row).map(([key, value]) => [slug(key), value]));
  const data: DataObject = {};
  for (const [key, value] of Object.entries(input.rootData || {})) data[slug(key)] = value as DataObject[string];
  data.items = input.items.map(keyed) as unknown as DataObject[string];
  const layouts = template.layouts.map((layout) => ({ id: layout.id, label: "A4", class: layout.class }));
  return { template, compiled: compileForSave(template, ""), data, layouts, views: (template.layouts[0]?.views || []).map((view) => ({ name: view.name })) };
}
