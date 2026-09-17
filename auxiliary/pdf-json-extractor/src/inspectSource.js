import path from "node:path";
import { buildRawPdfPageModels, loadPdfForRawModel } from "./rawPageModel.js";
import { ensureDir, parseArgs, readBinaryFile, resolveProjectPath, writeJson } from "./utils.js";

const baseDir = process.cwd();
const outputDir = path.join(baseDir, "debug", "source");
const DEFAULT_INPUT = resolveProjectPath("..", "..", "Statistics.pdf");

function parsePageFlag(argv = []) {
  const idx = argv.findIndex((token) => token === "--page");
  if (idx < 0) return null;
  const value = Number(argv[idx + 1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

async function main() {
  const cliArgs = process.argv.slice(2);
  const args = parseArgs(cliArgs);
  const page = parsePageFlag(cliArgs);

  const sourceFile = args.input ? path.resolve(baseDir, args.input) : DEFAULT_INPUT;
  await ensureDir(outputDir);

  const sourceBuffer = await readBinaryFile(sourceFile);
  const pdf = await loadPdfForRawModel(sourceBuffer);

  const pages = await buildRawPdfPageModels(pdf, {
    startPage: page || 1,
    endPage: page || pdf.numPages
  });

  for (const rawPage of pages) {
    const name = `page-${String(rawPage.pageNumber).padStart(3, "0")}.json`;
    await writeJson(path.join(outputDir, name), rawPage);
  }

  console.log(JSON.stringify({
    sourceFile,
    pagesDumped: pages.length,
    outputDir
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
