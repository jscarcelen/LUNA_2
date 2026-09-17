import path from "node:path";
import { readFile } from "node:fs/promises";
import { ensureDir, writeJson } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const rawFile = path.join(outputDir, "raw-pages.json");
const reportFile = path.join(outputDir, "font-audit.json");

async function main() {
  await ensureDir(outputDir);
  const raw = JSON.parse(await readFile(rawFile, "utf8"));

  const fonts = [];
  for (const page of raw?.pages || []) {
    for (const font of page.fonts || []) {
      fonts.push({
        page: page.pageNumber,
        fontName: font.fontName,
        family: font.family,
        subtype: font.subtype,
        embedded: font.embedded,
        unicodeMapping: font.unicodeMapping,
        customEncodingLikely: font.customEncodingLikely,
        fontDataAvailable: font.fontDataAvailable
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    fontCount: fonts.length,
    fonts
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify({ reportFile, fontCount: fonts.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
