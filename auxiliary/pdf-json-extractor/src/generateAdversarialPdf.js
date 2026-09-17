import path from "node:path";
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ensureDir } from "./utils.js";

const inputDir = path.join(process.cwd(), "input");
const outputFile = path.join(inputDir, "adversarial.pdf");

function drawTable(page, originX, originY, colWidths, rowHeight, rows) {
  let y = originY;
  for (let row = 0; row <= rows; row += 1) {
    page.drawLine({ start: { x: originX, y }, end: { x: originX + colWidths.reduce((a, b) => a + b, 0), y }, thickness: 1, color: rgb(0.4, 0.4, 0.4) });
    y -= rowHeight;
  }
  let x = originX;
  for (let col = 0; col <= colWidths.length; col += 1) {
    page.drawLine({ start: { x, y: originY }, end: { x, y: originY - rows * rowHeight }, thickness: 1, color: rgb(0.4, 0.4, 0.4) });
    x += colWidths[col] || 0;
  }
}

async function main() {
  await ensureDir(inputDir);

  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const page1 = pdfDoc.addPage([595.28, 841.89]);
  page1.drawText("Fidelity Adversarial Test", { x: 60, y: 800, size: 20, font: fontBold, color: rgb(0.08, 0.08, 0.08) });
  page1.drawText("Header repeated in all pages", { x: 60, y: 782, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });

  page1.drawText("Typography matrix:", { x: 60, y: 740, size: 13, font: fontBold });
  page1.drawText("regular text", { x: 60, y: 720, size: 12, font: fontRegular });
  page1.drawText("bold text", { x: 160, y: 720, size: 12, font: fontBold });
  page1.drawText("italic text", { x: 250, y: 720, size: 12, font: fontItalic });
  page1.drawText("colored text", { x: 340, y: 720, size: 12, font: fontRegular, color: rgb(0.8, 0.1, 0.2) });
  page1.drawText("H", { x: 60, y: 690, size: 14, font: fontRegular });
  page1.drawText("2", { x: 70, y: 685, size: 9, font: fontRegular });
  page1.drawText("O and x", { x: 77, y: 690, size: 14, font: fontRegular });
  page1.drawText("2", { x: 122, y: 698, size: 9, font: fontRegular });

  page1.drawText("Display-like formulas:", { x: 60, y: 650, size: 12, font: fontBold });
  page1.drawText("x_bar = (sum_i^n (x_i - mu)^2) / n", { x: 90, y: 628, size: 13, font: fontRegular });
  page1.drawText("int_0^1 x^2 dx = 1/3", { x: 90, y: 608, size: 13, font: fontRegular });

  drawTable(page1, 60, 560, [120, 120, 120], 26, 4);
  page1.drawText("Q1", { x: 75, y: 541, size: 11, font: fontBold });
  page1.drawText("Q2", { x: 195, y: 541, size: 11, font: fontBold });
  page1.drawText("Q3", { x: 315, y: 541, size: 11, font: fontBold });
  page1.drawText("10", { x: 80, y: 515, size: 11, font: fontRegular });
  page1.drawText("20", { x: 200, y: 515, size: 11, font: fontRegular });
  page1.drawText("30", { x: 320, y: 515, size: 11, font: fontRegular });

  page1.drawText("1) Ordered list item", { x: 60, y: 450, size: 12, font: fontRegular });
  page1.drawText("2) Second ordered item", { x: 60, y: 430, size: 12, font: fontRegular });
  page1.drawText("• Bullet item", { x: 60, y: 410, size: 12, font: fontRegular });

  page1.drawRectangle({ x: 430, y: 430, width: 100, height: 70, borderWidth: 1, borderColor: rgb(0.3, 0.3, 0.3), color: rgb(0.95, 0.95, 0.85) });
  page1.drawText("Image box", { x: 452, y: 462, size: 10, font: fontRegular });
  page1.drawText("Page 1", { x: 280, y: 24, size: 10, font: fontRegular });

  const page2 = pdfDoc.addPage([595.28, 841.89]);
  page2.drawText("Header repeated in all pages", { x: 60, y: 782, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page2.drawText("Two-column layout test", { x: 60, y: 750, size: 15, font: fontBold });
  for (let i = 0; i < 12; i += 1) {
    page2.drawText(`L${i + 1} left column text block with mixed spacing and symbols alpha_${i}.`, { x: 60, y: 720 - i * 22, size: 11, font: fontRegular });
    page2.drawText(`R${i + 1} right column text block with x^2 and beta_${i}.`, { x: 320, y: 720 - i * 22, size: 11, font: fontRegular });
  }
  page2.drawText("Page 2", { x: 280, y: 24, size: 10, font: fontRegular });

  const page3 = pdfDoc.addPage([595.28, 841.89]);
  page3.drawText("Header repeated in all pages", { x: 60, y: 782, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) });
  page3.drawText("Footer and caption stress test", { x: 60, y: 740, size: 14, font: fontBold });
  page3.drawRectangle({ x: 110, y: 520, width: 380, height: 160, borderWidth: 1, borderColor: rgb(0.25, 0.25, 0.25), color: rgb(0.9, 0.94, 0.99) });
  page3.drawText("Diagram placeholder", { x: 238, y: 600, size: 12, font: fontRegular });
  page3.drawText("Figure 1: Demonstration caption under floating graphic", { x: 130, y: 500, size: 11, font: fontItalic });
  page3.drawText("Section footer unique note", { x: 60, y: 52, size: 9, font: fontItalic, color: rgb(0.25, 0.25, 0.25) });
  page3.drawText("Page 3", { x: 280, y: 24, size: 10, font: fontRegular });

  const bytes = await pdfDoc.save();
  await writeFile(outputFile, bytes);

  console.log(JSON.stringify({ outputFile, pageCount: pdfDoc.getPageCount() }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
