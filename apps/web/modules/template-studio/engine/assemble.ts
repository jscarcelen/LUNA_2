/**
 * Assembles the sections the template generator designed into one template.
 *
 * Each section arrives as a component (the same DSL the component chatbot produces); here they
 * become the document: stacked in order on the page, with the repeating section flowing, headers
 * and footers anchored to their pages, and the requested views hiding the fields they should hide.
 */
import type { Element, FieldDef, GroupElement, Template, View } from "./types";
import { createLayout, createPage, createTemplate, createView, flattenFields } from "./model";
import { blockFromDsl, type DslComponent } from "./componentDsl";
import { instantiateBlock } from "./blocks";

export interface DesignedSection {
  title: string;
  role: "header" | "content" | "section" | "footer";
  repeats: boolean;
  placement: "flow" | "fixed" | "new_page";
  pageScope: "page" | "first" | "every" | "last";
  dsl: DslComponent;
}

export interface TemplateBrief {
  name: string;
  canvas?: string;
  accent?: string;
  views?: { name: string; description?: string; hideFields?: string[] }[];
}

const norm = (value: string) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Builds a template from a brief and the components designed for its sections. */
export function assembleTemplate(brief: TemplateBrief, sections: DesignedSection[]): Template {
  const template = createTemplate(brief.name || "Generated template");
  template.editorMode = "simple";
  const layout = brief.canvas && brief.canvas !== "a4-portrait" ? createLayout(brief.name || "Layout", brief.canvas) : template.layouts[0];
  if (layout !== template.layouts[0]) template.layouts = [layout];

  const pageWidth = layout.canvas.width;
  const left = layout.margins.left;
  const width = pageWidth - layout.margins.left - layout.margins.right;
  const elements: Element[] = [];
  let cursor = layout.margins.top;

  for (const section of sections) {
    const block = blockFromDsl({ ...section.dsl, name: section.dsl.name || section.title });
    const { fields, elements: blockElements } = instantiateBlock(block, template.fields, brief.accent ? { accent: { id: "brief", label: "Brief", main: brief.accent, tint: `${brief.accent}22` } } : {});
    template.fields = fields;
    let group = blockElements[0] as GroupElement | undefined;
    if (!group) continue;
    const isFooter = section.role === "footer";
    // A repeating section must be able to split across pages, and only a flow-repeat group can.
    // The designed block wraps its repeat in an outer group, so the repeat is lifted out and any
    // fixed part above it (a table head, a caption) becomes its own small block before it.
    if (section.repeats && !isFooter) {
      const repeatChild = group.children.find((child): child is GroupElement => child.type === "group" && child.repeat?.mode === "flow");
      if (repeatChild) {
        const above = group.children.filter((child) => child !== repeatChild && child.frame.y < repeatChild.frame.y);
        if (above.length) {
          const top = Math.min(...above.map((child) => child.frame.y));
          const bottom = Math.max(...above.map((child) => child.frame.y + child.frame.h));
          const intro = { ...group, id: `${group.id}_intro`, children: above.map((child) => ({ ...child, frame: { ...child.frame, y: child.frame.y - top } })), frame: { ...group.frame, h: bottom - top }, repeat: null } as GroupElement;
          placeSection(intro, bottom - top, false);
        }
        repeatChild.frame = { ...repeatChild.frame, x: 0, y: 0 };
        group = repeatChild;
      }
    }
    const height = group.frame.h || 30;
    group.name = section.title || group.name;
    placeSection(group, height, isFooter, section);
  }

  function placeSection(group: GroupElement, height: number, isFooter: boolean, section?: DesignedSection) {
    group.frame = {
      x: left,
      // Blocks are drawn 186 mm wide; scale the whole group to this page's usable width.
      y: isFooter ? layout.canvas.height - layout.margins.bottom - height : cursor,
      w: width,
      h: height
    };
    if (width !== 186) scaleChildren(group, width / 186);
    group.placement = isFooter ? "fixed" : section?.placement || "flow";
    group.pageScope = { mode: isFooter ? "every" : section?.pageScope === "page" || !section ? "page" : (section.pageScope || "first") } as GroupElement["pageScope"];
    elements.push(group);
    if (!isFooter) cursor += height + 6;
  }

  layout.pages = [createPage({ elements })];

  /* ---------------------------------------------------------------- views */
  const wanted = (brief.views || []).filter((view) => view.name);
  if (wanted.length) {
    const first = wanted[0];
    layout.views[0].name = first.name;
    layout.views[0].description = first.description || "";
    const extra: View[] = wanted.slice(1).map((view) => createView(view.name, { description: view.description || "" }));
    layout.views = [layout.views[0], ...extra];
    const all = [layout.views[0], ...extra];
    const byField = new Map(flattenFields(template.fields).map((entry) => [norm(entry.field.name), entry.field.id]));
    // A field hidden in a view means: every element bound to it is invisible there.
    for (let index = 0; index < all.length; index += 1) {
      const hide = new Set((wanted[index].hideFields || []).map(norm).map((name) => byField.get(name)).filter(Boolean) as string[]);
      if (!hide.size) continue;
      const visibleViews = all.filter((_, other) => other !== index).map((view) => view.id);
      walk(layout.pages[0].elements, (element) => {
        if ((element.type === "text" || element.type === "image") && element.source.type === "field" && hide.has(element.source.fieldId)) {
          element.visibility = { views: visibleViews };
        }
      });
    }
  }
  return template;
}

function walk(elements: Element[], visit: (element: Element) => void) {
  for (const element of elements) {
    visit(element);
    if (element.type === "group") walk((element as GroupElement).children, visit);
  }
}

function scaleChildren(group: GroupElement, ratio: number) {
  const scale = (element: Element) => {
    element.frame = { x: element.frame.x * ratio, y: element.frame.y * ratio, w: element.frame.w * ratio, h: element.frame.h * ratio };
    if (element.style.fontSize) element.style.fontSize = Math.max(6, Math.round(element.style.fontSize * ratio * 10) / 10);
    if (element.type === "group") (element as GroupElement).children.forEach(scale);
  };
  group.children.forEach(scale);
}

/** Field names a template exposes — used to tell the generator what the user already has. */
export function fieldNames(fields: FieldDef[]): string[] {
  return flattenFields(fields).map((entry) => entry.field.name);
}
