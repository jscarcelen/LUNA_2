/**
 * Template Studio v3 — canonical document model.
 *
 * Philosophy: the agent owns CONTENT, the template owns PRESENTATION, a mapping layer connects
 * them. Everything the editor shows derives from this JSON; UI state is never the model.
 */

export type ID = string;

/* ---------------------------------------------------------------- fields (the schema a template expects) */

export type LeafFieldType = "text" | "rich_text" | "number" | "boolean" | "image" | "formula";
export type StructFieldType = "object" | "array";
export type FieldType = LeafFieldType | StructFieldType;

export interface FieldDef {
  /** Stable, never shown; bindings reference this so renaming is safe. */
  id: ID;
  /** Human-editable display name. */
  name: string;
  type: FieldType;
  description?: string;
  /** object → members; array → exactly one child describing the item shape. */
  children?: FieldDef[];
  required?: boolean;
  /** Allowed values for text fields (e.g. a question "Type": multiple_choice | true_false | open). */
  options?: string[];
}

/* ---------------------------------------------------------------- template → layout → view */

export type LayoutClass = "paged" | "slides";
export type ExportFormat = "pdf" | "docx" | "html_print" | "png" | "pptx" | "html_slideshow";

export const EXPORTS_BY_CLASS: Record<LayoutClass, ExportFormat[]> = {
  paged: ["pdf", "docx", "html_print", "png"],
  slides: ["pptx", "pdf", "html_slideshow", "png"]
};

export interface Margins { top: number; right: number; bottom: number; left: number }
export interface Canvas { width: number; height: number; unit: "mm" }

export interface Template {
  id: ID;
  version: 3;
  name: string;
  /** Simple = ordered blocks that flow into any page size; advanced = free canvas. */
  editorMode?: "simple" | "advanced";
  fields: FieldDef[];
  layouts: Layout[];
  createdAt: string;
  updatedAt: string;
}

export interface Layout {
  id: ID;
  name: string;
  class: LayoutClass;
  canvas: Canvas;
  margins: Margins;
  views: View[];
  pages: Page[];
}

export interface ElementOverride {
  hidden?: boolean;
  style?: Partial<Style>;
  source?: ContentSource;
}

export interface View {
  id: ID;
  name: string;
  description?: string;
  /** Formats offered for this view; undefined = every format of the layout class. */
  exports?: ExportFormat[];
  /** Overrides by element id. Inheritance from the layout is the default. */
  overrides: Record<ID, ElementOverride>;
  /** Present only when the view has been detached from the layout's pages. */
  pages?: Page[];
}

export type Background =
  | { type: "none" }
  | { type: "color"; value: string }
  | { type: "gradient"; from: string; to: string; angle: number }
  | { type: "image"; src: string; locked: boolean; visible: boolean; opacity: number }
  | { type: "pdf"; src: string; sourcePage: number; locked: boolean; visible: boolean; opacity: number };

export interface Page {
  id: ID;
  background: Background;
  elements: Element[];
}

/* ---------------------------------------------------------------- elements */

/** mm; relative to the parent group (or the page). */
export interface Frame { x: number; y: number; w: number; h: number }

export type PageScope =
  | { mode: "page" }
  | { mode: "first" }
  | { mode: "last" }
  | { mode: "every" }
  | { mode: "selected"; pageIds: ID[] };

export interface Visibility {
  /** undefined = visible in every view. */
  views?: ID[];
}

/** Presentation only — never supplied by the agent. */
export interface Style {
  fontFamily?: "sans" | "serif" | "mono";
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  opacity?: number;
}

export type ContentSource =
  | { type: "static"; value: string }
  | { type: "field"; fieldId: ID };

export interface ElementBase {
  id: ID;
  type: string;
  name?: string;
  frame: Frame;
  style: Style;
  pageScope: PageScope;
  visibility: Visibility;
  locked?: boolean;
}

export interface TextElement extends ElementBase {
  type: "text";
  source: ContentSource;
  format: "plain" | "rich";
  /** Sample shown while designing when the source is a field. */
  placeholder?: string;
}
export interface ImageElement extends ElementBase {
  type: "image";
  source: ContentSource;
}
export interface ShapeElement extends ElementBase {
  type: "rect" | "ellipse" | "line" | "arrow";
}
export interface TableElement extends ElementBase {
  type: "table";
  columns: { header: string; source: ContentSource }[];
  rowsFieldId?: ID;
}

export type GroupLayoutMode = "free" | "vertical" | "horizontal" | "grid";
export type RepeatMode = "flow" | "page" | "grid";

export interface RepeatRule {
  /** Must reference an array field; nested arrays resolve relative to the parent scope. */
  fieldId: ID;
  mode: RepeatMode;
  columns?: number;
}

export interface Pagination {
  breakBefore: boolean;
  breakAfter: boolean;
  keepTogether: boolean;
  allowSplit: boolean;
  maxItemsPerPage?: number;
  overflow: "continue" | "shrink" | "clip";
}

export interface GroupElement extends ElementBase {
  type: "group";
  layout: { mode: GroupLayoutMode; gap: number; columns?: number };
  repeat: RepeatRule | null;
  pagination: Pagination;
  children: Element[];
  /**
   * "Show only when": the group is rendered only when a field of the current item (or document)
   * equals this value. Several sibling groups at the same spot with different values act as
   * "one of" — the agent's output decides which design appears.
   */
  condition?: { fieldId: ID; equals: string } | null;
}

export type Element = TextElement | ImageElement | ShapeElement | TableElement | GroupElement;

/* ---------------------------------------------------------------- data + mapping */

/** JSON produced by an agent (or sample data), shaped like the template's field tree. */
export type DataValue = string | number | boolean | null | DataValue[] | { [key: string]: DataValue };
export type DataObject = { [key: string]: DataValue };

/** templateFieldId → path into agent output, e.g. "items[].question". Stored with the agent preset. */
export type SchemaMapping = Record<ID, string>;

export interface SchemaNode {
  path: string;
  name: string;
  type: FieldType;
  description?: string;
  children?: SchemaNode[];
}

/* ---------------------------------------------------------------- layout output (what renderers draw) */

export interface LaidOutTextItem {
  type: "text";
  x: number; y: number; w: number; h: number;
  style: Required<Pick<Style, "fontFamily" | "fontSize" | "fontWeight" | "color" | "align" | "lineHeight">> & Style;
  lines: string[];
  isField: boolean;
  fieldId?: ID;
  hasValue?: boolean;
  elementId: ID;
}
export interface LaidOutImageItem { type: "image"; x: number; y: number; w: number; h: number; style: Style; src: string; elementId: ID }
export interface LaidOutRectItem { type: "rect"; x: number; y: number; w: number; h: number; style: Style; elementId: ID; ellipse?: boolean }
export interface LaidOutLineItem { type: "line"; x: number; y: number; w: number; h: number; style: Style; elementId: ID; arrow?: boolean }
export type LaidOutItem = LaidOutTextItem | LaidOutImageItem | LaidOutRectItem | LaidOutLineItem;

export interface LaidOutPage {
  width: number;
  height: number;
  background: { src?: string; color?: string; opacity?: number } | null;
  items: LaidOutItem[];
  sourcePageId: ID;
  continuation: boolean;
  /** 1-based item index when the page was produced by a page-repeat group. */
  itemIndex?: number;
}

export interface OverflowReport {
  elementId: ID;
  pageIndex: number;
  reason: "clipped" | "shrunk" | "exceeds-page";
}

export interface LayoutResult {
  pages: LaidOutPage[];
  overflows: OverflowReport[];
  itemCounts: Record<ID, number>;
}
