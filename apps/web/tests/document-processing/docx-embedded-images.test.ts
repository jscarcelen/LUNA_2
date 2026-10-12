import JSZip from "jszip";
import { describe, expect, it } from "vitest";
// @ts-ignore JS module
import { buildCanonicalDocumentFromDocxFile } from "../../modules/document-processing/canonical/model.js";
// @ts-ignore JS module
import { renderCanonicalDocumentToHtml } from "../../modules/document-processing/renderers/htmlRenderer.js";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function makeDocx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
  zip.file("word/_rels/document.xml.rels", '<Relationships><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>');
  zip.file("word/media/image1.png", PNG, { base64: true });
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="w" xmlns:wp="wp" xmlns:a="a" xmlns:r="r"><w:body><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="Bell curve"/><a:graphic><a:graphicData><a:blip r:embed="rId5"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body></w:document>'
  );
  return (await zip.generateAsync({ type: "nodebuffer" })).toString("base64");
}

describe("docx embedded images", () => {
  it("embeds the picture in the rendered preview", async () => {
    const cdm: any = await buildCanonicalDocumentFromDocxFile({ name: "t.docx", contentBase64: await makeDocx() }, {});
    const html: string = renderCanonicalDocumentToHtml(cdm);
    expect(html).toContain("<img");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain('alt="Bell curve"');
  });
});
