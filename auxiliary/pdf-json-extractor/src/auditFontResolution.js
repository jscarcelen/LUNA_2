import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadPdfForRawModel } from "./rawPageModel.js";
import { resolveFontResourcesForPage } from "./fontResolver.js";
import { ensureDir, parseArgs, readBinaryFile, resolveProjectPath, writeJson } from "./utils.js";

const outputDir = path.join(process.cwd(), "output");
const reportFile = path.join(outputDir, "font-resolution-report.json");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function summarize(entries = []) {
  const total = entries.length;
  const withObject = entries.filter((entry) => entry?.resolver?.available).length;
  const embeddedKnown = entries.filter((entry) => entry?.resolver?.details?.isEmbeddedFont !== null).length;
  const embeddedTrue = entries.filter((entry) => entry?.resolver?.details?.isEmbeddedFont === true).length;
  const unicodeKnown = entries.filter((entry) => entry?.resolver?.details?.unicodeMapping === true).length;
  const encodingKnown = entries.filter((entry) => Boolean(entry?.resolver?.details?.encoding)).length;
  const metricsAvailable = entries.filter((entry) => {
    const metrics = entry?.resolver?.details?.metrics || {};
    return Object.values(metrics).some((value) => value !== null);
  }).length;
  const bytesAvailable = entries.filter((entry) => entry?.resolver?.details?.fontDataAvailable).length;

  return {
    fonts: total,
    commonObjsResolved: withObject,
    embeddedKnown,
    embeddedTrue,
    unicodeMappingKnown: unicodeKnown,
    encodingKnown,
    metricsAvailable,
    fontBytesAvailable: bytesAvailable
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sourceFile = args.input ? path.resolve(process.cwd(), args.input) : DEFAULT_INPUT;

  await ensureDir(outputDir);

  const sourceBuffer = await readBinaryFile(sourceFile);
  const pdf = await loadPdfForRawModel(sourceBuffer);

  const entries = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent({ disableNormalization: false, includeMarkedContent: true });
    entries.push(...resolveFontResourcesForPage(page, textContent, pageNumber));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    sourceFile,
    summary: summarize(entries),
    limitations: [
      "commonObjs may expose decoded font programs but does not guarantee direct access to original embedded stream bytes.",
      "encoding fields can be absent for subset or synthesized fonts; this is an API visibility constraint, not data loss in raw preservation.",
      "font metrics are partial and depend on loaded font type and PDF.js internal loader path."
    ],
    fonts: entries
  };

  await writeJson(reportFile, report);
  console.log(JSON.stringify({ reportFile, summary: report.summary }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
