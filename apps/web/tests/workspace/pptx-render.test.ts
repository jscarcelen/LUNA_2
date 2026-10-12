import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { pptxToHtml } from "../../lib/pptxRender.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("pptxToHtml", () => {
  it("embeds slide pictures as data URIs next to the slide text", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="p" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="r"><a:p><a:r><a:t>Hello</a:t></a:r></a:p><a:blip r:embed="rId2"/></p:sld>`);
    zip.file("ppt/slides/_rels/slide1.xml.rels", `<Relationships><Relationship Id="rId2" Target="../media/image1.png"/></Relationships>`);
    zip.file("ppt/media/image1.png", PNG);
    const out = await pptxToHtml(await zip.generateAsync({ type: "nodebuffer" }));
    expect(out.imageCount).toBe(1);
    expect(out.html).toContain("<p>Hello</p>");
    expect(out.html).toMatch(/src="data:image\/(png|jpeg);base64,/);
  });
});
