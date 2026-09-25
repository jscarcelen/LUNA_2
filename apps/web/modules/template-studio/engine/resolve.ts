import type { ContentSource, DataObject, DataValue, Element, FieldDef, GroupElement, ID, Layout, Page, Style, View } from "./types";
import { findField, slug } from "./model";
import { renderMath } from "./latex";

/** Applies a view's overrides and visibility filter to a page's elements. */
export function resolveView(layout: Layout, viewId: ID | null): Page[] {
  const view = layout.views.find((item) => item.id === viewId) || layout.views[0] || null;
  const pages = view?.pages || layout.pages;
  if (!view) return pages;
  const apply = (elements: Element[]): Element[] =>
    elements
      .filter((element) => !element.visibility.views || element.visibility.views.includes(view.id))
      .filter((element) => !view.overrides[element.id]?.hidden)
      .map((element) => {
        const override = view.overrides[element.id];
        const merged: Element = override
          ? ({ ...element, style: { ...element.style, ...(override.style || {}) }, ...(override.source && "source" in element ? { source: override.source } : {}) } as Element)
          : element;
        if (merged.type !== "group") return merged;
        const group = merged as GroupElement;
        const kept = apply(group.children);
        const lost = kept.length !== group.children.length;
        return ({
          ...group,
          children: kept,
          ...(lost ? { fitContent: true, designedBottom: Math.max(0, ...group.children.map((child) => child.frame.y + child.frame.h)) } : {})
        } as Element);
      });
  return pages.map((page) => ({ ...page, elements: apply(page.elements) }));
}

export function isElementVisibleInView(element: Element, view: View | null): boolean {
  if (!view) return true;
  if (element.visibility.views && !element.visibility.views.includes(view.id)) return false;
  return !view.overrides[element.id]?.hidden;
}

/* ---------------------------------------------------------------- data scopes */

export interface Scope { data: DataValue; index: number }

function lookup(data: DataValue, field: FieldDef): DataValue | undefined {
  if (!data || typeof data !== "object" || Array.isArray(data)) return undefined;
  const record = data as DataObject;
  if (record[field.id] !== undefined) return record[field.id];
  const key = slug(field.name);
  if (record[key] !== undefined) return record[key];
  const loose = Object.keys(record).find((candidate) => slug(candidate) === key);
  return loose ? record[loose] : undefined;
}

/** Resolves a field's value against the scope stack (innermost first). Scalars bound to an array item resolve to the item itself. */
export function resolveFieldValue(fields: FieldDef[], fieldId: ID, scopes: Scope[]): DataValue | undefined {
  const field = findField(fields, fieldId);
  if (!field) return undefined;
  for (const scope of scopes) {
    if (scope.data === null || scope.data === undefined) continue;
    if (typeof scope.data !== "object" || Array.isArray(scope.data)) {
      // Scope is a scalar array item (e.g. options[] of strings): the item field resolves to it.
      if (scope === scopes[0]) return scope.data;
      continue;
    }
    const value = lookup(scope.data, field);
    if (value !== undefined) return value;
  }
  if (slug(field.name) === "number" && scopes[0]) return scopes[0].index + 1;
  return undefined;
}

/** 0 → A, 25 → Z, 26 → AA: an option letter that never runs out. */
function letterFor(index: number): string {
  let value = Math.max(0, Math.floor(index));
  let out = "";
  do {
    out = String.fromCharCode(65 + (value % 26)) + out;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return out;
}

export function resolveSource(fields: FieldDef[], source: ContentSource, scopes: Scope[], pageNumber?: number): { value: DataValue | undefined; isField: boolean } {
  if (source.type === "static") {
    // `{{n}}` in static text is the 1-based index of the innermost repeated item (question numbers);
    // `{{A}}` is the same index as a letter, which is how answer options are labelled on an exam.
    const index = scopes[0]?.index ?? 0;
    const value = source.value
      .replace(/\{\{n\}\}/g, String(index + 1))
      .replace(/\{\{A\}\}/g, letterFor(index))
      .replace(/\{\{a\}\}/g, letterFor(index).toLowerCase())
      .replace(/\{\{page\}\}/g, pageNumber === undefined ? "{{page}}" : String(pageNumber));
    return { value, isField: false };
  }
  return { value: resolveFieldValue(fields, source.fieldId, scopes), isField: true };
}

export function valueToText(value: DataValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((item) => valueToText(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  // Formulas are written as LaTeX by the agents; every export draws plain text, so convert here.
  return renderMath(String(value));
}

/* ---------------------------------------------------------------- rich text (Markdown + LaTeX) → plain lines for M1 */

/** Strips Markdown emphasis/headers and keeps LaTeX as-is; renderers that can typeset do so later. */
export function richTextToLines(text: string): string[] {
  return renderMath(String(text || ""))
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(?!\s)(.+?)\*(?=\s|$)/g, "$1$2")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "•  ")
    .split(/\r?\n/);
}

export function mergeStyle(base: Style, override?: Partial<Style>): Style {
  return { ...base, ...(override || {}) };
}
