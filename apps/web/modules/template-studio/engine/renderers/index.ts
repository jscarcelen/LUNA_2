import type { DataObject, ExportFormat, ID, LayoutClass, Template } from "../types";
import { EXPORTS_BY_CLASS } from "../types";
import { layoutDocument } from "../layout";
import { flattenFields } from "../model";
// The v2 renderers already draw laid-out pages; v3 produces the same page/item shape.
import { renderDocHtml, renderDocPdfBuffer, renderDocDocxBuffer, renderDocPptxBuffer } from "../../../ai-tools/render/docRenderers.js";

export interface RenderOptions { layoutId?: ID; viewId?: ID | null; showFieldMarkers?: boolean; /** Field names or ids to outline in the preview. */ highlightFields?: string[] }

/** Field names the caller gave (template slot names) resolved to the ids the layout items carry. */
function highlightIds(template: Template, names: string[] = []): string[] {
  if (!names.length) return [];
  const wanted = new Set(names.map((name) => String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, "")).filter(Boolean));
  const out: string[] = [];
  for (const entry of flattenFields(template.fields)) {
    const key = entry.field.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (wanted.has(key) || wanted.has(entry.field.id)) out.push(entry.field.id);
  }
  return out.length ? out : names;
}

/** Adapter: v3 layout result → the {size, pages} the renderers consume. */
function toRenderable(template: Template, data: DataObject, options: RenderOptions) {
  const layout = template.layouts.find((item) => item.id === options.layoutId) || template.layouts[0];
  const result = layoutDocument(template, data, options);
  return { size: { width: layout.canvas.width, height: layout.canvas.height }, pages: result.pages.map((page) => ({ ...page, background: page.background?.src ? { src: page.background.src } : page.background?.color ? { color: page.background.color } : null, items: page.items.map((item) => (item.type === "text" ? { ...item, path: item.fieldId } : item)) })), result };
}

export function exportersFor(layoutClass: LayoutClass): ExportFormat[] {
  return EXPORTS_BY_CLASS[layoutClass];
}

export function renderHtml(template: Template, data: DataObject, options: RenderOptions = {}): { html: string; pageCount: number; overflows: number } {
  const prelaid = toRenderable(template, data, options);
  return { html: renderDocHtml({}, data, { showFieldMarkers: Boolean(options.showFieldMarkers), prelaid, highlight: highlightIds(template, options.highlightFields) }), pageCount: prelaid.pages.length, overflows: prelaid.result.overflows.length };
}
export async function renderPdf(template: Template, data: DataObject, options: RenderOptions = {}): Promise<Buffer> {
  const prelaid = toRenderable(template, data, options);
  return renderDocPdfBuffer({}, data, { prelaid });
}
export async function renderDocx(template: Template, data: DataObject, options: RenderOptions = {}): Promise<Buffer> {
  const prelaid = toRenderable(template, data, options);
  return renderDocDocxBuffer({}, data, { prelaid });
}
export async function renderPptx(template: Template, data: DataObject, options: RenderOptions = {}): Promise<Buffer> {
  const prelaid = toRenderable(template, data, options);
  return renderDocPptxBuffer({}, data, { prelaid });
}
