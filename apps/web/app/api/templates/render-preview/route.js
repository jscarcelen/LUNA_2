import { NextResponse } from "next/server";
import { renderTemplateHtml, renderTemplatePdfBuffer, renderTemplateDocxBuffer } from "../../../../modules/ai-tools/render/templateExporters.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json();
    const template = body?.template && typeof body.template === "object" ? body.template : {};
    const sampleData = body?.sampleData && typeof body.sampleData === "object" ? body.sampleData : {};
    const format = String(body?.format || "html").trim();

    if (format === "html") {
      return NextResponse.json({ html: renderTemplateHtml(template, sampleData) });
    }
    if (format === "pdf") {
      const buffer = await renderTemplatePdfBuffer(template, sampleData);
      return NextResponse.json({ fileBase64: buffer.toString("base64"), mimeType: "application/pdf" });
    }
    if (format === "docx") {
      const buffer = await renderTemplateDocxBuffer(template, sampleData);
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
