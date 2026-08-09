import path from "node:path";
import { ensureDir, resolveProjectPath, writeJson, readDocxZip } from "./utils.js";
import { parseDocument } from "./parseDocument.js";

const baseDir = process.cwd();
const inputFile = resolveProjectPath("..", "..", "Statistics.docx");
const outputDir = path.join(baseDir, "output");
const assetsDir = path.join(outputDir, "assets");
const outputFile = path.join(outputDir, "statistics.json");
const summaryFile = path.join(outputDir, "statistics.summary.json");

async function main() {
  await ensureDir(outputDir);
  await ensureDir(assetsDir);

  const zip = await readDocxZip(inputFile);
  const { documentTree, summary } = await parseDocument(zip, { assetsDir });

  await writeJson(outputFile, documentTree);
  await writeJson(summaryFile, summary);

  console.log(JSON.stringify({
    outputFile,
    summaryFile,
    statistics: documentTree.statistics,
    warnings: documentTree.diagnostics.warnings.length,
    unsupportedElements: documentTree.diagnostics.unsupportedElements.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});