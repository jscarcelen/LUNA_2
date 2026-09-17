import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ensureDir } from "./utils.js";
import { writeFile } from "node:fs/promises";

const inputDir = path.join(process.cwd(), "input");
const outputFile = path.join(inputDir, "sample.pdf");

async function main() {
  await ensureDir(inputDir);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);

  const titleFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText("LUNA PDF Extraction Sample", {
    x: 72,
    y: 730,
    size: 24,
    font: titleFont,
    color: rgb(0.1, 0.1, 0.1)
  });

  const lines = [
    "This fixture validates PDF to JSON extraction and HTML plotting.",
    "The parser keeps text coordinates per page and builds semantic blocks.",
    "When this looks good, we can wire the same logic into the web pipeline."
  ];

  for (let index = 0; index < lines.length; index += 1) {
    page.drawText(lines[index], {
      x: 72,
      y: 680 - index * 24,
      size: 13,
      font: bodyFont,
      color: rgb(0.15, 0.15, 0.15)
    });
  }

  const bytes = await pdfDoc.save();
  await writeFile(outputFile, bytes);

  console.log(JSON.stringify({
    outputFile,
    pageCount: pdfDoc.getPageCount()
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
