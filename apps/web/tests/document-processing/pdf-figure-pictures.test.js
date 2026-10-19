import { readFileSync } from "fs";
import path from "path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { embedPdfFigures } from "../../modules/document-processing/parsers/aiVisionExtractor.js";
import { renderCanonicalDocumentToHtml } from "../../modules/document-processing/renderers/htmlRenderer.js";

// 4 slides (364×273 pt) with the same logo on each: 1 text only, 2 a vector line chart above two bullets,
// 3 three stacked vector bar charts, 4 an embedded photo.
const file = { name: "slides.pdf", contentBase64: readFileSync(path.join(__dirname, "fixtures/slides-with-charts.pdf")).toString("base64") };
const size = async (url) => sharp(Buffer.from(url.split(",")[1], "base64")).metadata();

describe("PDF figures become real pictures", () => {
  it("cuts drawn charts out of the page, keeps photos, skips the logo and hides the estimated chart", async () => {
    const blocks = [
      { type: "figure", alt_text: "Slide about averages", caption: "", page: 1 },
      { type: "figure", alt_text: "Line chart", caption: "", page: 2 },
      { type: "chart", chart: { type: "line", categories: ["0", "50"], series: [{ name: "a", values: [60, 25] }] }, page: 2 },
      { type: "figure", alt_text: "Three bar charts", caption: "", page: 3 },
      { type: "figure", alt_text: "A photo", caption: "", page: 4 }
    ];
    const out = await embedPdfFigures(file, blocks);
    const [text, line, chart, bars, photo] = out;
    for (const figure of [text, line, bars, photo]) expect(figure.image).toMatch(/^data:image\/jpeg;base64,/);
    // Text-only slide: nothing drawn to cut out, so the whole page (4:3) — never the logo.
    const whole = await size(text.image);
    expect(Math.abs(whole.width / whole.height - 364 / 273)).toBeLessThan(0.02);
    // The line chart is cut out with its labels but without the title bar and the bullets under it.
    const lineSize = await size(line.image);
    expect(lineSize.height / lineSize.width).toBeLessThan(0.85);
    expect(lineSize.width).toBeLessThan(1000);
    expect(chart.behind_picture).toBe(true);
    // The photo is the embedded picture itself.
    expect(await size(photo.image)).toMatchObject({ width: 600, height: 400 });

    const html = renderCanonicalDocumentToHtml({ metadata: { title: "Slides" }, sections: [{ blocks: out }] });
    expect(html).toContain("Line chart");
    expect(html).not.toContain("luna-chart");
    expect(html).not.toMatch(/<figcaption>Figure<\/figcaption>/);
  }, 60_000);
});
