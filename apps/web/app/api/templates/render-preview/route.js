import { NextResponse } from "next/server";
import { renderTemplateHtml, renderTemplatePdfBuffer, renderTemplateDocxBuffer } from "../../../../modules/ai-tools/render/templateExporters.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveRenderVariant(template, format) {
  const variants = Array.isArray(template?.renderVariants) ? template.renderVariants : [];
  const variant = variants.find((item) => item.format === format && item.enabled !== false);
  if (!variant) return template;
  const pages = Array.isArray(variant.pages) && variant.pages.length ? variant.pages : [];
  const pageIds = new Set(pages.map((page) => page.id).filter(Boolean));
  const nextPageLayouts = Array.isArray(template.pageLayouts) ? template.pageLayouts.map((page) => {
    const mapped = pages.find((item) => item.id === page.id);
    if (mapped) return { ...page, blocks: Array.isArray(mapped.blocks) ? mapped.blocks : page.blocks || [] };
    return page;
  }) : [];
  const resolvedLayouts = nextPageLayouts.length ? nextPageLayouts : (pages.length ? pages.map((page) => ({ ...page, blocks: Array.isArray(page.blocks) ? page.blocks : [] })) : template.pageLayouts || []);
  const activePage = resolvedLayouts.find((page) => page.id === template.activePageId) || resolvedLayouts[0] || null;
  const blocks = pages.length
    ? resolvedLayouts.flatMap((page) => Array.isArray(page.blocks) ? page.blocks : [])
    : (variant.blocks?.length ? variant.blocks : (activePage?.blocks || template.canvasBlocks || []));
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
