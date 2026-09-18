import { NextResponse } from "next/server";
import { renderTemplateHtml, renderTemplatePdfBuffer, renderTemplateDocxBuffer } from "../../../../modules/ai-tools/render/templateExporters.js";
import { renderDocHtml, renderDocPdfBuffer, renderDocDocxBuffer, renderDocPptxBuffer } from "../../../../modules/ai-tools/render/docRenderers.js";
import { renderHtml as renderV3Html, renderPdf as renderV3Pdf, renderDocx as renderV3Docx, renderPptx as renderV3Pptx } from "../../../../modules/template-studio/engine/renderers/index";
import { normalizeTemplate } from "../../../../modules/template-studio/engine/migrate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveRenderVariant(template, format) {
  const variants = Array.isArray(template?.renderVariants) ? template.renderVariants : [];
  const variant = variants.find((item) => item.format === format && item.enabled !== false);
  if (!variant) return template;
  const pages = Array.isArray(variant.pages) && variant.pages.length ? variant.pages : [];
  const nextPageLayouts = Array.isArray(template.pageLayouts) && template.pageLayouts.length
    ? template.pageLayouts.map((page) => {
        const mapped = pages.find((item) => item.id === page.id);
        return mapped ? { ...page, ...mapped, blocks: Array.isArray(mapped.blocks) ? mapped.blocks : page.blocks || [] } : page;
      })
    : [];
  const resolvedLayouts = nextPageLayouts.length
    ? nextPageLayouts
    : (pages.length ? pages.map((page) => ({ ...page, blocks: Array.isArray(page.blocks) ? page.blocks : [] })) : template.pageLayouts || []);
  for (const page of pages) {
    const existing = resolvedLayouts.findIndex((item) => item.id === page.id);
    if (existing === -1) resolvedLayouts.push({ ...page, blocks: Array.isArray(page.blocks) ? page.blocks : [] });
    else resolvedLayouts[existing] = { ...resolvedLayouts[existing], ...page, blocks: Array.isArray(page.blocks) ? page.blocks : resolvedLayouts[existing].blocks || [] };
  }
  const activePage = resolvedLayouts.find((page) => page.id === template.activePageId) || resolvedLayouts[0] || null;
  const blocks = resolvedLayouts.flatMap((page) => Array.isArray(page.blocks) ? page.blocks : []);
  return {
    ...template,
    pageFormat: variant.pageFormat || template.pageFormat,
    activePageId: activePage?.id || template.activePageId,
    canvasBlocks: blocks,
    pageLayouts: resolvedLayouts
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const template = body?.template && typeof body.template === "object" ? body.template : {};
    const sampleData = body?.sampleData && typeof body.sampleData === "object" ? body.sampleData : {};
    const format = String(body?.format || "html").trim();

    // Template Studio v3: one layout engine for every format; layout/view selectable.
    if (template.templateV3 && typeof template.templateV3 === "object") {
      const doc = normalizeTemplate(template.templateV3);
      const options = { layoutId: body?.layoutId || undefined, viewId: body?.viewId || null, showFieldMarkers: Boolean(body?.showFieldMarkers) };
      if (format === "html") {
        const rendered = renderV3Html(doc, sampleData, options);
        return NextResponse.json({ html: rendered.html, pageCount: rendered.pageCount, overflows: rendered.overflows });
      }
      if (format === "pdf") return NextResponse.json({ fileBase64: (await renderV3Pdf(doc, sampleData, options)).toString("base64"), mimeType: "application/pdf" });
      if (format === "docx") return NextResponse.json({ fileBase64: (await renderV3Docx(doc, sampleData, options)).toString("base64"), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      if (format === "pptx") return NextResponse.json({ fileBase64: (await renderV3Pptx(doc, sampleData, options)).toString("base64"), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
    }

    // Document-model templates (Template Studio v2) share one layout engine for every format.
    if (template.docModel && typeof template.docModel === "object") {
      const doc = template.docModel;
      const showFieldMarkers = Boolean(body?.showFieldMarkers);
      if (format === "html") return NextResponse.json({ html: renderDocHtml(doc, sampleData, { showFieldMarkers }) });
      if (format === "pdf") return NextResponse.json({ fileBase64: (await renderDocPdfBuffer(doc, sampleData)).toString("base64"), mimeType: "application/pdf" });
      if (format === "docx") return NextResponse.json({ fileBase64: (await renderDocDocxBuffer(doc, sampleData)).toString("base64"), mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      if (format === "pptx") return NextResponse.json({ fileBase64: (await renderDocPptxBuffer(doc, sampleData)).toString("base64"), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
      return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
    }

    const resolvedTemplate = resolveRenderVariant(template, format);
    if (format === "html") {
      return NextResponse.json({ html: renderTemplateHtml(resolvedTemplate, sampleData) });
    }
    if (format === "pdf") {
      const buffer = await renderTemplatePdfBuffer(resolvedTemplate, sampleData);
      return NextResponse.json({ fileBase64: buffer.toString("base64"), mimeType: "application/pdf" });
    }
    if (format === "docx") {
      const buffer = await renderTemplateDocxBuffer(resolvedTemplate, sampleData);
      return NextResponse.json({
        fileBase64: buffer.toString("base64"),
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      });
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error.message || error) }, { status: 500 });
  }
}
