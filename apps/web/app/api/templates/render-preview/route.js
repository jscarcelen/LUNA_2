import { NextResponse } from "next/server";
import { renderTemplateHtml, renderTemplatePdfBuffer, renderTemplateDocxBuffer } from "../../../../modules/ai-tools/render/templateExporters.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveRenderVariant(template, format) {
  const variants = Array.isArray(template?.renderVariants) ? template.renderVariants : [];
  const variant = variants.find((item) => item.format === format && item.enabled !== false);
  if (!variant) return template;
  const page = (template.pageLayouts || []).find((item) => item.id === variant.pageLayoutId);
  const blocks = variant.blocks?.length ? variant.blocks : (page?.blocks || template.canvasBlocks);
  return {
    ...template,
    pageFormat: variant.pageFormat || template.pageFormat,
    activePageId: page?.id || template.activePageId,
    canvasBlocks: blocks,
    pageLayouts: page ? template.pageLayouts.map((item) => item.id === page.id ? { ...item, blocks } : item) : template.pageLayouts
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
